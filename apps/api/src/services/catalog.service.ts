import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';

const productPayload = <T extends { basePrice: unknown }>(product: T) => ({ ...product, basePrice: Number(product.basePrice) });

export async function listCatalog(restaurantId: string) {
  const categories = await prisma.category.findMany({
  where: { restaurantId, active: true }, orderBy: { position: 'asc' },
    include: { products: { where: { archivedAt: null }, orderBy: { name: 'asc' } } },
  });
  return categories.map((category) => ({ ...category, products: category.products.map(productPayload) }));
}

export async function createCatalogProduct(restaurantId: string, input: { categoryId: string; name: string; description?: string; imageUrl?: string | null; basePrice: number; isPizza: boolean }) {
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, restaurantId, active: true } });
  if (!category) throw new HttpError(404, 'Categoria não encontrada.');
  const duplicate = await prisma.product.findFirst({ where: { restaurantId, name: { equals: input.name, mode: 'insensitive' } } });
  if (duplicate && !duplicate.archivedAt) throw new HttpError(409, 'Já existe um produto com este nome.');
  if (duplicate?.archivedAt) {
    const restored = await prisma.$transaction(async (tx) => {
      const product = await tx.product.update({ where: { id: duplicate.id }, data: { categoryId: category.id, name: input.name, description: input.description, imageUrl: input.imageUrl, basePrice: input.basePrice, active: true, archivedAt: null, isPizza: input.isPizza } });
      if (input.isPizza) {
        await tx.flavor.upsert({ where: { restaurantId_name: { restaurantId, name: input.name } }, update: { description: input.description, active: true }, create: { restaurantId, name: input.name, description: input.description, active: true } });
      }
      return product;
    });
    return productPayload(restored);
  }
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({ data: {
      restaurantId,
      categoryId: category.id,
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
      basePrice: input.basePrice,
      ingredients: [],
      active: true,
      isPizza: input.isPizza,
    } });
    if (input.isPizza) await tx.flavor.create({ data: { restaurantId, name: input.name, description: input.description, active: true } });
    return created;
  });
  return productPayload(product);
}

export async function updateCatalogProduct(restaurantId: string, productId: string, input: { name?: string; description?: string; imageUrl?: string | null; basePrice?: number; active?: boolean }) {
  const product = await prisma.product.findFirst({ where: { id: productId, restaurantId, archivedAt: null } });
  if (!product) throw new HttpError(404, 'Produto não encontrado.');
  if (input.name && input.name.toLocaleLowerCase('pt-BR') !== product.name.toLocaleLowerCase('pt-BR')) {
    const duplicate = await prisma.product.findFirst({ where: { restaurantId, name: { equals: input.name, mode: 'insensitive' }, id: { not: product.id } } });
    if (duplicate) throw new HttpError(409, 'Já existe um produto com este nome.');
  }
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.product.update({ where: { id: product.id }, data: input });
    if (product.isPizza && (input.name !== undefined || input.description !== undefined || input.active !== undefined)) {
      const flavor = await tx.flavor.findUnique({ where: { restaurantId_name: { restaurantId, name: product.name } } });
      const flavorData = {
        name: input.name ?? product.name,
        description: input.description ?? product.description,
        active: input.active ?? product.active,
      };
      if (flavor) await tx.flavor.update({ where: { id: flavor.id }, data: flavorData });
      else await tx.flavor.create({ data: { restaurantId, ...flavorData } });
    }
    return next;
  });
  return productPayload(updated);
}

export async function archiveCatalogProduct(restaurantId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, restaurantId, archivedAt: null } });
  if (!product) throw new HttpError(404, 'Produto não encontrado.');
  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id: product.id }, data: { active: false, archivedAt: new Date() } });
    if (product.isPizza) {
      await tx.flavor.updateMany({ where: { restaurantId, name: product.name }, data: { active: false } });
    }
  });
  return { ok: true };
}

export const listCustomers = (restaurantId: string) => prisma.customer.findMany({
  where: { restaurantId }, orderBy: { createdAt: 'desc' }, include: { addresses: true }, take: 100,
});
