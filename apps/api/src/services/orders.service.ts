import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { orderEvents } from '../lib/events.js';
import { sendWhatsAppNotification } from '../lib/whatsapp-notifier.js';
import { whatsapp } from '../integrations/whatsapp/whatsapp.service.js';
import { HttpError } from '../lib/http-error.js';

export type CreateOrderInput = {
  customerId: string;
  items: {
    productId: string;
    quantity: number;
    configuration?: unknown;
    notes?: string;
    unitPriceOverride?: number;
    nameOverride?: string;
  }[];
  neighborhood?: string;
  paymentMethod: PaymentMethod;
  address?: unknown;
  notes?: string;
};

export const listOrders = (restaurantId: string) => prisma.order.findMany({
  where: { restaurantId }, orderBy: { createdAt: 'desc' }, take: 100,
  include: { customer: true, items: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
});

export async function createOrder(restaurantId: string, input: CreateOrderInput) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirstOrThrow({ where: { id: input.customerId, restaurantId } });
    const ids = input.items.map((item) => item.productId);
    const products = await tx.product.findMany({ where: { id: { in: ids }, restaurantId, active: true } });
    if (products.length !== new Set(ids).size) throw new Error('Um ou mais produtos estão indisponíveis.');
    const productMap = new Map(products.map((product) => [product.id, product]));
    const items = input.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const quantity = Math.max(1, Math.floor(item.quantity));
      const unitPrice = item.unitPriceOverride ?? Number(product.basePrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Preco do item invalido.');
      return { productId: product.id, name: item.nameOverride ?? product.name, quantity, unitPrice, subtotal: unitPrice * quantity, configuration: item.configuration as Prisma.InputJsonValue | undefined, notes: item.notes };
    });
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const zone = input.neighborhood ? await tx.deliveryZone.findFirst({ where: { restaurantId, neighborhood: { equals: input.neighborhood, mode: 'insensitive' }, active: true } }) : null;
    const deliveryFee = zone ? Number(zone.fee) : 0;
    const last = await tx.order.findFirst({ where: { restaurantId }, orderBy: { number: 'desc' }, select: { number: true } });
    const order = await tx.order.create({ data: {
      restaurantId, customerId: customer.id, number: (last?.number ?? 1000) + 1,
      subtotal, deliveryFee, total: subtotal + deliveryFee, paymentMethod: input.paymentMethod,
      status: OrderStatus.NEW,
      address: input.address as Prisma.InputJsonValue | undefined, notes: input.notes,
      estimatedAt: zone ? new Date(Date.now() + zone.estimatedMinutes * 60_000) : undefined,
      items: { create: items }, statusHistory: { create: { status: OrderStatus.NEW } },
    }, include: { customer: true, items: true } });
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        lastOrderAt: order.createdAt,
        orderCount: { increment: 1 },
        totalSpent: { increment: order.total },
      },
    });
    orderEvents.emit('changed', { type: 'ORDER_CREATED', orderId: order.id, restaurantId });
    return order;
  });
}

const transitions: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['PREPARING', 'CANCELLED'], PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED'], OUT_FOR_DELIVERY: ['DELIVERED'], DELIVERED: [], CANCELLED: [],
};

export async function updateOrderStatus(restaurantId: string, orderId: string, status: OrderStatus) {
  const current = await prisma.order.findFirst({ where: { id: orderId, restaurantId }, include: { customer: true, items: true } });
  if (!current) throw new HttpError(404, 'Pedido não encontrado.');
  if (current.status === status) return current;
  const simplifiedTransition = (['NEW', 'CONFIRMED'] as OrderStatus[]).includes(current.status) && status === OrderStatus.PREPARING
    || current.status === OrderStatus.PREPARING && status === OrderStatus.OUT_FOR_DELIVERY && Boolean(current.address);
  if (!transitions[current.status].includes(status) && !simplifiedTransition) throw new HttpError(409, `Transição ${current.status} → ${status} não permitida.`);
  const result = await prisma.$transaction(async (tx) => {
    const changed = await tx.order.updateMany({
      where: { id: current.id, restaurantId, status: current.status },
      data: { status },
    });
    if (!changed.count) {
      const latest = await tx.order.findFirst({ where: { id: orderId, restaurantId }, include: { customer: true, items: true } });
      if (!latest) throw new HttpError(404, 'Pedido não encontrado.');
      if (latest.status === status) return { order: latest, changed: false };
      throw new HttpError(409, 'O status deste pedido mudou. Atualize a tela e tente novamente.');
    }
    await tx.orderStatusHistory.create({ data: { orderId: current.id, status } });
    const order = await tx.order.findUniqueOrThrow({ where: { id: current.id }, include: { customer: true, items: true } });
    return { order, changed: true };
  });
  const { order } = result;
  if (!result.changed) return order;
  orderEvents.emit('changed', { type: 'ORDER_UPDATED', orderId, restaurantId, status });
  const isDelivery = Boolean(order.address);
  const messages: Partial<Record<OrderStatus, string>> = {
    PREPARING: `👨‍🍳 O pedido #${order.number} está sendo preparado.`,
    READY: isDelivery ? `🍕 O pedido #${order.number} está pronto e será enviado em breve!` : `🍕 O pedido #${order.number} está pronto para retirada no balcão!`,
    OUT_FOR_DELIVERY: `🛵 O pedido #${order.number} saiu para entrega!`,
    DELIVERED: isDelivery ? `✅ Pedido #${order.number} entregue. Bom apetite! 🍕` : `✅ Pedido #${order.number} retirado. Obrigado e bom apetite! 🍕`,
    CANCELLED: `O pedido #${order.number} foi cancelado. Se precisar, fale com a nossa equipe.`,
  };
  const message = messages[status];
  if (message) {
    let sentByWeb = false;
    try {
      sentByWeb = await sendWhatsAppNotification({
        restaurantId,
        customerId: order.customerId,
        phone: order.customer.phone,
        text: message,
      });
    } catch (error) {
      console.warn('Não foi possível notificar o cliente pelo WhatsApp Web:', error);
    }
    if (!sentByWeb) await whatsapp.sendText(order.customer.phone, message);
  }
  return order;
}
