/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Configuration Manager - Handles three-tier configuration system
 * 1. System defaults (hard-coded)
 * 2. Local storage (browser-based, all instances)
 * 3. Per-project (.aggregates/config.json, git-ignored)
 */

import { join } from 'path';
import { readJsonFile, writeJsonFile, fileExists } from './fileUtils.js';

/**
 * System default configuration values
 * These are hard-coded fallbacks used when no overrides exist
 */
const SYSTEM_DEFAULTS = {
  darkMode: false,
  filters: {
    pending: 'all',
    monitor: 'all',
    ignored: 'not-ignored',
    taken: 'all'
  },
  port: null // null = use ephemeral port (default), number = fixed port for bookmarkable URLs
};

/**
 * Get system default configuration
 * @returns {Object} System defaults
 */
export function getSystemDefaults() {
  return JSON.parse(JSON.stringify(SYSTEM_DEFAULTS)); // Deep clone
}

/**
 * Load per-project configuration from .aggregates/config.json
 * @param {string} baseDirectory - Base directory for sparkle data
 * @returns {Promise<Object>} Project configuration (may have null values)
 */
export async function loadProjectConfig(baseDirectory) {
  const configPath = join(baseDirectory, '.aggregates', 'config.json');

  if (!fileExists(configPath)) {
    // Return empty config (all nulls mean "use higher level")
    return {
      darkMode: null,
      filters: {
        pending: null,
        monitor: null,
        ignored: null,
        taken: null
      },
      port: null
    };
  }

  try {
    const config = await readJsonFile(configPath);

    // Ensure structure exists even if file is incomplete
    return {
      darkMode: config.darkMode ?? null,
      filters: {
        pending: config.filters?.pending ?? null,
        monitor: config.filters?.monitor ?? null,
        ignored: config.filters?.ignored ?? null,
        taken: config.filters?.taken ?? null
      },
      port: config.port ?? null
    };
  } catch (error) {
    console.error('Error loading project config:', error);
    // Return empty config on error
    return {
      darkMode: null,
      filters: {
        pending: null,
        monitor: null,
        ignored: null,
        taken: null
      },
      port: null
    };
  }
}

/**
 * Save per-project configuration to .aggregates/config.json
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {Object} config - Configuration object to save
 */
export async function saveProjectConfig(baseDirectory, config) {
  const configPath = join(baseDirectory, '.aggregates', 'config.json');

  // Ensure the config has the proper structure (no customStatuses - those stay in statuses.json)
  const configToSave = {
    darkMode: config.darkMode ?? null,
    filters: {
      pending: config.filters?.pending ?? null,
      monitor: config.filters?.monitor ?? null,
      ignored: config.filters?.ignored ?? null,
      taken: config.filters?.taken ?? null
    },
    port: config.port ?? null
  };

  await writeJsonFile(configPath, configToSave);
}

/**
 * Resolve a single configuration value with precedence rules
 * @param {*} projectValue - Value from project config (null = not set)
 * @param {*} localValue - Value from localStorage (null = not set)
 * @param {*} defaultValue - System default value
 * @returns {*} Resolved value
 */
export function resolveConfigValue(projectValue, localValue, defaultValue) {
  // Project takes precedence if set
  if (projectValue !== null && projectValue !== undefined && projectValue !== '') {
    return projectValue;
  }

  // Then local storage
  if (localValue !== null && localValue !== undefined && localValue !== '') {
    return localValue;
  }

  // Finally default
  return defaultValue;
}

/**
 * Get merged configuration by applying precedence rules
 * NOTE: This function runs server-side, so it doesn't have access to localStorage.
 * The client must pass localStorage values or we only merge project + defaults.
 *
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {Object} localConfig - Optional local config from client (localStorage values)
 * @returns {Promise<Object>} Merged configuration with effective values
 */
export async function getMergedConfig(baseDirectory, localConfig = null) {
  const defaults = getSystemDefaults();
  const project = await loadProjectConfig(baseDirectory);

  // If no local config provided, use empty (all nulls)
  const local = localConfig ?? {
    darkMode: null,
    filters: {
      pending: null,
      monitor: null,
      ignored: null,
      taken: null
    }
  };

  // Apply precedence for each setting (no customStatuses - those stay in statuses.json)
  return {
    darkMode: resolveConfigValue(project.darkMode, local.darkMode, defaults.darkMode),
    filters: {
      pending: resolveConfigValue(project.filters.pending, local.filters.pending, defaults.filters.pending),
      monitor: resolveConfigValue(project.filters.monitor, local.filters.monitor, defaults.filters.monitor),
      ignored: resolveConfigValue(project.filters.ignored, local.filters.ignored, defaults.filters.ignored),
      taken: resolveConfigValue(project.filters.taken, local.filters.taken, defaults.filters.taken)
    }
  };
}

