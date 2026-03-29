/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // Only match test files, not utility files
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  // Ignore fixture files and other non-test files
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/fixtures/',
    '/__tests__/test-utils.ts',
    '/utils/formatter/__tests__/',
    '\\.scad$',
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^.*/sentry$': '<rootDir>/src/__mocks__/sentry.ts',
    '^fflate$':
      '<rootDir>/../../node_modules/.pnpm/fflate@0.6.10/node_modules/fflate/lib/browser.cjs',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  // Allow importing .wasm files
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'wasm'],
  // Set up global test timeout
  testTimeout: 30000,
  // Speed up test discovery and execution
  maxWorkers: 1,
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  // Disable watchman to avoid 60s timeout
  watchman: false,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/main.tsx',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/fixtures/', '/src/utils/formatter/'],
  coverageThreshold: {
    './src/hooks/useAiAgent.ts': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/hooks/useOpenScad.ts': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/services/renderService.ts': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/platform/index.ts': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/stores/apiKeyStore.ts': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
