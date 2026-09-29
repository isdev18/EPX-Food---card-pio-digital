import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';

type CouponInput = {
  code: string;
  type: 'FIXED' | 'PERCENTAGE';
  value: number;
  minimumOrder: number;
  expiresAt: Date | null;
  maxUses: number | null;
  active: boolean;
};

type PromotionInput = {
  name: string;
  description: string | null;
  promotionalPrice: number | null;
  startsAt: Date;
  endsAt: Date | null;
  active: boolean;
  productIds: string[];
};

const couponPayload = <T extends { value: unknown; minimumOrder: unknown }>(coupon: T) => ({
  ...coupon,
  value: Number(coupon.value),
  minimumOrder: Number(coupon.minimumOrder),
});

const promotionPayload = <T extends { promotionalPrice: unknown }>(promotion: T) => ({
  ...promotion,
  promotionalPrice: promotion.promotionalPrice === null ? null : Number(promotion.promotionalPrice),
});

async function ensureUniqueCoupon(restaurantId: string, code: string, exceptId?: string) {
  const duplicate = await prisma.coupon.findFirst({
    where: { restaurantId, code: { equals: code, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (duplicate) throw new HttpError(409, 'Já existe um cupom com este código.');
}

async function validatePromotionProducts(restaurantId: string, productIds: string[]) {
  const uniqueIds = [...new Set(productIds)];
  const count = await prisma.product.count({ where: { restaurantId, id: { in: uniqueIds }, archivedAt: null } });
  if (count !== uniqueIds.length) throw new HttpError(422, 'Um ou mais produtos da promoção não estão disponíveis.');
  return uniqueIds;
}

export async function listCoupons(restaurantId: string) {
  const coupons = await prisma.coupon.findMany({ where: { restaurantId }, orderBy: { code: 'asc' } });
  return coupons.map(couponPayload);
}

export async function createCoupon(restaurantId: string, input: CouponInput) {
  const code = input.code.toUpperCase();
  await ensureUniqueCoupon(restaurantId, code);
  return couponPayload(await prisma.coupon.create({ data: { restaurantId, ...input, code } }));
}

export async function updateCoupon(restaurantId: string, couponId: string, input: Partial<CouponInput>) {
  const coupon = await prisma.coupon.findFirst({ where: { id: couponId, restaurantId } });
  if (!coupon) throw new HttpError(404, 'Cupom não encontrado.');
  const code = input.code?.toUpperCase();
  if (code) await ensureUniqueCoupon(restaurantId, code, coupon.id);
  return couponPayload(await prisma.coupon.update({ where: { id: coupon.id }, data: { ...input, ...(code ? { code } : {}) } }));
}

export async function deleteCoupon(restaurantId: string, couponId: string) {
  const deleted = await prisma.coupon.deleteMany({ where: { id: couponId, restaurantId } });
  if (!deleted.count) throw new HttpError(404, 'Cupom não encontrado.');
  return { ok: true };
}

export async function listPromotions(restaurantId: string) {
  const promotions = await prisma.promotion.findMany({
    where: { restaurantId },
    include: { items: { include: { product: { select: { id: true, name: true, imageUrl: true } } }, orderBy: { product: { name: 'asc' } } } },
    orderBy: { startsAt: 'desc' },
  });
  return promotions.map(promotionPayload);
}

export async function createPromotion(restaurantId: string, input: PromotionInput) {
  const productIds = await validatePromotionProducts(restaurantId, input.productIds);
  const promotion = await prisma.promotion.create({
    data: {
      restaurantId,
      name: input.name,
      description: input.description,
      promotionalPrice: input.promotionalPrice,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      active: input.active,
      items: { create: productIds.map((productId) => ({ productId })) },
    },
    include: { items: { include: { product: { select: { id: true, name: true, imageUrl: true } } } } },
  });
  return promotionPayload(promotion);
}

export async function updatePromotion(restaurantId: string, promotionId: string, input: Partial<PromotionInput>) {
  const promotion = await prisma.promotion.findFirst({ where: { id: promotionId, restaurantId } });
  if (!promotion) throw new HttpError(404, 'Promoção não encontrada.');
  const productIds = input.productIds ? await validatePromotionProducts(restaurantId, input.productIds) : null;
  const updated = await prisma.$transaction(async (tx) => {
    if (productIds) {
      await tx.promotionItem.deleteMany({ where: { promotionId: promotion.id } });
      await tx.promotionItem.createMany({ data: productIds.map((productId) => ({ promotionId: promotion.id, productId })) });
    }
    return tx.promotion.update({
      where: { id: promotion.id },
      data: {
        name: input.name,
        description: input.description,
        promotionalPrice: input.promotionalPrice,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        active: input.active,
      },
      include: { items: { include: { product: { select: { id: true, name: true, imageUrl: true } } } } },
    });
  });
  return promotionPayload(updated);
}

export async function deletePromotion(restaurantId: string, promotionId: string) {
  const deleted = await prisma.promotion.deleteMany({ where: { id: promotionId, restaurantId } });
  if (!deleted.count) throw new HttpError(404, 'Promoção não encontrada.');
  return { ok: true };
}
