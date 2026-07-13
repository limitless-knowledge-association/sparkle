#!/usr/bin/env node

/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Prepare TEST Distribution Package
 *
 * Like prepare-distribution.js, but builds the tarball from the CURRENT WORKING TREE
 * (including uncommitted changes) at a fixed test version, so the edit -> test loop
 * does NOT require committing / releasing / a clean working tree.
 *
 * Differences from prepare-distribution.js:
 *   - Packs the working tree (copies the `files` whitelist) instead of `git worktree add HEAD`.
 *   - Uses a fixed version (0.0.0-test) so the tarball name is deterministic and never
 *     collides with or mutates the real published version.
 *   - No `npm version`, no git commit, no git tag. Working tree is left untouched.
 *
 * Output: sparkle-0.0.0-test.tgz in the repo root.
 */

import { readFile, writeFile, rm, mkdir, cp, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = join(__dirname, '..');
const BUILD_DIR = join(ROOT_DIR, '.build-test');
const PACKAGE_JSON_PATH = join(ROOT_DIR, 'package.json');

// Fixed version so the tarball name is deterministic and can never be confused
// with a real release. Exported name is consumed by the test harness.
export const TEST_VERSION = '0.0.0-test';
export const TEST_TARBALL = `sparkle-${TEST_VERSION}.tgz`;

async function main() {
  console.log('📦 Building TEST distribution package (working tree, no commit needed)...\n');

  // Step 1: Clean any previous build dir
  if (existsSync(BUILD_DIR)) {
    await rm(BUILD_DIR, { recursive: true, force: true });
  }
  await mkdir(BUILD_DIR, { recursive: true });

  // Step 2: Read the product manifest (single source of truth for the shipped
  // package.json — the same file prepare-distribution.js uses).
  const distManifest = JSON.parse(await readFile(join(ROOT_DIR, 'package.dist.json'), 'utf8'));

  // Step 3: Copy the `files` whitelist from the WORKING TREE into the build dir.
  // npm pack would honor `files` anyway; copying first keeps the real working tree
  // pristine when bake-version / generate-primary-views write generated files.
  const whitelist = distManifest.files || ['src/', 'bin/', 'public/'];
  for (const entry of whitelist) {
    const clean = entry.replace(/\/$/, '');
    const src = join(ROOT_DIR, clean);
    if (!existsSync(src)) {
      console.warn(`   (skipping missing ${entry})`);
      continue;
    }
    await cp(src, join(BUILD_DIR, clean), { recursive: true });
  }
  console.log(`✅ Copied working tree (${whitelist.length} entries) into .build-test/`);

  // Step 4: Write the distribution package.json at the fixed test version (manifest + version).
  const distPkg = { name: distManifest.name, version: TEST_VERSION, ...distManifest };
  await writeFile(join(BUILD_DIR, 'package.json'), JSON.stringify(distPkg, null, 2) + '\n', 'utf8');
  console.log(`✅ Wrote clean package.json (version ${TEST_VERSION})`);

  // Step 5: Generate version.js / primaryViews.js INSIDE the build dir.
  // These scripts resolve paths from their own __dirname, so running the copies in
  // .build-test writes into .build-test (not the real working tree).
  console.log('🔨 Generating version.js and primaryViews.js...');
  await execAsync('node bin/bake-version.js', { cwd: BUILD_DIR });
  await execAsync('node bin/generate-primary-views.js', { cwd: BUILD_DIR });
  console.log('✅ Generated build artifacts\n');

  // Step 6: npm pack in the build dir
  console.log('📦 Running npm pack...');
  const { stdout } = await execAsync('npm pack', { cwd: BUILD_DIR });
  const tarballName = stdout.trim().split('\n').pop().trim();

  // Step 7: Move tarball to repo root under the deterministic test name
  const sourceTarball = join(BUILD_DIR, tarballName);
  const destTarball = join(ROOT_DIR, TEST_TARBALL);
  if (existsSync(destTarball)) {
    await rm(destTarball);
  }
  await copyFile(sourceTarball, destTarball);
  console.log(`✅ ${TEST_TARBALL} ready at repo root\n`);

  // Step 8: Clean up build dir
  await rm(BUILD_DIR, { recursive: true, force: true });

  console.log('✅ Test distribution package ready!');
  console.log('📝 Working tree untouched (no commit / no version bump).');
}

// Allow use as both a CLI (node bin/prepare-test-distribution.js) and an import
// (jest globalSetup calls buildTestTarball()).
export async function buildTestTarball() {
  await main();
  return join(ROOT_DIR, TEST_TARBALL);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch(async (error) => {
    console.error('\n❌ Error preparing test distribution:', error.message);
    if (existsSync(BUILD_DIR)) {
      await rm(BUILD_DIR, { recursive: true, force: true }).catch(() => {});
    }
    process.exit(1);
  });
}
