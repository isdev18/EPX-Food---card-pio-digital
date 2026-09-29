import { describe, expect, it } from 'vitest';
import { resolveConversation } from './state-machine.js';

describe('conversation state machine', () => {
  it('recognizes global human support command', () => expect(resolveConversation('CHOOSING_SIZE', 'atendente').next).toBe('HUMAN_SUPPORT'));
  it('returns to idle when cancelling', () => expect(resolveConversation('CONFIRMING_ORDER', 'cancelar').next).toBe('IDLE'));
  it('never confirms before explicit confirmation stage', () => expect(resolveConversation('CHOOSING_PAYMENT', 'pix').next).toBe('CONFIRMING_ORDER'));
});
