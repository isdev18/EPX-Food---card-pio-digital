import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middlewares/auth.js';
import * as service from '../services/delivery-zones.service.js';

const fields = {
  neighborhood: z.string().trim().min(2).max(100),
  fee: z.number().min(0).max(100_000),
  estimatedMinutes: z.number().int().min(5).max(1_440),
  active: z.boolean(),
};

export async function index(req: AuthRequest, res: Response) {
  return res.json(await service.listDeliveryZones(req.auth!.restaurantId));
}

export async function create(req: AuthRequest, res: Response) {
  const input = z.object(fields).parse(req.body);
  return res.status(201).json(await service.createDeliveryZone(req.auth!.restaurantId, input));
}

export async function update(req: AuthRequest, res: Response) {
  const input = z.object(fields).partial()
    .refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.')
    .parse(req.body);
  return res.json(await service.updateDeliveryZone(req.auth!.restaurantId, String(req.params.id), input));
}

export async function destroy(req: AuthRequest, res: Response) {
  return res.json(await service.deleteDeliveryZone(req.auth!.restaurantId, String(req.params.id)));
}
