/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Exercises the status file commands end-to-end through the real installed binary
 * (and thus the daemon): add-status-file, remove-status-file, list-status-files and
 * fetch-status-file, plus the daemon endpoints the browser view uses.
 *
 * Publishing is CLI-only by design, and content arrives on stdin, so these drive the
 * real shell forms a CI system would use: redirect, pipe and heredoc.
 */

import { join } from 'path';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import {
  createTestEnvironment, installSparkle, initializeSparkle, getTarballPath,
  createTestId, cleanupEnvironment, stopAllDaemonsUnder
} from '../helpers/test-helpers.js';

const execAsync = promisify(execCallback);

describe('Status file CLI (through the daemon)', () => {
  const baseDir = join(process.cwd(), '.integration_testing', 'cli-status-files');
  const ctx = {};

  /** Run the installed CLI with --json and return the parsed object. */
  const cli = async (args) => {
    const { stdout } = await execAsync(`node ${ctx.cliPath} ${args} --json`, { cwd: ctx.clone });
    const out = stdout.trim();
    try { return JSON.parse(out); } catch { return out; }
  };

  /** Run the installed CLI raw (no --json), returning stdout verbatim. */
  const cliRaw = async (args, options = {}) =>
    (await execAsync(`node ${ctx.cliPath} ${args}`, { cwd: ctx.clone, ...options })).stdout;

  /**
   * Run a command that is expected to FAIL, and return what the user would actually see.
   * The CLI reports errors on stdout/stderr and exits non-zero, so the thrown error's
   * own message says only "Command failed" — the useful text is in the streams.
   * @returns {Promise<{code: number, output: string}>}
   */
  const cliExpectFailure = async (args) => {
    try {
      const { stdout } = await execAsync(`node ${ctx.cliPath} ${args} --json`, { cwd: ctx.clone });
      throw new Error(`Expected '${args}' to fail, but it succeeded: ${stdout}`);
    } catch (error) {
      if (typeof error.code !== 'number') throw error; // our own assertion above
      return { code: error.code, output: `${error.stdout || ''}${error.stderr || ''}` };
    }
  };

  /** Publish content via stdin, exactly as a CI system would. */
  const publish = async (name, content) => {
    const source = join(ctx.clone, 'payload.tmp');
    await writeFile(source, content, 'utf8');
    return execAsync(`node ${ctx.cliPath} add-status-file ${name} --json < payload.tmp`, {
      cwd: ctx.clone,
      shell: '/bin/bash'
    });
  };

  beforeAll(async () => {
    const env = await createTestEnvironment(baseDir, 'cli-status-files', 1, createTestId());
    ctx.env = env;
    ctx.clone = env.clones[0];
    await installSparkle(ctx.clone, await getTarballPath());
    await initializeSparkle(ctx.clone);
    ctx.cliPath = join(ctx.clone, 'node_modules/sparkle/bin/sparkle.js');
    ctx.statusDir = join(ctx.clone, '.sparkle-worktree', 'sparkle-data', 'status');
  }, 240000);

  afterAll(async () => {
    await stopAllDaemonsUnder(baseDir);
    if (ctx.env) await cleanupEnvironment(ctx.env.testDir);
  }, 60000);

  test('list-status-files is empty before anything is published', async () => {
    const res = await cli('list-status-files');
    expect(res.files).toEqual([]);
  });

  test('add-status-file publishes content from a redirect', async () => {
    const { stdout } = await publish('build-report.json', '{"build":"green"}\n');
    expect(JSON.parse(stdout.trim())).toMatchObject({
      success: true, name: 'build-report.json', created: true
    });
  });

  test('the published file lands in the sparkle worktree', async () => {
    expect(existsSync(join(ctx.statusDir, 'build-report.json'))).toBe(true);
    expect(await readFile(join(ctx.statusDir, 'build-report.json'), 'utf8'))
      .toBe('{"build":"green"}\n');
  });

  test('list-status-files reports name, size and modified time', async () => {
    const res = await cli('list-status-files');
    const entry = res.files.find(f => f.name === 'build-report.json');

    expect(entry).toBeDefined();
    expect(entry.size).toBe('{"build":"green"}\n'.length);
    expect(isNaN(new Date(entry.modified).getTime())).toBe(false);
  });

  test('fetch-status-file returns the published bytes exactly', async () => {
    // Not reparsed/reformatted: a .json report must survive byte-for-byte.
    expect(await cliRaw('fetch-status-file build-report.json')).toBe('{"build":"green"}\n');
  });

  test('add-status-file accepts a heredoc', async () => {
    const heredoc = `node ${ctx.cliPath} add-status-file notes.txt --json <<'EOF'\nall green\nEOF\n`;
    const { stdout } = await execAsync(heredoc, { cwd: ctx.clone, shell: '/bin/bash' });

    expect(JSON.parse(stdout.trim()).created).toBe(true);
    expect(await cliRaw('fetch-status-file notes.txt')).toBe('all green\n');
  });

  test('add-status-file accepts a pipe', async () => {
    const piped = `echo '{"piped":true}' | node ${ctx.cliPath} add-status-file piped.json --json`;
    await execAsync(piped, { cwd: ctx.clone, shell: '/bin/bash' });

    expect(await cliRaw('fetch-status-file piped.json')).toBe('{"piped":true}\n');
  });

  test('re-publishing replaces content wholesale and reports created:false', async () => {
    const { stdout } = await publish('build-report.json', '{"build":"RED"}\n');

    expect(JSON.parse(stdout.trim()).created).toBe(false);
    expect(await cliRaw('fetch-status-file build-report.json')).toBe('{"build":"RED"}\n');
  });

  test('a published status file is committed to git', async () => {
    const worktree = join(ctx.clone, '.sparkle-worktree');
    const { stdout } = await execAsync('git log --name-only --format= -20', { cwd: worktree });
    expect(stdout).toMatch(/sparkle-data\/status\/build-report\.json/);
  });

  test('the status merge rule is committed, so clones never blend reports', async () => {
    const worktree = join(ctx.clone, '.sparkle-worktree');
    const { stdout } = await execAsync('git ls-files sparkle-data/.gitattributes', { cwd: worktree });
    expect(stdout.trim()).toBe('sparkle-data/.gitattributes');

    const attributes = await readFile(join(worktree, 'sparkle-data', '.gitattributes'), 'utf8');
    expect(attributes).toMatch(/status\/\*\* -merge -diff/);
  });

  test('add-status-file rejects a sub-directory with a clear message', async () => {
    const { code, output } = await cliExpectFailure('add-status-file ci/build.json');

    expect(code).not.toBe(0);
    expect(output).toMatch(/path separator/i);
    expect(output).toMatch(/sub-directories are not supported/i);
  });

  test('add-status-file rejects traversal', async () => {
    const { code, output } = await cliExpectFailure('add-status-file ../escape.txt');

    expect(code).not.toBe(0);
    expect(output).toMatch(/path separator/i);
    expect(existsSync(join(ctx.clone, '.sparkle-worktree', 'sparkle-data', 'escape.txt'))).toBe(false);
  });

  test('remove-status-file removes a published file', async () => {
    const res = await cli('remove-status-file piped.json');
    expect(res.success).toBe(true);

    const list = await cli('list-status-files');
    expect(list.files.map(f => f.name)).not.toContain('piped.json');
    expect(existsSync(join(ctx.statusDir, 'piped.json'))).toBe(false);
  });

  test('the removal is committed to git', async () => {
    const worktree = join(ctx.clone, '.sparkle-worktree');
    const { stdout } = await execAsync('git ls-files sparkle-data/status', { cwd: worktree });
    expect(stdout).not.toMatch(/piped\.json/);
  });

  test('remove-status-file errors on a file that was never published', async () => {
    const { code, output } = await cliExpectFailure('remove-status-file never-existed.txt');

    expect(code).not.toBe(0);
    expect(output).toMatch(/not found/i);
  });

  test('remove-status-file errors on an already-removed file', async () => {
    const { code, output } = await cliExpectFailure('remove-status-file piped.json');

    expect(code).not.toBe(0);
    expect(output).toMatch(/not found/i);
  });

  test('fetch-status-file errors on an unknown name', async () => {
    const { code, output } = await cliExpectFailure('fetch-status-file nope.txt');

    expect(code).not.toBe(0);
    expect(output).toMatch(/not found/i);
  });
});
