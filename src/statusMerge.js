/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Status file merge policy — the one place that decides what happens when two clones
 * publish the same status file.
 *
 * Sparkle has two independent merge paths (GitOperations.syncAndPush on the way out,
 * gitBranchOps.fetchUpdates on the periodic fetch). Both can hit a status conflict, and
 * an unresolved one is not a local problem: git refuses EVERY subsequent commit while a
 * path is unmerged, so ordinary item writes stop too. This module exists so both paths
 * share one policy rather than drifting apart.
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { execAsync } from './execUtils.js';

/** Status files, as a path relative to the worktree root. */
export const STATUS_DIR_PATH = 'sparkle-data/status';

/**
 * Git must never attempt a textual merge of a published status file.
 *
 * Without this, two clones updating DIFFERENT LINES of the same report merge cleanly
 * and silently into a hybrid that neither publisher ever emitted — e.g. one CI reports
 * `build: RED`, another reports `deploy: RED`, and the merge invents a report showing
 * both. That is far worse than a conflict, because nothing surfaces it.
 *
 * `-merge` makes any concurrent change a conflict (which we resolve remote-wins) and,
 * critically, stops git writing conflict markers into a published artifact.
 * `-diff` keeps these treated as opaque blobs.
 */
export const STATUS_GITATTRIBUTES_RULE = 'status/** -merge -diff';

/**
 * Paths with an unresolved merge conflict.
 * @param {string} worktreePath - Worktree root
 * @returns {Promise<Array<string>>} Repo-relative paths, empty when not mid-merge
 */
export async function unmergedPaths(worktreePath) {
  try {
    const { stdout } = await execAsync('git diff --name-only --diff-filter=U', {
      cwd: worktreePath
    });
    return stdout.split('\n').map(line => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Resolve a conflicted merge, if the only conflicts are published status files.
 *
 * Status files are published artifacts, not collaborative documents: the remote's copy
 * simply wins, exactly as if our write had been overwritten before it committed. Losing
 * an unpushed local status update is acceptable — stale status is not a serious failure,
 * and a fabricated one would be.
 *
 * A conflict anywhere else is impossible by design (every other sparkle write is an
 * append-only file with a unique name), so it means an assumption has broken: leave the
 * worktree untouched and say so loudly rather than guess.
 *
 * @param {string} worktreePath - Worktree root
 * @returns {Promise<{resolved: boolean, paths: Array<string>}>} resolved is true when
 *   the worktree is left free of conflicts (including when there were none)
 */
export async function resolveStatusConflicts(worktreePath) {
  const unmerged = await unmergedPaths(worktreePath);
  if (unmerged.length === 0) return { resolved: true, paths: [] };

  const foreign = unmerged.filter(path => !path.startsWith(`${STATUS_DIR_PATH}/`));
  if (foreign.length > 0) {
    console.error(
      '[statusMerge] Unresolved merge conflict outside the status directory: ' +
      `${foreign.join(', ')}. Refusing to auto-resolve; commits are blocked until this ` +
      'is fixed by hand.'
    );
    return { resolved: false, paths: unmerged };
  }

  for (const path of unmerged) {
    // --theirs is the remote side of an in-progress merge.
    await execAsync(`git checkout --theirs -- "${path}"`, { cwd: worktreePath });
    await execAsync(`git add -- "${path}"`, { cwd: worktreePath });
    console.log(`[statusMerge] Status conflict on ${path}: took remote copy`);
  }

  await execAsync(
    'git commit --no-edit -m "Auto-resolve status file conflict (remote wins)"',
    { cwd: worktreePath }
  );
  console.log(`[statusMerge] Resolved ${unmerged.length} status conflict(s)`);

  return { resolved: true, paths: unmerged };
}

/**
 * Write the status merge rule into the worktree if absent, preserving any existing
 * .gitattributes content. Does not commit — the caller decides when that happens.
 *
 * The rule must exist in EVERY clone, so it is a committed file rather than local git
 * config. Sparkle branches created before status files existed will not have it.
 *
 * @param {string} worktreePath - Worktree root
 * @returns {Promise<boolean>} True if the file was changed (and so needs committing)
 */
export async function writeStatusMergeRule(worktreePath) {
  const attributesPath = join(worktreePath, 'sparkle-data', '.gitattributes');

  let existing = '';
  try {
    existing = await readFile(attributesPath, 'utf8');
  } catch {
    // No .gitattributes yet — created below.
  }

  if (existing.split('\n').some(line => line.trim() === STATUS_GITATTRIBUTES_RULE)) {
    return false;
  }

  const needsNewline = existing.length > 0 && !existing.endsWith('\n');
  const updated = existing + (needsNewline ? '\n' : '') + STATUS_GITATTRIBUTES_RULE + '\n';

  await writeFile(attributesPath, updated, 'utf8');
  return true;
}
