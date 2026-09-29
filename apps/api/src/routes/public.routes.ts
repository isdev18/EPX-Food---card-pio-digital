import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import * as menu from '../services/public-menu.service.js';
import { asyncHandler } from '../middlewares/async-handler.js';

export const publicRouter = Router();

const sessionLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
const checkoutLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });

publicRouter.post('/restaurants/:slug/sessions', sessionLimiter, asyncHandler(async (req, res) => {
  z.object({}).strict().parse(req.body ?? {});
  res.status(201).json(await menu.createMenuSession(String(req.params.slug)));
}));
publicRouter.get('/menu/:token', asyncHandler(async (req, res) => res.json(await menu.getPublicMenu(String(req.params.token)))));
publicRouter.get('/menu/:token/cart', asyncHandler(async (req, res) => res.json(await menu.getPublicCart(String(req.params.token)))));
publicRouter.post('/menu/:token/cart/items', asyncHandler(async (req, res) => {
  const input = z.object({
    productId: z.string(), quantity: z.number().int().min(1).max(20).default(1), notes: z.string().max(180).optional(),
    pizza: z.object({ sizeId: z.string(), flavorIds: z.array(z.string()).min(1).max(3), crustId: z.string(), extraIds: z.array(z.string()).max(12) }).optional(),
  }).parse(req.body);
  res.status(201).json(await menu.addPublicCartItem(String(req.params.token), input));
}));
publicRouter.delete('/menu/:token/cart/items/:itemId', asyncHandler(async (req, res) => res.json(await menu.removePublicCartItem(String(req.params.token), String(req.params.itemId)))));
publicRouter.post('/menu/:token/coupon', asyncHandler(async (req, res) => {
  const { code } = z.object({ code: z.string().min(2).max(40) }).parse(req.body);
  res.json(await menu.applyPublicCoupon(String(req.params.token), code));
}));
publicRouter.post('/menu/:token/checkout', checkoutLimiter, asyncHandler(async (req, res) => {
  const input = z.object({
    idempotencyKey: z.string().min(16).max(100), fulfillment: z.enum(['DELIVERY', 'PICKUP']),
    customer: z.object({ name: z.string().trim().min(2).max(100), phone: z.string().min(10).max(30) }),
    neighborhood: z.string().max(100).optional(),
    address: z.object({
      zipCode: z.string().trim().max(12).optional(), street: z.string().trim().min(2).max(120),
      number: z.string().trim().min(1).max(20), neighborhood: z.string().trim().max(100).optional(),
      complement: z.string().trim().max(100).optional(), city: z.string().trim().max(100).optional(),
      reference: z.string().trim().max(160).optional(),
    }).strict().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod), changeFor: z.number().positive().max(1_000_000).optional(), notes: z.string().max(300).optional(),
  }).superRefine((value, context) => {
    if (value.fulfillment === 'DELIVERY' && !value.address) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: 'O endereço é obrigatório para entrega.' });
    }
  }).parse(req.body);
  res.status(201).json(await menu.checkoutPublicCart(String(req.params.token), input));
}));
publicRouter.get('/orders/:token', asyncHandler(async (req, res) => res.json(await menu.getTrackedOrder(String(req.params.token)))));
publicRouter.post('/menu/:token/events', asyncHandler(async (req, res) => {
  const input = z.object({ name: z.string(), payload: z.record(z.unknown()).optional() }).parse(req.body);
  res.status(202).json(await menu.recordPublicEvent(String(req.params.token), input.name, input.payload));
}));
