/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Demonstration of the pendingWork() function
 * Shows how to track what work is ready to be done based on dependencies
 *
 * Usage:
 *   node examples/pending-work-demo.js        # Runs demo and cleans up
 *   node examples/pending-work-demo.js leave  # Runs demo and leaves files for review
 */

import * as sparkle from '../src/sparkle.js';
import { removeDir } from '../src/fileUtils.js';

// Check command line arguments
const shouldLeaveFiles = process.argv.includes('leave');

// Use a demo directory
const demoDir = './demo-data';
sparkle.setBaseDirectory(demoDir);

async function displayPendingWork() {
  console.log('\n📋 Pending work (ready to start):');
  let count = 0;
  for await (const itemId of sparkle.pendingWork()) {
    const details = await sparkle.getItemDetails(itemId);
    console.log(`  ✓ ${details.tagline} [${itemId}]`);
    count++;
  }
  if (count === 0) {
    console.log('  (none - all work is either completed or blocked by dependencies)');
  }
}

async function main() {
  console.log('🌟 Sparkle Pending Work Demo\n');

  // Create a project with dependencies
  console.log('Creating project tasks...');
  const design = await sparkle.createItem('Design database schema');
  const implement = await sparkle.createItem('Implement data models');
  const api = await sparkle.createItem('Build REST API');
  const frontend = await sparkle.createItem('Create frontend UI');
  const tests = await sparkle.createItem('Write integration tests');
  const deploy = await sparkle.createItem('Deploy to production');

  // Set up dependency graph
  console.log('Setting up dependencies...');
  await sparkle.addDependency(implement, design);    // Implement needs design
  await sparkle.addDependency(api, implement);       // API needs models
  await sparkle.addDependency(frontend, api);        // Frontend needs API
  await sparkle.addDependency(tests, api);          // Tests need API
  await sparkle.addDependency(deploy, frontend);    // Deploy needs frontend
  await sparkle.addDependency(deploy, tests);       // Deploy needs tests

  // Show initial pending work
  await displayPendingWork();
  // Only "Design database schema" should be pending - everything else is blocked

  // Complete the design
  console.log('\n✅ Completing: Design database schema');
  await sparkle.updateStatus(design, 'completed');
  await displayPendingWork();
  // Now "Implement data models" is unblocked

  // Complete implementation
  console.log('\n✅ Completing: Implement data models');
  await sparkle.updateStatus(implement, 'completed');
  await displayPendingWork();
  // Now "Build REST API" is unblocked

  // Complete API
  console.log('\n✅ Completing: Build REST API');
  await sparkle.updateStatus(api, 'completed');
  await displayPendingWork();
  // Now both "Create frontend UI" and "Write integration tests" are unblocked

  // Complete frontend
  console.log('\n✅ Completing: Create frontend UI');
  await sparkle.updateStatus(frontend, 'completed');
  await displayPendingWork();
  // Still have tests pending

  // Complete tests
  console.log('\n✅ Completing: Write integration tests');
  await sparkle.updateStatus(tests, 'completed');
  await displayPendingWork();
  // Now "Deploy to production" is unblocked

  // Complete deployment
  console.log('\n✅ Completing: Deploy to production');
  await sparkle.updateStatus(deploy, 'completed');
  await displayPendingWork();
  // Nothing left to do!

  console.log('\n🎉 All work completed!\n');

  // Cleanup demo directory (unless 'leave' flag is set)
  if (shouldLeaveFiles) {
    console.log(`📁 Demo data left in: ${demoDir}/`);
    console.log('   You can review the JSON files to see the data structure.');
  } else {
    console.log('Cleaning up demo data...');
    await removeDir(demoDir);
  }
}

main().catch(console.error);
