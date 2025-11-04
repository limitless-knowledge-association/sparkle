/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Browser command - Open Sparkle in browser
 */

import { ensureDaemon } from '../../src/cliDaemonLauncher.js';
import { openBrowser } from '../../src/browserLauncher.js';
import { getDataDirectory } from '../lib/helpers.js';

/**
 * Browser command - Open Sparkle in browser
 */
export async function browserCommand() {
  const dataDir = await getDataDirectory();
  const port = await ensureDaemon(dataDir);

  // Open browser to daemon
  const url = `http://localhost:${port}`;
  console.log(`Opening Sparkle at ${url}`);
  await openBrowser(url);
}
