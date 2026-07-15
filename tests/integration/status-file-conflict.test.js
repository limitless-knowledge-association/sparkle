/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Status file git behaviour across clones.
 *
 * Status files are the only mutable, non-uniquely-named thing Sparkle commits, so they
 * are the only thing that can genuinely conflict. These tests pin down the two hazards
 * that were measured before the feature was built:
 *
 *   1. An unresolved conflict leaves the worktree mid-merge, and git then refuses EVERY
 *      subsequent commit — freezing ordinary item writes, not just status files.
 *   2. Without the .gitattributes rule, two clones editing different lines of the same
 *      report merge cleanly into a hybrid neither publisher ever emitted.
 *
 * These drive real git against real clones; no daemon and no install are involved.
 */

import { jest } from '@jest/globals';
import { join } from 'path';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { execAsync } from '../../src/execUtils.js';
import { GitOperations } from '../../src/GitOperations.js';
import { addStatusFile, removeStatusFile } from '../../src/controllers/statusFileController.js';
import { unit_test_setup } from '../helpers/test-helpers.js';

jest.setTimeout(60000);

let testDir;
let bareRepo;
let cloneA;
let cloneB;

/** Data dir inside a clone, mirroring the real worktree layout. */
const dataDir = (clone) => join(clone, 'sparkle-data');

async function commitAll(clone, message) {
  await execAsync('git add -A', { cwd: clone });
  await execAsync(`git commit -m "${message}"`, { cwd: clone });
}

beforeEach(async () => {
  testDir = await unit_test_setup('status-file-conflict.test.js', 'status conflict');
  bareRepo = join(testDir, 'repo.git');
  cloneA = join(testDir, 'cloneA');
  cloneB = join(testDir, 'cloneB');

  await execAsync(`git init --bare -b main "${bareRepo}"`);
  await execAsync(`git clone "${bareRepo}" "${cloneA}"`);

  for (const [clone, n] of [[cloneA, 'A'], [cloneB, 'B']]) {
    if (clone === cloneB) await execAsync(`git clone "${bareRepo}" "${cloneB}"`);
    await execAsync(`git config user.name "Test ${n}"`, { cwd: clone });
    await execAsync(`git config user.email "test${n}@example.com"`, { cwd: clone });
  }

  // Seed: one item event plus the status merge rule, pushed so both clones share it.
  await mkdir(dataDir(cloneA), { recursive: true });
  await writeFile(join(dataDir(cloneA), 'item1.json'), '{"id":"item1"}', 'utf8');
  await new GitOperations(cloneA).ensureStatusMergeRule();
  await addStatusFile(dataDir(cloneA), 'ci.json', '{\n  "build": "green",\n  "deploy": "green"\n}\n');
  await commitAll(cloneA, 'seed');
  await execAsync('git push -u origin main', { cwd: cloneA });
  await execAsync('git pull origin main', { cwd: cloneB });
});

describe('ensureStatusMergeRule', () => {
  it('writes the rule that stops git merging published reports', async () => {
    const attributes = await readFile(join(dataDir(cloneA), '.gitattributes'), 'utf8');
    expect(attributes).toMatch(/status\/\*\* -merge -diff/);
  });

  it('is idempotent and does not duplicate the rule', async () => {
    const gitOps = new GitOperations(cloneA);
    await gitOps.ensureStatusMergeRule();
    await gitOps.ensureStatusMergeRule();

    const attributes = await readFile(join(dataDir(cloneA), '.gitattributes'), 'utf8');
    expect(attributes.match(/status\/\*\* -merge -diff/g)).toHaveLength(1);
  });

  it('preserves an existing .gitattributes', async () => {
    const attributesPath = join(dataDir(cloneB), '.gitattributes');
    await writeFile(attributesPath, '*.bin binary', 'utf8');
    await new GitOperations(cloneB).ensureStatusMergeRule();

    const attributes = await readFile(attributesPath, 'utf8');
    expect(attributes).toMatch(/\*\.bin binary/);
    expect(attributes).toMatch(/status\/\*\* -merge -diff/);
  });
});

