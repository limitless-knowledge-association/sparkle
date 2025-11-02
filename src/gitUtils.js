/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Cache for git user information (won't change during daemon lifetime)
let cachedGitUser = null;

/**
 * Get the current git user information
 * Cached after first call since git user config won't change during daemon lifetime
 * @returns {Promise<{name: string, email: string}>} User name and email from git config
 */
export async function getGitUser() {
  // Return cached value if available
  if (cachedGitUser) {
    return cachedGitUser;
  }

  try {
    const { stdout: name } = await execAsync('git config user.name');
    const { stdout: email } = await execAsync('git config user.email');

    cachedGitUser = {
      name: name.trim(),
      email: email.trim()
    };

    return cachedGitUser;
  } catch (error) {
    throw new Error(`Failed to get git user information: ${error.message}`);
  }
}
