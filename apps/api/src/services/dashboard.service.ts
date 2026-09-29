import { OrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export async function getDashboard(restaurantId: string) {
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const orders = await prisma.order.findMany({ where: { restaurantId, createdAt: { gte: since }, status: { not: OrderStatus.CANCELLED } }, include: { items: true } });
  const revenue = orders.reduce((sum, order) => sum + Number(order.total), 0);
  const count = (status: OrderStatus) => orders.filter((order) => order.status === status).length;
  const products = new Map<string, number>();
  orders.flatMap((order) => order.items).forEach((item) => products.set(item.name, (products.get(item.name) ?? 0) + item.quantity));
  return {
    metrics: { orders: orders.length, revenue, averageTicket: orders.length ? revenue / orders.length : 0, preparing: count(OrderStatus.PREPARING), delivering: count(OrderStatus.OUT_FOR_DELIVERY), completed: count(OrderStatus.DELIVERED) },
    topProducts: [...products.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 5),
  };
}
