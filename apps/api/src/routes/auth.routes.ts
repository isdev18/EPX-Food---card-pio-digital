import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, register } from '../controllers/auth.controller.js';
import { asyncHandler } from '../middlewares/async-handler.js';
export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Muitas tentativas de acesso. Aguarde alguns minutos.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Limite de cadastros atingido. Tente novamente mais tarde.' },
});

authRouter.post('/login', loginLimiter, asyncHandler(login));
authRouter.post('/register', registerLimiter, asyncHandler(register));
