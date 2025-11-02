/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Execution Utilities - Centralized command execution with logging and OS handling
 * Solves Windows cmd.exe window flashing by applying windowsHide universally
 */

import { exec, spawn, execSync } from 'child_process';
import { promisify } from 'util';

const execNative = promisify(exec);

/**
 * Get default exec options with OS-specific handling
 * @param {Object} userOptions - User-provided options to merge
 * @returns {Object} Merged options with OS defaults
 */
function getExecOptions(userOptions = {}) {
  const baseOptions = {
    // Hide cmd windows on Windows (solves the flashing window issue)
    windowsHide: true,
  };

  return { ...baseOptions, ...userOptions };
}

/**
 * Execute a command with logging and OS-specific handling
 * @param {string} command - Command to execute
 * @param {Object} options - Execution options (cwd, timeout, etc.)
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function execAsync(command, options = {}) {
  const finalOptions = getExecOptions(options);

  // Log the command execution (helps with debugging)
  const cwd = finalOptions.cwd || process.cwd();
  const shortCwd = cwd.length > 40 ? '...' + cwd.slice(-37) : cwd;

  // Truncate long commands for logging
  const shortCommand = command.length > 80 ? command.slice(0, 77) + '...' : command;

  console.log(`[execUtils] ${shortCwd}$ ${shortCommand}`);

  try {
    return await execNative(command, finalOptions);
  } catch (error) {
    // Add context to error
    error.message = `Command failed: ${command}\n${error.message}`;
    throw error;
  }
}

/**
 * Spawn a process with logging and OS-specific handling
 * @param {string} command - Command to spawn
 * @param {Array<string>} args - Command arguments
 * @param {Object} options - Spawn options
 * @returns {ChildProcess} The spawned child process
 */
export function spawnProcess(command, args = [], options = {}) {
  const finalOptions = getExecOptions(options);

  // Log the spawn
  const cwd = finalOptions.cwd || process.cwd();
  const shortCwd = cwd.length > 40 ? '...' + cwd.slice(-37) : cwd;
  const argsStr = args.join(' ');
  const fullCommand = `${command} ${argsStr}`;
  const shortCommand = fullCommand.length > 80 ? fullCommand.slice(0, 77) + '...' : fullCommand;

  console.log(`[execUtils] spawn: ${shortCwd}$ ${shortCommand}`);

  return spawn(command, args, finalOptions);
}

/**
 * Execute a command synchronously with OS-specific handling
 * NOTE: Use sparingly - prefer execAsync for better error handling
 * @param {string} command - Command to execute
 * @param {Object} options - Execution options
 * @returns {Buffer|string} Command output
 */
export function execSyncWithOptions(command, options = {}) {
  const finalOptions = getExecOptions(options);

  // Log the command execution
  const cwd = finalOptions.cwd || process.cwd();
  const shortCwd = cwd.length > 40 ? '...' + cwd.slice(-37) : cwd;
  const shortCommand = command.length > 80 ? command.slice(0, 77) + '...' : command;

  console.log(`[execUtils] sync: ${shortCwd}$ ${shortCommand}`);

  return execSync(command, finalOptions);
}
