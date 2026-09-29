import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from './id';

const originalCrypto = globalThis.crypto;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
});

describe('createId', () => {
  it('uses randomUUID when the runtime provides it', () => {
    const randomUUID = vi.fn(() => 'native-uuid');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID } });

    expect(createId()).toBe('native-uuid');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('creates a version 4 UUID when randomUUID is unavailable', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues: (bytes: Uint8Array) => bytes.fill(0) },
    });

    expect(createId()).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('still creates a valid version 4 UUID without Web Crypto', () => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(createId()).toBe('00000000-0000-4000-8000-000000000000');
  });
});
