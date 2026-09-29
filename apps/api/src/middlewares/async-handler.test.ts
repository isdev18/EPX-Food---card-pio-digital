import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { asyncHandler } from './async-handler.js';

describe('asyncHandler', () => {
  it('forwards rejected route promises to the error middleware', async () => {
    const failure = new Error('database unavailable');
    const next = vi.fn<NextFunction>();
    const handler = asyncHandler(async () => {
      throw failure;
    });

    handler({} as Request, {} as Response, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(failure));
  });
});
