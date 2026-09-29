import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isValidMetaSignature } from './webhook.controller.js';

describe('assinatura do webhook Meta', () => {
  const body = Buffer.from('{"entry":[{"id":"evento"}]}');
  const secret = 'segredo-de-teste-com-tamanho-suficiente';

  it('aceita a assinatura HMAC válida', () => {
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(isValidMetaSignature(body, signature, secret)).toBe(true);
  });

  it('rejeita corpo adulterado, assinatura ausente ou segredo ausente', () => {
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(isValidMetaSignature(Buffer.from('{"alterado":true}'), signature, secret)).toBe(false);
    expect(isValidMetaSignature(body, '', secret)).toBe(false);
    expect(isValidMetaSignature(body, signature, '')).toBe(false);
  });
});
