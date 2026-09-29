import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { pricePizza, priceProduct, type PizzaSelection } from './order-pricing.service.js';

const jsonObject = (value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};

export async function getOrCreateCart(restaurantId: string, customerId: string) {
  const existing = await prisma.cart.findFirst({ where: { restaurantId, customerId, active: true }, orderBy: { updatedAt: 'desc' } });
  if (existing) return existing;
  return prisma.cart.create({ data: { restaurantId, customerId } });
}

export const loadCart = (restaurantId: string, customerId: string) => prisma.cart.findFirst({
  where: { restaurantId, customerId, active: true },
  orderBy: { updatedAt: 'desc' },
  include: { items: { include: { product: true }, orderBy: { id: 'asc' } } },
});

export async function addProductToCart(restaurantId: string, customerId: string, productId: string, quantity: number) {
  const cart = await getOrCreateCart(restaurantId, customerId);
  const priced = await priceProduct(restaurantId, productId);
  const safeQuantity = Math.min(20, Math.max(1, Math.floor(quantity)));
  return prisma.cartItem.create({ data: {
    cartId: cart.id,
    productId: priced.productId,
    quantity: safeQuantity,
    unitPrice: priced.unitPrice,
    subtotal: priced.unitPrice * safeQuantity,
    extrasPrice: 0,
  } });
}

export async function addPizzaToCart(restaurantId: string, customerId: string, selection: PizzaSelection) {
  const cart = await getOrCreateCart(restaurantId, customerId);
  const priced = await pricePizza(restaurantId, selection);
  const configuration = priced.configuration as Record<string, Prisma.JsonValue>;
  return prisma.cartItem.create({ data: {
    cartId: cart.id,
    productId: priced.productId,
    quantity: 1,
    sizeName: String(configuration.size ?? ''),
    flavors: { ids: configuration.flavorIds, names: configuration.flavors },
    crust: { id: configuration.crustId, name: configuration.crust },
    extras: { ids: configuration.extraIds, names: configuration.extras },
    unitPrice: priced.unitPrice,
    extrasPrice: 0,
    subtotal: priced.unitPrice,
  } });
}

export async function removeCartItem(restaurantId: string, customerId: string, itemId: string) {
  const cart = await loadCart(restaurantId, customerId);
  if (!cart || !cart.items.some((item) => item.id === itemId)) throw new Error('Item do carrinho não encontrado.');
  await prisma.cartItem.delete({ where: { id: itemId } });
}

export async function cancelCart(restaurantId: string, customerId: string) {
  await prisma.cart.updateMany({ where: { restaurantId, customerId, active: true }, data: { active: false } });
}

export async function prepareCartForOrder(restaurantId: string, customerId: string) {
  const cart = await loadCart(restaurantId, customerId);
  if (!cart || cart.items.length === 0) throw new Error('Seu carrinho está vazio.');
  const items = [];
  let priceChanged = false;
  for (const item of cart.items) {
    let priced;
    if (item.sizeName) {
      const flavors = jsonObject(item.flavors);
      const crust = jsonObject(item.crust);
      const extras = jsonObject(item.extras);
      const flavorIds = Array.isArray(flavors.ids) ? flavors.ids.filter((id): id is string => typeof id === 'string') : [];
      const extraIds = Array.isArray(extras.ids) ? extras.ids.filter((id): id is string => typeof id === 'string') : [];
      const size = await prisma.pizzaSize.findFirst({ where: { restaurantId, name: item.sizeName, active: true } });
      if (!size || typeof crust.id !== 'string') throw new Error('A configuração de uma pizza não está mais disponível.');
      priced = await pricePizza(restaurantId, { sizeId: size.id, flavorIds, crustId: crust.id, extraIds });
    } else {
      priced = await priceProduct(restaurantId, item.productId);
    }
    if (Number(item.unitPrice) !== priced.unitPrice) priceChanged = true;
    items.push({
      productId: priced.productId,
      nameOverride: priced.name,
      quantity: item.quantity,
      unitPriceOverride: priced.unitPrice,
      configuration: priced.configuration,
      notes: item.notes ?? undefined,
    });
  }
  return { cart, items, priceChanged };
}

export async function closeCart(cartId: string) {
  await prisma.cart.update({ where: { id: cartId }, data: { active: false } });
}
