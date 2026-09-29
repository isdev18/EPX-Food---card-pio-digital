import { createHash, createHmac, randomBytes } from 'node:crypto';
import { PaymentMethod, Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { orderEvents } from '../lib/events.js';
import { prisma } from '../lib/prisma.js';
import { sendWhatsAppNotification } from '../lib/whatsapp-notifier.js';
import { pricePizza, priceProduct } from './order-pricing.service.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const money = (value: Prisma.Decimal | number | string) => Number(value);

async function sessionFromToken(token: string) {
  const session = await prisma.menuSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { restaurant: true, customer: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.restaurant.active) {
    throw new HttpError(410, 'Este link expirou. Abra o cardápio novamente para continuar.');
  }
  await prisma.menuSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date() } });
  return session;
}

export async function createMenuSession(slug: string, customerId?: string, conversationId?: string) {
  const restaurant = await prisma.restaurant.findFirst({ where: { slug, active: true } });
  if (!restaurant) throw new HttpError(404, 'Estabelecimento não encontrado.');
  if (customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, restaurantId: restaurant.id } });
    if (!customer) throw new HttpError(404, 'Cliente não encontrado.');
  }
  if (conversationId) {
    const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, restaurantId: restaurant.id } });
    if (!conversation) throw new HttpError(404, 'Conversa não encontrada.');
  }
  const token = randomBytes(32).toString('base64url');
  const session = await prisma.menuSession.create({ data: {
    tokenHash: sha256(token), restaurantId: restaurant.id, customerId, conversationId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  } });
  await prisma.analyticsEvent.create({ data: { restaurantId: restaurant.id, menuSessionId: session.id, name: 'menu_view' } });
  return { token, expiresAt: session.expiresAt, path: `/menu/s/${token}` };
}

