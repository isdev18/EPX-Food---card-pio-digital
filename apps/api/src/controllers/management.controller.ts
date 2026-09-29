import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middlewares/auth.js';
import * as management from '../services/management.service.js';

const nullableDate = z.union([z.string().datetime().transform((value) => new Date(value)), z.null()]);
const couponFields = {
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Use apenas letras, números, hífen ou sublinhado.'),
  type: z.enum(['FIXED', 'PERCENTAGE']),
  value: z.number().positive().max(100_000),
  minimumOrder: z.number().min(0).max(100_000),
  expiresAt: nullableDate,
  maxUses: z.number().int().positive().max(1_000_000).nullable(),
  active: z.boolean(),
};
const promotionFields = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable(),
  promotionalPrice: z.number().positive().max(100_000).nullable(),
  startsAt: z.string().datetime().transform((value) => new Date(value)),
  endsAt: nullableDate,
  active: z.boolean(),
  productIds: z.array(z.string().min(1)).min(1).max(100),
};

export async function couponsIndex(req: AuthRequest, res: Response) {
  return res.json(await management.listCoupons(req.auth!.restaurantId));
}

export async function couponsCreate(req: AuthRequest, res: Response) {
  const input = z.object(couponFields).parse(req.body);
  return res.status(201).json(await management.createCoupon(req.auth!.restaurantId, input));
}

export async function couponsUpdate(req: AuthRequest, res: Response) {
  const input = z.object(couponFields).partial().refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.').parse(req.body);
  return res.json(await management.updateCoupon(req.auth!.restaurantId, String(req.params.id), input));
}

export async function couponsDestroy(req: AuthRequest, res: Response) {
  return res.json(await management.deleteCoupon(req.auth!.restaurantId, String(req.params.id)));
}

function validatePromotionDates<T extends { startsAt?: Date; endsAt?: Date | null }>(input: T) {
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    throw new z.ZodError([{ code: 'custom', path: ['endsAt'], message: 'O término deve ser posterior ao início.' }]);
  }
  return input;
}

export async function promotionsIndex(req: AuthRequest, res: Response) {
  return res.json(await management.listPromotions(req.auth!.restaurantId));
}

export async function promotionsCreate(req: AuthRequest, res: Response) {
  const input = validatePromotionDates(z.object(promotionFields).parse(req.body));
  return res.status(201).json(await management.createPromotion(req.auth!.restaurantId, input));
}

export async function promotionsUpdate(req: AuthRequest, res: Response) {
  const input = validatePromotionDates(z.object(promotionFields).partial().refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.').parse(req.body));
  return res.json(await management.updatePromotion(req.auth!.restaurantId, String(req.params.id), input));
}

export async function promotionsDestroy(req: AuthRequest, res: Response) {
  return res.json(await management.deletePromotion(req.auth!.restaurantId, String(req.params.id)));
}