describe('concurrent status publishing across clones', () => {
  it('never fabricates a blended report, and the remote copy wins', async () => {
    // A reports the build broke. B reports the deploy broke. Different lines: without
    // the merge rule git would silently produce a report showing BOTH.
    await addStatusFile(dataDir(cloneA), 'ci.json', '{\n  "build": "RED-from-A",\n  "deploy": "green"\n}\n');
    await commitAll(cloneA, 'A publishes');
    await execAsync('git push origin main', { cwd: cloneA });

    await addStatusFile(dataDir(cloneB), 'ci.json', '{\n  "build": "green",\n  "deploy": "RED-from-B"\n}\n');
    await commitAll(cloneB, 'B publishes');

    const result = await new GitOperations(cloneB).syncAndPush();
    expect(result.pushed).toBe(true);

    const content = await readFile(join(dataDir(cloneB), 'status', 'ci.json'), 'utf8');

    // Byte-identical to what A published — not a merge of the two.
    expect(content).toBe('{\n  "build": "RED-from-A",\n  "deploy": "green"\n}\n');
    expect(content).not.toMatch(/RED-from-B/);
    expect(content).not.toMatch(/<<<<<<<|>>>>>>>|=======/);
  });

  it('keeps committing unrelated item events after a status conflict', async () => {
    // The regression that matters: an unresolved conflict freezes ALL commits.
    await addStatusFile(dataDir(cloneA), 'ci.json', '{"from":"A"}\n');
    await commitAll(cloneA, 'A publishes');
    await execAsync('git push origin main', { cwd: cloneA });

    await addStatusFile(dataDir(cloneB), 'ci.json', '{"from":"B"}\n');
    await commitAll(cloneB, 'B publishes');

    const gitOps = new GitOperations(cloneB);
    await gitOps.syncAndPush();

    // An ordinary item event must still commit and push.
    await writeFile(join(dataDir(cloneB), 'item2.json'), '{"id":"item2"}', 'utf8');
    const commit = await gitOps.commit();
    expect(commit.committed).toBe(true);

    const { stdout } = await execAsync('git log -1 --name-only --format=', { cwd: cloneB });
    expect(stdout).toMatch(/item2\.json/);

    const push = await gitOps.syncAndPush();
    expect(push.pushed).toBe(true);
  });

  it('leaves no unmerged paths behind', async () => {
    await addStatusFile(dataDir(cloneA), 'ci.json', '{"from":"A"}\n');
    await commitAll(cloneA, 'A publishes');
    await execAsync('git push origin main', { cwd: cloneA });

    await addStatusFile(dataDir(cloneB), 'ci.json', '{"from":"B"}\n');
    await commitAll(cloneB, 'B publishes');
    await new GitOperations(cloneB).syncAndPush();

    const { stdout } = await execAsync('git diff --name-only --diff-filter=U', { cwd: cloneB });
    expect(stdout.trim()).toBe('');
    expect(existsSync(join(cloneB, '.git', 'MERGE_HEAD'))).toBe(false);
  });

  it('refuses to auto-resolve a conflict outside the status directory', async () => {
    // Impossible by design (item events have unique names), so if it ever happens an
    // assumption has broken and we must not guess.
    const shared = join(dataDir(cloneA), 'shared.json');
    await writeFile(shared, '{"v":"A"}', 'utf8');
    await commitAll(cloneA, 'A writes shared');
    await execAsync('git push origin main', { cwd: cloneA });

    await writeFile(join(dataDir(cloneB), 'shared.json'), '{"v":"B"}', 'utf8');
    await commitAll(cloneB, 'B writes shared');

    const errors = [];
    const spy = jest.spyOn(console, 'error').mockImplementation(m => errors.push(String(m)));
    try {
      await new GitOperations(cloneB).syncAndPush();
    } finally {
      spy.mockRestore();
    }

    expect(errors.join('\n')).toMatch(/outside the status directory/i);
    // The conflict is still there, untouched, rather than silently resolved.
    const { stdout } = await execAsync('git diff --name-only --diff-filter=U', { cwd: cloneB });
    expect(stdout).toMatch(/shared\.json/);
  });
});

describe('commit staging', () => {
  it('commits a newly published status file', async () => {
    await addStatusFile(dataDir(cloneA), 'new-report.txt', 'hello');
    const result = await new GitOperations(cloneA).commit();

    expect(result.committed).toBe(true);
    const { stdout } = await execAsync('git log -1 --name-only --format=', { cwd: cloneA });
    expect(stdout).toMatch(/new-report\.txt/);
  });

  it('commits a status file REMOVAL', async () => {
    // The old shell-globbed `sparkle-data/*.json` pathspec could never stage a
    // deletion, so remove-status-file would have silently never committed.
    await removeStatusFile(dataDir(cloneA), 'ci.json');
    const result = await new GitOperations(cloneA).commit();

    expect(result.committed).toBe(true);
    const { stdout } = await execAsync('git log -1 --name-only --format=', { cwd: cloneA });
    expect(stdout).toMatch(/ci\.json/);

    const { stdout: tracked } = await execAsync('git ls-files sparkle-data/status', { cwd: cloneA });
    expect(tracked.trim()).toBe('');
  });

  it('propagates a removal to the other clone', async () => {
    await removeStatusFile(dataDir(cloneA), 'ci.json');
    await new GitOperations(cloneA).commit();
    await execAsync('git push origin main', { cwd: cloneA });

    await execAsync('git pull origin main', { cwd: cloneB });
    expect(existsSync(join(dataDir(cloneB), 'status', 'ci.json'))).toBe(false);
  });
});

