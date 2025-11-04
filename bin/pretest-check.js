#!/usr/bin/env node

/**
 * Pre-test validation script
 * Ensures that:
 * 1. Git working directory is clean
 * 2. Tarball exists for current version
 * 3. Tarball is newer than package.json
 */

import { readFileSync, statSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

// Get package version
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const version = packageJson.version;
const tarballPath = join(process.cwd(), `sparkle-${version}.tgz`);

console.log('🔍 Pre-test validation...');

// Check 1: Git working directory is clean
try {
  const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
  if (gitStatus.trim() !== '') {
    console.error('\n❌ ERROR: Git working directory is not clean');
    console.error('   Please commit or stash your changes before running tests.\n');
    console.error('   Uncommitted changes:');
    console.error(gitStatus.split('\n').map(line => `   ${line}`).join('\n'));
    process.exit(1);
  }
  console.log('✅ Git working directory is clean');
} catch (error) {
  console.error('❌ ERROR: Failed to check git status');
  console.error(error.message);
  process.exit(1);
}

// Check 2: Tarball exists
if (!existsSync(tarballPath)) {
  console.error(`\n❌ ERROR: Tarball not found: ${tarballPath}`);
  console.error('   Please run: npm run release:rebuild\n');
  process.exit(1);
}
console.log(`✅ Tarball exists: sparkle-${version}.tgz`);

// Check 3: Tarball is newer than package.json
const tarballMtime = statSync(tarballPath).mtime;
const packageMtime = statSync('package.json').mtime;

if (tarballMtime < packageMtime) {
  console.error('\n❌ ERROR: Tarball is older than package.json');
  console.error(`   Tarball: ${tarballMtime.toISOString()}`);
  console.error(`   package.json: ${packageMtime.toISOString()}`);
  console.error('   Please run: npm run release:rebuild\n');
  process.exit(1);
}
console.log('✅ Tarball is up-to-date');

console.log('✅ Pre-test validation passed\n');
