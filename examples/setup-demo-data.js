#!/usr/bin/env node
/**
 * Create initial test data for tree demo
 */

import * as sparkle from '../src/sparkle.js';

sparkle.setBaseDirectory('./sparkle-data');

async function setup() {
  console.log('Creating test data for tree demo...\n');

  try {
    const itemA = await sparkle.createItem('Implement authentication');
    const itemB = await sparkle.createItem('Design auth flow');
    const itemC = await sparkle.createItem('Setup database schema');
    const itemD = await sparkle.createItem('Create user model');
    const itemE = await sparkle.createItem('Deploy to production');
    const itemF = await sparkle.createItem('Write documentation');

    console.log('✓ Created 6 items');

    // Create dependency graph with SHARED dependencies (to show "Provides To"):
    //     E           F
    //     |          /
    //     A --------+  (A is depended on by both E and F!)
    //    / \
    //   B   C
    //    \ /
    //     D           (D is depended on by both B and C!)

    await sparkle.addDependency(itemA, itemB);
    await sparkle.addDependency(itemA, itemC);
    await sparkle.addDependency(itemB, itemD);
    await sparkle.addDependency(itemC, itemD);  // C also depends on D!
    await sparkle.addDependency(itemE, itemA);
    await sparkle.addDependency(itemF, itemA);  // F also depends on A!

    console.log('✓ Created dependencies\n');
    console.log('Item IDs:');
    console.log(`  ${itemE} (root) - Deploy to production`);
    console.log(`  └─ ${itemA} - Implement authentication`);
    console.log(`     ├─ ${itemB} - Design auth flow`);
    console.log(`     │  └─ ${itemD} - Create user model`);
    console.log(`     └─ ${itemC} - Setup database schema`);
    console.log(`        └─ ${itemD} - Create user model (shared!)`);
    console.log(``);
    console.log(`  ${itemF} (root) - Write documentation`);
    console.log(`  └─ ${itemA} - Implement authentication (shared!)`);
    console.log('\n✨ Test data created with shared dependencies!');
    console.log('💡 When you expand to see D, it will show "Provides To: [B, C]" (or exclude parent)');
    console.log('💡 When you expand to see A from E, it will show "Provides To: [F]" (excludes E)\n');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

setup();
