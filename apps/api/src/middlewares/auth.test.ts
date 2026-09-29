import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.js';
import { requireAuth, type AuthRequest } from './auth.js';

function responseMock() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response as unknown as Response;
}

describe('requireAuth', () => {
  it('rejeita uma requisição sem token', () => {
    const response = responseMock();
    const next = vi.fn<NextFunction>();
    requireAuth({ headers: {} } as AuthRequest, response, next);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejeita um token adulterado', () => {
    const response = responseMock();
    const next = vi.fn<NextFunction>();
    requireAuth({ headers: { authorization: 'Bearer token.invalido.assinatura' } } as AuthRequest, response, next);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('aceita apenas os dados de tenant assinados no token', () => {
    const token = jwt.sign({ userId: 'user-1', restaurantId: 'restaurant-1', role: 'OWNER' }, env.JWT_SECRET, { expiresIn: '5m' });
    const request = { headers: { authorization: `Bearer ${token}` } } as AuthRequest;
    const next = vi.fn<NextFunction>();
    requireAuth(request, responseMock(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(request.auth).toMatchObject({ userId: 'user-1', restaurantId: 'restaurant-1', role: 'OWNER' });
  });
});
