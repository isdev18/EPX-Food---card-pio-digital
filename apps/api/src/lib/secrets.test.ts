import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secrets.js';

describe('protecao de segredos', () => {
  it('criptografa e recupera um token sem armazena-lo em texto puro', () => {
    const token = 'token-de-teste-que-nao-deve-aparecer-no-banco';
    const encrypted = encryptSecret(token);
    expect(encrypted).not.toContain(token);
    expect(decryptSecret(encrypted)).toBe(token);
  });

  it('rejeita um payload adulterado', () => {
    const encrypted = encryptSecret('token');
    const last = encrypted.at(-1) === 'x' ? 'y' : 'x';
    expect(() => decryptSecret(encrypted.slice(0, -1) + last)).toThrow();
  });
});