export async function getPublicMenu(token: string) {
  const session = await sessionFromToken(token);
  const [categories, sizes, flavors, crusts, extras, zones, promotions] = await Promise.all([
    prisma.category.findMany({
      where: { restaurantId: session.restaurantId, active: true }, orderBy: { position: 'asc' },
      include: { products: { where: { archivedAt: null }, orderBy: { name: 'asc' } } },
    }),
    prisma.pizzaSize.findMany({ where: { restaurantId: session.restaurantId, active: true }, orderBy: { priceMultiplier: 'asc' } }),
    prisma.flavor.findMany({ where: { restaurantId: session.restaurantId, active: true }, orderBy: { name: 'asc' } }),
    prisma.crust.findMany({ where: { restaurantId: session.restaurantId, active: true }, orderBy: { price: 'asc' } }),
    prisma.extra.findMany({ where: { restaurantId: session.restaurantId, active: true }, orderBy: { name: 'asc' } }),
    prisma.deliveryZone.findMany({ where: { restaurantId: session.restaurantId, active: true }, orderBy: { neighborhood: 'asc' } }),
    prisma.promotion.findMany({
      where: { restaurantId: session.restaurantId, active: true, startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
      include: { items: true },
    }),
  ]);
  const promoByProduct = new Map(promotions.flatMap((promotion) => promotion.items.map((item) => [item.productId, promotion])));
  return {
    session: { expiresAt: session.expiresAt, customerName: session.customer?.name ?? null },
    restaurant: {
      name: session.restaurant.name, slug: session.restaurant.slug, phone: session.restaurant.phone,
      logoUrl: session.restaurant.logoUrl, bannerUrl: session.restaurant.bannerUrl,
      primaryColor: session.restaurant.primaryColor, secondaryColor: session.restaurant.secondaryColor,
      deliveryEstimateMin: session.restaurant.deliveryEstimateMin, deliveryEstimateMax: session.restaurant.deliveryEstimateMax,
      minimumOrder: money(session.restaurant.minimumOrder), acceptScheduledOrders: session.restaurant.acceptScheduledOrders,
      isOpen: true,
    },
    categories: categories.map((category) => ({ ...category, products: category.products.map((product) => {
      const promotion = promoByProduct.get(product.id);
      return { ...product, basePrice: money(product.basePrice), promotionalPrice: promotion?.promotionalPrice ? money(promotion.promotionalPrice) : null };
    }) })),
    sizes: sizes.map((item) => ({ ...item, priceMultiplier: money(item.priceMultiplier) })),
    flavors: flavors.map((item) => ({ ...item, surcharge: money(item.surcharge) })),
    crusts: crusts.map((item) => ({ ...item, price: money(item.price) })),
    extras: extras.map((item) => ({ ...item, price: money(item.price) })),
    zones: zones.map((item) => ({ ...item, fee: money(item.fee) })),
    promotions: promotions.map((item) => ({ ...item, promotionalPrice: item.promotionalPrice ? money(item.promotionalPrice) : null })),
  };
}

async function getOrCreateSessionCart(sessionId: string, restaurantId: string) {
  return (await prisma.cart.findUnique({ where: { menuSessionId: sessionId } }))
    ?? prisma.cart.create({ data: { menuSessionId: sessionId, restaurantId } });
}

async function cartPayload(sessionId: string, restaurantId: string) {
  const cart = await prisma.cart.findUnique({
    where: { menuSessionId: sessionId },
    include: { items: { include: { product: true }, orderBy: { id: 'asc' } } },
  });
  if (!cart) return { id: null, items: [], subtotal: 0, couponCode: null };
  if (cart.restaurantId !== restaurantId) throw new HttpError(403, 'Carrinho inválido.');
  const subtotal = cart.items.reduce((sum, item) => sum + money(item.subtotal), 0);
  const coupon = cart.couponCode ? await prisma.coupon.findFirst({ where: {
    restaurantId, code: cart.couponCode, active: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  } }) : null;
  const discount = coupon && (coupon.maxUses === null || coupon.uses < coupon.maxUses) && subtotal >= money(coupon.minimumOrder)
    ? Math.min(subtotal, coupon.type === 'PERCENTAGE' ? subtotal * money(coupon.value) / 100 : money(coupon.value)) : 0;
  return {
    id: cart.id,
    items: cart.items.map((item) => ({
      id: item.id, productId: item.productId, name: item.product.name, imageUrl: item.product.imageUrl,
      quantity: item.quantity, sizeName: item.sizeName, flavors: item.flavors, crust: item.crust,
      extras: item.extras, notes: item.notes, unitPrice: money(item.unitPrice), subtotal: money(item.subtotal),
    })),
    subtotal, couponCode: cart.couponCode, discount,
  };
}

export async function getPublicCart(token: string) {
  const session = await sessionFromToken(token);
  return cartPayload(session.id, session.restaurantId);
}

export type PublicCartItemInput = {
  productId: string; quantity: number; notes?: string;
  pizza?: { sizeId: string; flavorIds: string[]; crustId: string; extraIds: string[] };
};

export async function addPublicCartItem(token: string, input: PublicCartItemInput) {
  const session = await sessionFromToken(token);
  const cart = await getOrCreateSessionCart(session.id, session.restaurantId);
  const quantity = Math.min(20, Math.max(1, Math.floor(input.quantity)));
  const priced = input.pizza
    ? await pricePizza(session.restaurantId, input.pizza)
    : await priceProduct(session.restaurantId, input.productId);
  if (priced.productId !== input.productId && !input.pizza) throw new HttpError(422, 'Produto inválido.');
  const config = priced.configuration as Record<string, unknown>;
  await prisma.cartItem.create({ data: {
    cartId: cart.id, productId: priced.productId, quantity,
    sizeName: typeof config.size === 'string' ? config.size : null,
    flavors: input.pizza ? { ids: input.pizza.flavorIds, names: config.flavors } as Prisma.InputJsonValue : undefined,
    crust: input.pizza ? { id: input.pizza.crustId, name: config.crust } as Prisma.InputJsonValue : undefined,
    extras: input.pizza ? { ids: input.pizza.extraIds, names: config.extras } as Prisma.InputJsonValue : undefined,
    notes: input.notes?.trim().slice(0, 180), unitPrice: priced.unitPrice,
    extrasPrice: 0, subtotal: priced.unitPrice * quantity,
  } });
  await prisma.analyticsEvent.create({ data: { restaurantId: session.restaurantId, menuSessionId: session.id, name: 'add_to_cart', payload: { productId: input.productId } } });
  return cartPayload(session.id, session.restaurantId);
}

export async function removePublicCartItem(token: string, itemId: string) {
  const session = await sessionFromToken(token);
  const cart = await prisma.cart.findUnique({ where: { menuSessionId: session.id }, include: { items: true } });
  if (!cart || cart.restaurantId !== session.restaurantId || !cart.items.some((item) => item.id === itemId)) throw new HttpError(404, 'Item não encontrado.');
  await prisma.cartItem.delete({ where: { id: itemId } });
  await prisma.analyticsEvent.create({ data: { restaurantId: session.restaurantId, menuSessionId: session.id, name: 'remove_from_cart', payload: { itemId } } });
  return cartPayload(session.id, session.restaurantId);
}

export async function applyPublicCoupon(token: string, rawCode: string) {
  const session = await sessionFromToken(token);
  const cart = await getOrCreateSessionCart(session.id, session.restaurantId);
  const code = rawCode.trim().toUpperCase();
  const coupon = await prisma.coupon.findFirst({ where: {
    restaurantId: session.restaurantId, code, active: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  } });
  const current = await cartPayload(session.id, session.restaurantId);
  if (!coupon || (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) || current.subtotal < money(coupon.minimumOrder)) {
    throw new HttpError(422, 'Cupom inválido ou indisponível para este pedido.');
  }
  await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: code } });
  await prisma.analyticsEvent.create({ data: { restaurantId: session.restaurantId, menuSessionId: session.id, name: 'coupon_applied', payload: { code } } });
  const discount = coupon.type === 'PERCENTAGE' ? current.subtotal * money(coupon.value) / 100 : money(coupon.value);
  return { code, discount: Math.min(discount, current.subtotal) };
}

