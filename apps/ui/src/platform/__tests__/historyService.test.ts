import { historyService } from '../historyService';

describe('historyService', () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

  beforeEach(() => {
    historyService.clear();
  });

  afterEach(() => {
    historyService.clear();
    if (originalCrypto) {
      Object.defineProperty(globalThis, 'crypto', originalCrypto);
    }
  });

  it('creates checkpoints when crypto.randomUUID is unavailable', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        getRandomValues(bytes: Uint8Array) {
          for (let index = 0; index < bytes.length; index += 1) {
            bytes[index] = index;
          }
          return bytes;
        },
      },
    });

    const checkpointId = historyService.createCheckpoint('cube(10);', [], 'Initial', 'user');

    expect(checkpointId).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    expect(historyService.getAll()).toHaveLength(1);
  });
});
