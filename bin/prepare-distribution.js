#!/usr/bin/env node

/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Prepare Distribution Package
 * Creates a clean distribution build by:
 * 1. Creating a git worktree clone in .build-dist/
 * 2. Replacing package.json with minimal version
 * 3. Running npm pack in the clone
 * 4. Moving the tarball to root
 * 5. Cleaning up the clone
 *
 * This approach never modifies the development package.json
 */

import { readFile, writeFile, rm, mkdir, copyFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = join(__dirname, '..');
const BUILD_DIR = join(ROOT_DIR, '.build-dist');
const PACKAGE_JSON_PATH = join(ROOT_DIR, 'package.json');

async function main() {
  console.log('📦 Building distribution package...\n');

  // Step 1: Clean up any previous build
  if (existsSync(BUILD_DIR)) {
    console.log('🧹 Cleaning previous build directory...');
    await rm(BUILD_DIR, { recursive: true, force: true });
  }

  // Step 2: Create git worktree (porcelain clone)
  console.log('📋 Creating git worktree clone...');
  try {
    await execAsync(`git worktree add ${BUILD_DIR} HEAD`, { cwd: ROOT_DIR });
    console.log('✅ Worktree created at .build-dist/\n');
  } catch (error) {
    throw new Error(`Failed to create git worktree: ${error.message}`);
  }

  // Step 3: Read the dev package.json (for the version) and the product manifest.
  // package.dist.json is the single source of truth for the SHIPPED package.json —
  // the dev package.json holds only build/test scripts + devDependencies.
  const devPkg = JSON.parse(await readFile(PACKAGE_JSON_PATH, 'utf8'));
  const distManifest = JSON.parse(await readFile(join(ROOT_DIR, 'package.dist.json'), 'utf8'));

  // Step 4: Compose the distribution package.json = product manifest + current version.
  const distPkg = { name: distManifest.name, version: devPkg.version, ...distManifest };

  // Step 5: Write clean package.json to build directory
  const buildPackageJsonPath = join(BUILD_DIR, 'package.json');
  await writeFile(buildPackageJsonPath, JSON.stringify(distPkg, null, 2) + '\n', 'utf8');
  console.log(`✅ Created clean package.json (version ${devPkg.version}) from package.dist.json`);
  console.log('');

  // Step 6: Generate version and primary views in build directory
  console.log('🔨 Generating version.js and primaryViews.js...');
  try {
    await execAsync('node bin/bake-version.js', { cwd: BUILD_DIR });
    await execAsync('node bin/generate-primary-views.js', { cwd: BUILD_DIR });
    console.log('✅ Generated build artifacts\n');
  } catch (error) {
    throw new Error(`Failed to generate build artifacts: ${error.message}`);
  }

  // Step 7: Run npm pack in build directory
  console.log('📦 Running npm pack in build directory...');
  try {
    const { stdout } = await execAsync('npm pack', { cwd: BUILD_DIR });
    const tarballName = stdout.trim();
    console.log(`✅ Created ${tarballName}\n`);

    // Step 8: Move tarball to root
    const sourceTarball = join(BUILD_DIR, tarballName);
    const destTarball = join(ROOT_DIR, tarballName);

    // Remove old tarball if it exists
    if (existsSync(destTarball)) {
      await rm(destTarball);
    }

    await copyFile(sourceTarball, destTarball);
    console.log(`✅ Moved ${tarballName} to root directory\n`);

  } catch (error) {
    throw new Error(`Failed to create tarball: ${error.message}`);
  }

  // Step 9: Clean up build directory
  console.log('🧹 Cleaning up build directory...');
  try {
    // Remove the worktree
    await execAsync(`git worktree remove ${BUILD_DIR} --force`, { cwd: ROOT_DIR });
    console.log('✅ Build directory cleaned up\n');
  } catch (error) {
    console.warn(`⚠️  Warning: Could not remove worktree: ${error.message}`);
    console.warn('   You may need to manually run: git worktree remove .build-dist --force');
  }

  console.log('✅ Distribution package ready!');
  console.log('📝 Development package.json unchanged');
}

main().catch(error => {
  console.error('\n❌ Error preparing distribution package:', error.message);

  // Attempt cleanup on error
  if (existsSync(BUILD_DIR)) {
    console.log('\n🧹 Attempting cleanup...');
    execAsync(`git worktree remove ${BUILD_DIR} --force`, { cwd: ROOT_DIR })
      .then(() => console.log('✅ Cleanup successful'))
      .catch(() => console.warn('⚠️  Manual cleanup needed: git worktree remove .build-dist --force'))
      .finally(() => process.exit(1));
  } else {
    process.exit(1);
  }
});
