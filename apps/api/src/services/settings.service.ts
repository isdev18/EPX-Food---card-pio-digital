import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';

export type RestaurantSettingsInput = {
  name?: string;
  phone?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  addressText?: string | null;
  openingHoursText?: string | null;
  deliveryEstimateMin?: number;
  deliveryEstimateMax?: number;
  minimumOrder?: number;
  acceptScheduledOrders?: boolean;
  halfPizzaPricing?: 'HIGHEST' | 'AVERAGE';
};

function textFromJson(value: Prisma.JsonValue | null, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : '';
}

function payload(restaurant: {
  id: string; name: string; slug: string; phone: string | null; logoUrl: string | null; bannerUrl: string | null;
  primaryColor: string; secondaryColor: string; address: Prisma.JsonValue | null; openingHours: Prisma.JsonValue | null;
  deliveryEstimateMin: number; deliveryEstimateMax: number; minimumOrder: unknown; acceptScheduledOrders: boolean; halfPizzaPricing: string;
}) {
  return {
    ...restaurant,
    addressText: textFromJson(restaurant.address, 'formatted'),
    openingHoursText: textFromJson(restaurant.openingHours, 'description'),
    minimumOrder: Number(restaurant.minimumOrder),
  };
}

export async function getRestaurantSettings(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) throw new HttpError(404, 'Restaurante não encontrado.');
  return payload(restaurant);
}

export async function updateRestaurantSettings(restaurantId: string, input: RestaurantSettingsInput) {
  if (input.deliveryEstimateMin !== undefined && input.deliveryEstimateMax !== undefined && input.deliveryEstimateMax < input.deliveryEstimateMin) {
    throw new HttpError(422, 'O prazo máximo deve ser maior ou igual ao prazo mínimo.');
  }
  const data = {
    name: input.name,
    phone: input.phone,
    logoUrl: input.logoUrl,
    bannerUrl: input.bannerUrl,
    primaryColor: input.primaryColor,
    secondaryColor: input.secondaryColor,
    address: input.addressText === undefined ? undefined : input.addressText ? { formatted: input.addressText } : Prisma.JsonNull,
    openingHours: input.openingHoursText === undefined ? undefined : input.openingHoursText ? { description: input.openingHoursText } : Prisma.JsonNull,
    deliveryEstimateMin: input.deliveryEstimateMin,
    deliveryEstimateMax: input.deliveryEstimateMax,
    minimumOrder: input.minimumOrder,
    acceptScheduledOrders: input.acceptScheduledOrders,
    halfPizzaPricing: input.halfPizzaPricing,
  };
  return payload(await prisma.restaurant.update({ where: { id: restaurantId }, data }));
}
