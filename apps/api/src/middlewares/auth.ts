import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type AuthRequest = Request & { auth?: { userId: string; restaurantId: string; role: string } };

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Autenticação necessária.' });
  try {
    req.auth = jwt.verify(token, env.JWT_SECRET) as AuthRequest['auth'];
    return next();
  } catch {
    return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
  }
}
