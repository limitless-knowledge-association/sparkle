/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Jest globalTeardown - runs once after the whole test run.
 *
 * Suite-wide safety net: destroys any Sparkle daemon left running under
 * .integration_testing (detached `--keep-alive=api` daemons spawned by CLI commands
 * during tests). Individual test files also clean up their own daemons; this guarantees
 * none survive the run even if a test threw before its afterAll.
 */

import { join } from 'path';
import { stopAllDaemonsUnder } from './helpers/test-helpers.js';

export default async function globalTeardown() {
  await stopAllDaemonsUnder(join(process.cwd(), '.integration_testing'));
}
