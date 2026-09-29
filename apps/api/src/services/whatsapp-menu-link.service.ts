import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { createMenuSession } from './public-menu.service.js';

type MenuReplyInput = {
  restaurantId: string;
  customerId: string;
  conversationId: string;
  customerName?: string | null;
};

function publicMenuBaseUrl() {
  return (env.PUBLIC_MENU_URL || env.WEB_URL.split(',')[0]).trim().replace(/\/$/, '');
}

export async function createWhatsAppMenuReply(input: MenuReplyInput) {
  const restaurant = await prisma.restaurant.findFirstOrThrow({
    where: { id: input.restaurantId, active: true },
    select: { name: true, slug: true },
  });
  const session = await createMenuSession(restaurant.slug, input.customerId, input.conversationId);
  const menuUrl = `${publicMenuBaseUrl()}${session.path}`;
  const firstName = input.customerName?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Olá, ${firstName}!` : 'Olá!';

  return {
    menuUrl,
    text: `🍕 *${greeting} Seja bem-vindo à ${restaurant.name}!*

Para ver nosso cardápio com fotos, escolher os produtos e fazer seu pedido, acesse:

${menuUrl}

O pedido é preenchido pelo cardápio online. Por aqui você receberá as atualizações e o aviso quando estiver pronto. ✅`,
  };
}
