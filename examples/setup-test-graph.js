#!/usr/bin/env node
/**
 * Create specific test graph for manual testing
 *
 * Relationships:
 * a -> b -> d -> f
 * a -> c -> d
 * a -> c -> e -> f
 */

import * as sparkle from '../src/sparkle.js';

sparkle.setBaseDirectory('./sparkle-data');

async function setup() {
  console.log('Creating test graph...\n');

  try {
    // Create nodes
    const a = await sparkle.createItem('Node A');
    const b = await sparkle.createItem('Node B');
    const c = await sparkle.createItem('Node C');
    const d = await sparkle.createItem('Node D');
    const e = await sparkle.createItem('Node E');
    const f = await sparkle.createItem('Node F');

    console.log('✓ Created nodes\n');

    // Create relationships
    // a -> b -> d -> f
    await sparkle.addDependency(a, b);
    await sparkle.addDependency(b, d);
    await sparkle.addDependency(d, f);

    // a -> c -> d (d is shared!)
    await sparkle.addDependency(a, c);
    await sparkle.addDependency(c, d);

    // a -> c -> e -> f (f is shared!)
    await sparkle.addDependency(c, e);
    await sparkle.addDependency(e, f);

    console.log('✓ Created relationships\n');

    console.log('═'.repeat(60));
    console.log('NODE IDs (copy these for testing):');
    console.log('═'.repeat(60));
    console.log(`a = ${a}`);
    console.log(`b = ${b}`);
    console.log(`c = ${c}`);
    console.log(`d = ${d}`);
    console.log(`e = ${e}`);
    console.log(`f = ${f}`);
    console.log('═'.repeat(60));

    console.log('\nGraph structure:');
    console.log('  a (root)');
    console.log('  ├─ b');
    console.log('  │  └─ d');
    console.log('  │     └─ f');
    console.log('  └─ c');
    console.log('     ├─ d (shared - also reached via b!)');
    console.log('     │  └─ f (shared - also reached via e!)');
    console.log('     └─ e');
    console.log('        └─ f (shared!)');

    console.log('\n"Provides To" back-links:');
    console.log(`  d provides to: [b, c]`);
    console.log(`  f provides to: [d, e]`);

    console.log('\n✨ Test graph created!');
    console.log('\nTo test:');
    console.log('  1. node examples/tree-demo.js');
    console.log(`  2. expand ${a}  # Expand a`);
    console.log(`  3. expand ${b}  # Expand b`);
    console.log(`  4. expand ${d}  # Expand d - should show "Provides To: [c]" (excludes parent b)`);
    console.log('\n');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

setup();
