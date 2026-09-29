import type { Request, Response } from 'express';
import { z } from 'zod';
import { registerOwner, signIn } from '../services/auth.service.js';

export async function login(req: Request, res: Response) {
  const input = z.object({ email: z.string().email(), password: z.string().min(6) }).parse(req.body);
  const result = await signIn(input.email, input.password);
  if (!result) return res.status(401).json({ message: 'E-mail ou senha incorretos.' });
  return res.json(result);
}

export async function register(req: Request, res: Response) {
  const input = z.object({
    ownerName: z.string().trim().min(2).max(100),
    restaurantName: z.string().trim().min(2).max(120),
    email: z.string().email().max(160),
    password: z.string().min(8).max(100),
  }).parse(req.body);
  const result = await registerOwner(input);
  if (!result) return res.status(409).json({ message: 'Este e-mail já possui uma conta.' });
  return res.status(201).json(result);
}
