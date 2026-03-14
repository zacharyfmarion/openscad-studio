/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/utils/formatter/__tests__'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/fixtures/', '\\.scad$'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.formatter-tests.json',
        useESM: true,
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'wasm'],
  testTimeout: 30000,
  maxWorkers: 1,
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache-formatter',
  watchman: false,
};
