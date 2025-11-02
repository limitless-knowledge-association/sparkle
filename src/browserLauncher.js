/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Cross-platform browser launcher
 * Opens URLs in the default browser on Mac, Windows, and Linux
 * Uses centralized exec utilities for proper OS handling
 */

import { execAsync } from './execUtils.js';

/**
 * Open a URL in the default browser
 * @param {string} url - URL to open
 * @returns {Promise<void>}
 */
export async function openBrowser(url) {
  const platform = process.platform;

  let command;

  switch (platform) {
    case 'darwin': // macOS
      command = `open "${url}"`;
      break;

    case 'win32': // Windows
      // On Windows, 'start' is a shell built-in, so we need to use cmd
      // windowsHide is handled by execUtils
      command = `cmd /c start "" "${url}"`;
      break;

    case 'linux': // Linux
      command = `xdg-open "${url}"`;
      break;

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  try {
    // execAsync from execUtils automatically hides windows on Windows
    await execAsync(command);
  } catch (error) {
    throw new Error(`Failed to open browser: ${error.message}`);
  }
}
