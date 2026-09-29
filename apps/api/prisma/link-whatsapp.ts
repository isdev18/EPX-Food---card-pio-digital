import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const prisma = new PrismaClient();

async function main() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!phoneNumberId) throw new Error('Preencha WHATSAPP_PHONE_NUMBER_ID no arquivo .env antes de vincular.');
  const restaurantSlug = process.argv[2]?.trim() || process.env.RESTAURANT_SLUG?.trim();
  if (!restaurantSlug) throw new Error('Informe o slug: npm run whatsapp:link -w @epx-food/api -- slug-do-restaurante');

  const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: restaurantSlug } });
  await prisma.whatsAppConnection.upsert({
    where: { phoneNumberId },
    update: {
      restaurantId: restaurant.id,
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
      displayPhone: process.env.WHATSAPP_DISPLAY_PHONE || null,
      active: true,
    },
    create: {
      restaurantId: restaurant.id,
      phoneNumberId,
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
      displayPhone: process.env.WHATSAPP_DISPLAY_PHONE || null,
      active: true,
    },
  });

  console.log(`Número da Meta vinculado à ${restaurant.name} com sucesso.`);
}

main().finally(() => prisma.$disconnect());
