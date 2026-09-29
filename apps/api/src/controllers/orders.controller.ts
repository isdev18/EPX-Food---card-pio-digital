import type { Response } from 'express';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import type { AuthRequest } from '../middlewares/auth.js';
import * as service from '../services/orders.service.js';

export async function index(req: AuthRequest, res: Response) { return res.json(await service.listOrders(req.auth!.restaurantId)); }

export async function create(req: AuthRequest, res: Response) {
  const input = z.object({
    customerId: z.string(), items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive(), configuration: z.unknown().optional(), notes: z.string().optional() })).min(1),
    neighborhood: z.string().trim().max(100).optional(), paymentMethod: z.nativeEnum(PaymentMethod),
    address: z.object({
      zipCode: z.string().trim().max(12).optional(), street: z.string().trim().min(2).max(120),
      number: z.string().trim().max(20), neighborhood: z.string().trim().max(100),
      complement: z.string().trim().max(100).optional(), city: z.string().trim().max(100),
      reference: z.string().trim().max(160).optional(),
    }).strict().optional(), notes: z.string().max(300).optional(),
  }).parse(req.body);
  return res.status(201).json(await service.createOrder(req.auth!.restaurantId, input));
}

export async function updateStatus(req: AuthRequest, res: Response) {
  const { status } = z.object({ status: z.nativeEnum(OrderStatus) }).parse(req.body);
  return res.json(await service.updateOrderStatus(req.auth!.restaurantId, String(req.params.id), status));
}