describe('fetchUpdates (the periodic fetch path)', () => {
  // The daemon's periodic fetch does NOT go through GitOperations.syncAndPush — it calls
  // gitBranchOps.fetchUpdates, which merges independently. That is the path most likely
  // to meet a real conflict, since it is how one clone learns about another's work.
  it('resolves a status conflict instead of wedging the worktree', async () => {
    await addStatusFile(dataDir(cloneA), 'ci.json', '{"from":"A"}\n');
    await commitAll(cloneA, 'A publishes');
    await execAsync('git push origin main', { cwd: cloneA });

    await addStatusFile(dataDir(cloneB), 'ci.json', '{"from":"B"}\n');
    await commitAll(cloneB, 'B publishes');

    const { fetchUpdates } = await import('../../src/gitBranchOps.js');
    await expect(fetchUpdates(cloneB)).resolves.toMatchObject({ changed: true });

    // Remote won, byte-intact, and nothing is left unmerged.
    expect(await readFile(join(dataDir(cloneB), 'status', 'ci.json'), 'utf8')).toBe('{"from":"A"}\n');
    const { stdout } = await execAsync('git diff --name-only --diff-filter=U', { cwd: cloneB });
    expect(stdout.trim()).toBe('');
  });

  it('leaves the worktree able to commit afterwards', async () => {
    await addStatusFile(dataDir(cloneA), 'ci.json', '{"from":"A"}\n');
    await commitAll(cloneA, 'A publishes');
    await execAsync('git push origin main', { cwd: cloneA });

    await addStatusFile(dataDir(cloneB), 'ci.json', '{"from":"B"}\n');
    await commitAll(cloneB, 'B publishes');

    const { fetchUpdates } = await import('../../src/gitBranchOps.js');
    await fetchUpdates(cloneB);

    await writeFile(join(dataDir(cloneB), 'item9.json'), '{"id":"item9"}', 'utf8');
    const result = await new GitOperations(cloneB).commit();
    expect(result.committed).toBe(true);
  });

  it('still surfaces a conflict outside the status directory', async () => {
    await writeFile(join(dataDir(cloneA), 'shared.json'), '{"v":"A"}', 'utf8');
    await commitAll(cloneA, 'A writes shared');
    await execAsync('git push origin main', { cwd: cloneA });

    await writeFile(join(dataDir(cloneB), 'shared.json'), '{"v":"B"}', 'utf8');
    await commitAll(cloneB, 'B writes shared');

    const { fetchUpdates } = await import('../../src/gitBranchOps.js');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(fetchUpdates(cloneB)).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('recoverFromInterruptedMerge', () => {
  it('is a no-op on a clean worktree', async () => {
    await expect(new GitOperations(cloneA).recoverFromInterruptedMerge()).resolves.toBe(true);
  });

  it('resolves a worktree left mid-merge by a killed daemon', async () => {
    await addStatusFile(dataDir(cloneA), 'ci.json', '{"from":"A"}\n');
    await commitAll(cloneA, 'A publishes');
    await execAsync('git push origin main', { cwd: cloneA });

    await addStatusFile(dataDir(cloneB), 'ci.json', '{"from":"B"}\n');
    await commitAll(cloneB, 'B publishes');

    // Simulate the daemon dying mid-merge: pull conflicts, nothing resolves it.
    await execAsync('git fetch origin', { cwd: cloneB });
    await execAsync('git pull --no-rebase --no-edit origin main', { cwd: cloneB }).catch(() => {});
    expect(existsSync(join(cloneB, '.git', 'MERGE_HEAD'))).toBe(true);

    await expect(new GitOperations(cloneB).recoverFromInterruptedMerge()).resolves.toBe(true);

    const { stdout } = await execAsync('git diff --name-only --diff-filter=U', { cwd: cloneB });
    expect(stdout.trim()).toBe('');
    expect(await readFile(join(dataDir(cloneB), 'status', 'ci.json'), 'utf8')).toBe('{"from":"A"}\n');
  });
});
