/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Jest globalSetup - runs once before the whole test run.
 *
 * Builds the test distribution tarball (sparkle-0.0.0-test.tgz) from the CURRENT
 * WORKING TREE so tests exercise uncommitted changes without requiring a release
 * or a clean git tree. Integration tests install this tarball into throwaway clones.
 *
 * Set SPARKLE_SKIP_TEST_BUILD=1 to reuse an existing tarball (faster iteration when
 * you know the tarball is current).
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { buildTestTarball, TEST_TARBALL } from '../bin/prepare-test-distribution.js';

export default async function globalSetup() {
  const tarballPath = join(process.cwd(), TEST_TARBALL);

  if (process.env.SPARKLE_SKIP_TEST_BUILD === '1' && existsSync(tarballPath)) {
    console.log(`\n[globalSetup] Reusing existing ${TEST_TARBALL} (SPARKLE_SKIP_TEST_BUILD=1)\n`);
    return;
  }

  console.log('\n[globalSetup] Building test tarball from working tree...');
  await buildTestTarball();
  console.log('[globalSetup] Test tarball ready.\n');
}
