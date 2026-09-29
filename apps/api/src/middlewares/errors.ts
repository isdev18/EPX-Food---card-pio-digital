import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) return res.status(422).json({ message: 'Dados inválidos.', issues: error.flatten() });
  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
  console.error(error);
  return res.status(500).json({ message: 'Não foi possível concluir a operação.' });
};