type CheckoutInput = {
  idempotencyKey: string; fulfillment: 'DELIVERY' | 'PICKUP'; customer: { name: string; phone: string };
  neighborhood?: string; address?: Record<string, unknown>; paymentMethod: PaymentMethod; changeFor?: number; notes?: string;
};

async function repriceCart(sessionId: string, restaurantId: string) {
  const cart = await prisma.cart.findUnique({ where: { menuSessionId: sessionId }, include: { items: true } });
  if (!cart || !cart.active || cart.items.length === 0) throw new HttpError(422, 'Seu carrinho está vazio.');
  const items = [];
  for (const item of cart.items) {
    if (item.sizeName) {
      const flavors = (item.flavors ?? {}) as { ids?: string[] };
      const crust = (item.crust ?? {}) as { id?: string };
      const extras = (item.extras ?? {}) as { ids?: string[] };
      const size = await prisma.pizzaSize.findFirst({ where: { restaurantId, name: item.sizeName, active: true } });
      if (!size || !crust.id) throw new HttpError(422, 'Uma configuração da pizza não está mais disponível.');
      const priced = await pricePizza(restaurantId, { sizeId: size.id, flavorIds: flavors.ids ?? [], crustId: crust.id, extraIds: extras.ids ?? [] });
      items.push({ ...priced, quantity: item.quantity, notes: item.notes });
    } else {
      const priced = await priceProduct(restaurantId, item.productId);
      items.push({ ...priced, quantity: item.quantity, notes: item.notes });
    }
  }
  return { cart, items };
}

const trackingTokenFor = (restaurantId: string, key: string) => createHmac('sha256', env.JWT_SECRET).update(`track:${restaurantId}:${key}`).digest('base64url');

