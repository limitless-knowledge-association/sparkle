/**
 * Jest Configuration for Sparkle Tests
 *
 * This configuration separates unit tests (fast, no git) from integration tests (slower, full git setup).
 */

export default {
  testEnvironment: 'node',
  testTimeout: 30000,
  transform: {}, // ES modules native support

  // Run tests in parallel, but limit integration tests
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      testTimeout: 10000,
      maxWorkers: '100%', // Parallel-safe, can run all at once
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      testTimeout: 60000,
      maxWorkers: 3, // Limit concurrent git operations
      maxConcurrency: 3,
    }
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    'public/**/*.js',
    '!src/version.js', // Generated file
    '!public/primaryViews.js', // Generated file
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.integration_testing/',
  ],

  // Module paths
  moduleFileExtensions: ['js'],

  // Verbose output
  verbose: true,
};
