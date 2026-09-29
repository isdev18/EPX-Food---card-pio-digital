import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middlewares/auth.js';
import {
  completeEmbeddedSignup,
  getWhatsAppIntegration,
  setWhatsAppAutomation,
} from '../services/whatsapp-connection.service.js';

const identifier = z.string().regex(/^\d+$/, 'Identificador invÃ¡lido.');
const completeSchema = z.object({
  code: z.string().min(10).max(4096),
  businessAccountId: identifier,
  phoneNumberId: identifier,
  businessPortfolioId: identifier.optional(),
});
const automationSchema = z.object({ active: z.boolean() });

export async function status(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json(await getWhatsAppIntegration(req.auth!.restaurantId));
  } catch (error) {
    next(error);
  }
}

export async function complete(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const input = completeSchema.parse(req.body);
    res.status(201).json(await completeEmbeddedSignup(req.auth!.restaurantId, input));
  } catch (error) {
    next(error);
  }
}

export async function automation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { active } = automationSchema.parse(req.body);
    res.json(await setWhatsAppAutomation(req.auth!.restaurantId, active));
  } catch (error) {
    next(error);
  }
}
