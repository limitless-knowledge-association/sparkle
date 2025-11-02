/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Status Validation Demo
 * Demonstrates how the statuses.json file works for status validation
 */

import * as sparkle from '../src/sparkle.js';
import { writeJsonFile, removeDir } from '../src/fileUtils.js';
import { join } from 'path';

async function demo() {
  console.log('=== Status Validation Demo ===\n');

  // Set up temporary directory
  const testDir = `/tmp/sparkle-status-demo-${Date.now()}`;
  sparkle.setBaseDirectory(testDir);

  try {
    // Part 1: Without statuses.json (no validation)
    console.log('Part 1: Without statuses.json file (no validation)');
    console.log('------------------------------------------------------');

    const item1 = await sparkle.createItem('Task 1', 'any-custom-status');
    console.log('✅ Created item with "any-custom-status" - no validation');

    await sparkle.updateStatus(item1, 'whatever-status-you-want');
    console.log('✅ Updated to "whatever-status-you-want" - no validation\n');

    // Part 2: With statuses.json (validation enabled)
    console.log('Part 2: With statuses.json file (validation enabled)');
    console.log('------------------------------------------------------');

    // Create statuses.json with allowed statuses
    const statusFilePath = join(testDir, 'statuses.json');
    await writeJsonFile(statusFilePath, ['in-progress', 'blocked', 'review']);
    console.log('Created statuses.json with: ["in-progress", "blocked", "review"]\n');

    // Try allowed statuses
    const item2 = await sparkle.createItem('Task 2', 'in-progress');
    console.log('✅ Created item with "in-progress" - allowed');

    const item3 = await sparkle.createItem('Task 3', 'incomplete');
    console.log('✅ Created item with "incomplete" - always allowed (built-in)');

    await sparkle.updateStatus(item2, 'blocked');
    console.log('✅ Updated to "blocked" - allowed');

    await sparkle.updateStatus(item3, 'review');
    console.log('✅ Updated to "review" - allowed\n');

    // Try invalid status
    console.log('Attempting to use invalid status:');
    try {
      await sparkle.createItem('Task 4', 'invalid-status');
      console.log('❌ Should have failed!');
    } catch (error) {
      console.log(`✅ Correctly rejected: ${error.message}\n`);
    }

    // Try invalid status on update
    console.log('Attempting to update to invalid status:');
    try {
      await sparkle.updateStatus(item2, 'not-allowed');
      console.log('❌ Should have failed!');
    } catch (error) {
      console.log(`✅ Correctly rejected: ${error.message}\n`);
    }

    // Part 3: Demonstrate "completed" is always allowed
    console.log('Part 3: Built-in statuses are always allowed');
    console.log('------------------------------------------------------');

    const item4 = await sparkle.createItem('Task 4', 'incomplete');
    await sparkle.updateStatus(item4, 'completed');
    console.log('✅ Updated to "completed" - always allowed (built-in)\n');

    console.log('=== Demo Complete ===');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Cleanup
    await removeDir(testDir);
  }
}

demo();
