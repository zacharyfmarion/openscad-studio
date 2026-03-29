/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/functions'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        useESM: false,
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testTimeout: 30000,
  maxWorkers: 1,
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  watchman: false,
  collectCoverageFrom: [
    'functions/**/*.{ts,tsx}',
    '!functions/**/*.d.ts',
    '!functions/**/__tests__/**',
  ],
  coverageThreshold: {
    './functions/_lib/share.ts': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './functions/api/share.ts': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './functions/s/[[shareId]].ts': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