export async function checkoutPublicCart(token: string, input: CheckoutInput) {
  const session = await sessionFromToken(token);
  const trackingToken = trackingTokenFor(session.restaurantId, input.idempotencyKey);
  const duplicate = await prisma.order.findFirst({ where: { restaurantId: session.restaurantId, idempotencyKey: input.idempotencyKey }, include: { items: true } });
  if (duplicate) return { order: duplicate, trackingToken };
  const { cart, items } = await repriceCart(session.id, session.restaurantId);
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  if (subtotal < money(session.restaurant.minimumOrder)) throw new HttpError(422, `O pedido mínimo é R$ ${money(session.restaurant.minimumOrder).toFixed(2).replace('.', ',')}.`);
  const zone = input.fulfillment === 'DELIVERY'
    ? await prisma.deliveryZone.findFirst({ where: { restaurantId: session.restaurantId, neighborhood: { equals: input.neighborhood ?? '', mode: 'insensitive' }, active: true } })
    : null;
  if (input.fulfillment === 'DELIVERY' && !zone) throw new HttpError(422, 'Selecione uma região de entrega atendida.');
  let discount = 0;
  let coupon: Awaited<ReturnType<typeof prisma.coupon.findFirst>> = null;
  if (cart.couponCode) {
    coupon = await prisma.coupon.findFirst({ where: { restaurantId: session.restaurantId, code: cart.couponCode, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    if (!coupon || (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) || subtotal < money(coupon.minimumOrder)) throw new HttpError(422, 'O cupom deixou de ser válido.');
    discount = coupon.type === 'PERCENTAGE' ? subtotal * money(coupon.value) / 100 : money(coupon.value);
    discount = Math.min(discount, subtotal);
  }
  const deliveryFee = zone ? money(zone.fee) : 0;
  const total = subtotal - discount + deliveryFee;
  const rawPhone = input.customer.phone.replace(/\D/g, '');
  const phone = rawPhone.length === 10 || rawPhone.length === 11 ? `55${rawPhone}` : rawPhone;
  if (phone.length < 10 || phone.length > 15) throw new HttpError(422, 'Informe um telefone válido.');

  const order = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { restaurantId_phone: { restaurantId: session.restaurantId, phone } },
      update: { name: input.customer.name.trim() }, create: { restaurantId: session.restaurantId, phone, name: input.customer.name.trim() },
    });
    const last = await tx.order.findFirst({ where: { restaurantId: session.restaurantId }, orderBy: { number: 'desc' }, select: { number: true } });
    const created = await tx.order.create({ data: {
      restaurantId: session.restaurantId, customerId: customer.id, number: (last?.number ?? 1000) + 1,
      subtotal, deliveryFee, discount, total, paymentMethod: input.paymentMethod,
      address: input.fulfillment === 'DELIVERY' ? { ...input.address, neighborhood: zone!.neighborhood } as Prisma.InputJsonValue : undefined,
      notes: input.notes?.slice(0, 300), estimatedAt: zone ? new Date(Date.now() + zone.estimatedMinutes * 60_000) : undefined,
      idempotencyKey: input.idempotencyKey, trackingTokenHash: sha256(trackingToken), menuSessionId: session.id,
      conversationId: session.conversationId,
      items: { create: items.map((item) => ({ productId: item.productId, name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.unitPrice * item.quantity, configuration: item.configuration, notes: item.notes })) },
      statusHistory: { create: { status: 'NEW' } },
      payment: { create: { method: input.paymentMethod, amount: total, changeFor: input.paymentMethod === 'CASH' ? input.changeFor : undefined } },
    }, include: { items: true, customer: true, statusHistory: true } });
    await tx.cart.update({ where: { id: cart.id }, data: { active: false, checkedOutAt: new Date(), customerId: customer.id } });
    await tx.menuSession.update({ where: { id: session.id }, data: { usedAt: new Date(), customerId: customer.id } });
    await tx.customer.update({ where: { id: customer.id }, data: { lastOrderAt: created.createdAt, orderCount: { increment: 1 }, totalSpent: { increment: total } } });
    if (coupon) await tx.coupon.update({ where: { id: coupon.id }, data: { uses: { increment: 1 } } });
    await tx.analyticsEvent.create({ data: { restaurantId: session.restaurantId, menuSessionId: session.id, name: 'order_created', payload: { orderId: created.id, total } } });
    return created;
  });
  orderEvents.emit('changed', { type: 'ORDER_CREATED', orderId: order.id, restaurantId: session.restaurantId });
  sendWhatsAppNotification({ restaurantId: session.restaurantId, customerId: order.customerId, phone, text: `🍕 *Pedido recebido!*\n\nPedido *#${order.number}*\nTotal: *R$ ${total.toFixed(2).replace('.', ',')}*\n\nStatus: 🕐 Aguardando confirmação.` }).catch(() => undefined);
  return { order, trackingToken };
}

export async function getTrackedOrder(token: string) {
  const order = await prisma.order.findUnique({
    where: { trackingTokenHash: sha256(token) },
    include: { restaurant: { select: { name: true, primaryColor: true } }, items: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
  });
  if (!order) throw new HttpError(404, 'Pedido não encontrado.');
  return order;
}

export async function issueOrderTrackingToken(restaurantId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
  if (!order) throw new HttpError(404, 'Pedido não encontrado.');
  const token = randomBytes(32).toString('base64url');
  await prisma.order.update({ where: { id: order.id }, data: { trackingTokenHash: sha256(token) } });
  return token;
}

export async function recordPublicEvent(token: string, name: string, payload?: Record<string, unknown>) {
  const allowed = new Set(['menu_view', 'product_view', 'add_to_cart', 'remove_from_cart', 'checkout_started', 'coupon_applied', 'order_created']);
  if (!allowed.has(name)) throw new HttpError(422, 'Evento inválido.');
  const session = await sessionFromToken(token);
  await prisma.analyticsEvent.create({ data: { restaurantId: session.restaurantId, menuSessionId: session.id, name, payload: payload as Prisma.InputJsonValue } });
  return { ok: true };
}
