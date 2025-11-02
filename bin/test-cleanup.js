#!/usr/bin/env node

/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Test Cleanup Script
 * Kills orphaned test processes and cleans up test directories
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { readdir } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

console.log('🧹 Cleaning up Sparkle test processes and directories...\n');

// Step 1: Kill orphaned test processes
try {
  console.log('Looking for test processes...');

  // Find processes with --test-mode flag
  const { stdout } = await execAsync('ps aux | grep "sparkle_agent.*--test-mode" | grep -v grep || true');

  if (stdout.trim()) {
    const lines = stdout.trim().split('\n');
    console.log(`Found ${lines.length} test process(es)`);

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[1];

      try {
        process.kill(pid, 'SIGTERM');
        console.log(`  ✅ Killed process ${pid}`);
      } catch (error) {
        console.log(`  ⚠️  Could not kill ${pid}: ${error.message}`);
      }
    }
  } else {
    console.log('  No test processes found');
  }
} catch (error) {
  console.log('  ⚠️  Error checking for test processes:', error.message);
}

console.log('');

// Step 2: Clean up test directories
try {
  console.log('Looking for test directories...');

  const tempDir = tmpdir();
  const entries = await readdir(tempDir);
  const testDirs = entries.filter(name => name.startsWith('sparkle-test-'));

  if (testDirs.length > 0) {
    console.log(`Found ${testDirs.length} test director(ies)`);

    for (const dir of testDirs) {
      const fullPath = join(tempDir, dir);
      try {
        await rm(fullPath, { recursive: true, force: true });
        console.log(`  ✅ Removed ${dir}`);
      } catch (error) {
        console.log(`  ⚠️  Could not remove ${dir}: ${error.message}`);
      }
    }
  } else {
    console.log('  No test directories found');
  }
} catch (error) {
  console.log('  ⚠️  Error checking for test directories:', error.message);
}

console.log('\n✅ Cleanup complete');
