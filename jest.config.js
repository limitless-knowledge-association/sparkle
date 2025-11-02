/**
 * Jest Configuration for Sparkle Tests
 *
 * This configuration separates unit tests (fast, no git) from integration tests (slower, full git setup).
 */

export default {
  testEnvironment: 'node',
  transform: {},

  // Run tests in parallel, but limit integration tests
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      transform: {},
      maxWorkers: '100%', // Parallel-safe, can run all at once
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      transform: {},
      maxWorkers: 3, // Limit concurrent git operations
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
