import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';

export type DeliveryZoneInput = {
  neighborhood: string;
  fee: number;
  estimatedMinutes: number;
  active: boolean;
};

const payload = <T extends { fee: unknown }>(zone: T) => ({
  ...zone,
  fee: Number(zone.fee),
});

export async function listDeliveryZones(restaurantId: string) {
  const zones = await prisma.deliveryZone.findMany({
    where: { restaurantId },
    orderBy: [{ active: 'desc' }, { neighborhood: 'asc' }],
  });
  return zones.map(payload);
}

export async function createDeliveryZone(restaurantId: string, input: DeliveryZoneInput) {
  const duplicate = await prisma.deliveryZone.findFirst({
    where: { restaurantId, neighborhood: { equals: input.neighborhood, mode: 'insensitive' } },
  });
  if (duplicate) throw new HttpError(409, 'Já existe uma área de entrega com este bairro.');

  const zone = await prisma.deliveryZone.create({ data: { restaurantId, ...input } });
  return payload(zone);
}

export async function updateDeliveryZone(restaurantId: string, zoneId: string, input: Partial<DeliveryZoneInput>) {
  const zone = await prisma.deliveryZone.findFirst({ where: { id: zoneId, restaurantId } });
  if (!zone) throw new HttpError(404, 'Área de entrega não encontrada.');

  if (input.neighborhood && input.neighborhood.toLocaleLowerCase('pt-BR') !== zone.neighborhood.toLocaleLowerCase('pt-BR')) {
    const duplicate = await prisma.deliveryZone.findFirst({
      where: { restaurantId, id: { not: zone.id }, neighborhood: { equals: input.neighborhood, mode: 'insensitive' } },
    });
    if (duplicate) throw new HttpError(409, 'Já existe uma área de entrega com este bairro.');
  }

  const updated = await prisma.deliveryZone.update({ where: { id: zone.id }, data: input });
  return payload(updated);
}

export async function deleteDeliveryZone(restaurantId: string, zoneId: string) {
  const zone = await prisma.deliveryZone.findFirst({ where: { id: zoneId, restaurantId } });
  if (!zone) throw new HttpError(404, 'Área de entrega não encontrada.');
  await prisma.deliveryZone.delete({ where: { id: zone.id } });
  return { ok: true };
}
