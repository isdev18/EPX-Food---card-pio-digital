import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export type PizzaSelection = {
  productId?: string;
  sizeId: string;
  flavorIds: string[];
  crustId: string;
  extraIds: string[];
};

export type PricedItem = {
  productId: string;
  name: string;
  unitPrice: number;
  configuration: Prisma.InputJsonValue;
};

export async function priceProduct(restaurantId: string, productId: string): Promise<PricedItem> {
  const product = await prisma.product.findFirst({ where: { id: productId, restaurantId, active: true, archivedAt: null } });
  if (!product) throw new Error('Este produto não está mais disponível.');
  return {
    productId: product.id,
    name: product.name,
    unitPrice: Number(product.basePrice),
    configuration: { kind: 'PRODUCT' },
  };
}

export async function pricePizza(restaurantId: string, selection: PizzaSelection): Promise<PricedItem> {
  const [size, crust, flavors, extras] = await Promise.all([
    prisma.pizzaSize.findFirst({ where: { id: selection.sizeId, restaurantId, active: true } }),
    prisma.crust.findFirst({ where: { id: selection.crustId, restaurantId, active: true } }),
    prisma.flavor.findMany({ where: { id: { in: selection.flavorIds }, restaurantId, active: true } }),
    prisma.extra.findMany({ where: { id: { in: selection.extraIds }, restaurantId, active: true } }),
  ]);
  if (!size || !crust || flavors.length !== new Set(selection.flavorIds).size || selection.flavorIds.length < 1) {
    throw new Error('A configuração da pizza não está mais disponível.');
  }
  if (selection.flavorIds.length > size.maxFlavors) throw new Error('Esse tamanho não permite essa quantidade de sabores.');
  if (extras.length !== new Set(selection.extraIds).size) throw new Error('Um adicional não está mais disponível.');

  const orderedFlavors = selection.flavorIds.map((id) => flavors.find((flavor) => flavor.id === id)!);
  const flavorNames = orderedFlavors.map((flavor) => flavor.name);
  const products = await prisma.product.findMany({
    where: { restaurantId, active: true, archivedAt: null, isPizza: true, name: { in: flavorNames } },
  });
  const selectedProduct = selection.productId
    ? await prisma.product.findFirst({ where: { id: selection.productId, restaurantId, active: true, archivedAt: null, isPizza: true } })
    : null;
  const fallbackProduct = selectedProduct ?? products[0] ?? await prisma.product.findFirst({
    where: { restaurantId, active: true, archivedAt: null, isPizza: true }, orderBy: { name: 'asc' },
  });
  if (!fallbackProduct) throw new Error('Cadastre ao menos uma pizza ativa para vender estes sabores.');
  const productMap = new Map(products.map((product) => [product.name, product]));
  const basePrice = Math.max(...flavorNames.map((name) => Number(productMap.get(name)?.basePrice ?? fallbackProduct.basePrice)));
  const surcharge = Math.max(...orderedFlavors.map((flavor) => Number(flavor.surcharge)), 0);
  const extrasPrice = extras.reduce((sum, extra) => sum + Number(extra.price), 0);
  const unitPrice = basePrice * Number(size.priceMultiplier) + surcharge + Number(crust.price) + extrasPrice;
  const product = selectedProduct ?? productMap.get(flavorNames[0]) ?? fallbackProduct;

  return {
    productId: product.id,
    name: `Pizza ${size.name} — ${flavorNames.join(' / ')}`,
    unitPrice,
    configuration: {
      kind: 'PIZZA',
      sizeId: size.id,
      size: size.name,
      flavorIds: selection.flavorIds,
      flavors: flavorNames,
      crustId: crust.id,
      crust: crust.name,
      extraIds: selection.extraIds,
      extras: extras.map((extra) => extra.name),
    },
  };
}
