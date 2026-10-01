import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middlewares/auth.js';
import { getRestaurantSettings, updateRestaurantSettings } from '../services/settings.service.js';

const imageSchema = z.union([
  z.string().url().max(2_000).refine((value) => value.startsWith('https://'), 'Use uma URL HTTPS.'),
  z.string().max(950_000).regex(/^data:image\/(?:jpeg|png|webp);base64,/, 'Formato de imagem inválido.'),
  z.null(),
]);

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  logoUrl: imageSchema.optional(),
  bannerUrl: imageSchema.optional(),
  pixKey: z.string().trim().max(180).nullable().optional(),
  pixQrCodeUrl: imageSchema.optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  addressText: z.string().trim().max(300).nullable().optional(),
  openingHoursText: z.string().trim().max(300).nullable().optional(),
  deliveryEstimateMin: z.number().int().min(0).max(600).optional(),
  deliveryEstimateMax: z.number().int().min(0).max(600).optional(),
  minimumOrder: z.number().min(0).max(100_000).optional(),
  acceptScheduledOrders: z.boolean().optional(),
  halfPizzaPricing: z.enum(['HIGHEST', 'AVERAGE']).optional(),
}).refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.');

export async function show(req: AuthRequest, res: Response) {
  return res.json(await getRestaurantSettings(req.auth!.restaurantId));
}

export async function update(req: AuthRequest, res: Response) {
  return res.json(await updateRestaurantSettings(req.auth!.restaurantId, settingsSchema.parse(req.body)));
}
