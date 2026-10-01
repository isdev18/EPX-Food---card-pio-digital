import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middlewares/auth.js';
import {
  archiveCatalogProduct, createCatalogProduct, createFlavor, createPizzaSize, deleteFlavor, deletePizzaSize,
  listCatalog, listPizzaOptions, updateCatalogProduct, updateFlavor, updatePizzaSize,
} from '../services/catalog.service.js';

const imageSchema = z.union([
  z.string().url().max(2_000).refine((value) => value.startsWith('https://'), 'Use uma URL HTTPS.'),
  z.string().max(950_000).regex(/^data:image\/(?:jpeg|png|webp);base64,/, 'Formato de imagem inválido.'),
  z.null(),
]);

export async function index(req: AuthRequest, res: Response) {
  return res.json(await listCatalog(req.auth!.restaurantId));
}

export async function create(req: AuthRequest, res: Response) {
  const input = z.object({
    categoryId: z.string().min(1),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional(),
    imageUrl: imageSchema.optional(),
    basePrice: z.number().positive().max(100_000),
    isPizza: z.boolean().default(false),
  }).parse(req.body);
  return res.status(201).json(await createCatalogProduct(req.auth!.restaurantId, input));
}

export async function update(req: AuthRequest, res: Response) {
  const input = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    imageUrl: imageSchema.optional(),
    basePrice: z.number().positive().max(100_000).optional(),
    active: z.boolean().optional(),
  }).refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.').parse(req.body);
  return res.json(await updateCatalogProduct(req.auth!.restaurantId, String(req.params.id), input));
}

export async function destroy(req: AuthRequest, res: Response) {
  return res.json(await archiveCatalogProduct(req.auth!.restaurantId, String(req.params.id)));
}

const sizeInput = z.object({
  name: z.string().trim().min(2).max(60), slices: z.number().int().min(1).max(40),
  maxFlavors: z.number().int().min(1).max(4), priceMultiplier: z.number().positive().max(20),
});
const flavorInput = z.object({
  name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).optional(),
  surcharge: z.number().min(0).max(100_000).default(0),
});

export async function pizzaOptionsIndex(req: AuthRequest, res: Response) {
  return res.json(await listPizzaOptions(req.auth!.restaurantId));
}
export async function pizzaSizeCreate(req: AuthRequest, res: Response) {
  return res.status(201).json(await createPizzaSize(req.auth!.restaurantId, sizeInput.parse(req.body)));
}
export async function pizzaSizeUpdate(req: AuthRequest, res: Response) {
  const input = sizeInput.partial().extend({ active: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.').parse(req.body);
  return res.json(await updatePizzaSize(req.auth!.restaurantId, String(req.params.id), input));
}
export async function pizzaSizeDestroy(req: AuthRequest, res: Response) {
  return res.json(await deletePizzaSize(req.auth!.restaurantId, String(req.params.id)));
}
export async function flavorCreate(req: AuthRequest, res: Response) {
  return res.status(201).json(await createFlavor(req.auth!.restaurantId, flavorInput.parse(req.body)));
}
export async function flavorUpdate(req: AuthRequest, res: Response) {
  const input = flavorInput.partial().extend({ active: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.').parse(req.body);
  return res.json(await updateFlavor(req.auth!.restaurantId, String(req.params.id), input));
}
export async function flavorDestroy(req: AuthRequest, res: Response) {
  return res.json(await deleteFlavor(req.auth!.restaurantId, String(req.params.id)));
}
