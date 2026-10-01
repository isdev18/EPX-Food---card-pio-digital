import { PaymentMethod, type ConversationState, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { createOrder } from './orders.service.js';

type ConversationSnapshot = {
  state: ConversationState;
  customerId: string;
  context: Prisma.JsonValue | null;
};

type BotContext = {
  menuShown?: boolean;
  categoryIds?: string[];
  productIds?: string[];
  sizeIds?: string[];
  crustIds?: string[];
  selectedProduct?: { id: string; name: string; price: number; isPizza: boolean };
  selectedSize?: { id: string; name: string; multiplier: number };
  selectedCrust?: { id: string; name: string; price: number };
  deliveryType?: 'DELIVERY' | 'PICKUP';
  address?: string;
  payment?: string;
  createdOrderId?: string;
  createdOrderNumber?: number;
};

export type BotConversationReply = {
  next: ConversationState;
  text: string;
  mode?: 'BOT' | 'HUMAN';
  context: BotContext;
};

const mainMenu = `👋 Olá! Seja bem-vindo ao nosso atendimento! 🍕

Digite apenas o número da opção desejada:

1. Fazer um pedido
2. Ver o cardápio completo
3. Ver promoções
4. Acompanhar meu pedido
5. Falar com um atendente

0. Voltar ao início`;

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const choiceOf = (raw: string) => /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null;
const contextOf = (value: Prisma.JsonValue | null): BotContext => value && typeof value === 'object' && !Array.isArray(value) ? value as BotContext : {};

async function categoryMenu(restaurantId: string, context: BotContext): Promise<BotConversationReply> {
  const categories = await prisma.category.findMany({
    where: { restaurantId, active: true, products: { some: { active: true } } },
    orderBy: { position: 'asc' },
  });
  return {
    next: 'CHOOSING_CATEGORY',
    text: `🍕 Escolha uma categoria:\n\n${categories.map((category, index) => `${index + 1}. ${category.name}`).join('\n')}\n\n0. Voltar ao menu principal`,
    context: { menuShown: true, categoryIds: categories.map((category) => category.id) },
  };
}

async function fullCatalog(restaurantId: string, context: BotContext): Promise<BotConversationReply> {
  const categories = await prisma.category.findMany({
    where: { restaurantId, active: true },
    orderBy: { position: 'asc' },
    include: { products: { where: { active: true }, orderBy: { name: 'asc' } } },
  });
  const products = categories.flatMap((category) => category.products);
  let item = 0;
  const sections = categories.filter((category) => category.products.length > 0).map((category) => {
    const lines = category.products.map((product) => `${++item}. ${product.name} — ${money(Number(product.basePrice))}`);
    return `*${category.name}*\n${lines.join('\n')}`;
  });
  return {
    next: 'CHOOSING_PRODUCT',
    text: `📋 *CARDÁPIO*\n\n${sections.join('\n\n')}\n\nDigite o número do item desejado.\n0. Voltar ao menu principal`,
    context: { menuShown: true, productIds: products.map((product) => product.id) },
  };
}

async function paymentMenu(context: BotContext): Promise<BotConversationReply> {
  return {
    next: 'CHOOSING_PAYMENT',
    text: '💳 Escolha a forma de pagamento:\n\n1. PIX\n2. Cartão na entrega\n3. Dinheiro\n\n0. Cancelar pedido',
    context,
  };
}

function orderSummary(context: BotContext) {
  const product = context.selectedProduct;
  if (!product) return 'Item selecionado';
  const multiplier = product.isPizza ? context.selectedSize?.multiplier ?? 1 : 1;
  const crustPrice = product.isPizza ? context.selectedCrust?.price ?? 0 : 0;
  const total = product.price * multiplier + crustPrice;
  return [
    `Item: ${product.name}`,
    product.isPizza && context.selectedSize && `Tamanho: ${context.selectedSize.name}`,
    product.isPizza && context.selectedCrust && `Borda: ${context.selectedCrust.name}`,
    `Valor estimado: ${money(total)}`,
  ].filter(Boolean).join('\n');
}

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function neighborhoodFromAddress(restaurantId: string, address?: string) {
  if (!address) return undefined;
  const addressText = normalized(address);
  const zones = await prisma.deliveryZone.findMany({ where: { restaurantId, active: true } });
  return zones.find((zone) => addressText.includes(normalized(zone.neighborhood)))?.neighborhood;
}

function paymentMethodOf(payment?: string): PaymentMethod {
  if (payment === 'PIX') return PaymentMethod.PIX;
  if (payment === 'Dinheiro') return PaymentMethod.CASH;
  return PaymentMethod.CARD;
}

export async function resolveBotConversation(restaurantId: string, conversation: ConversationSnapshot, raw: string): Promise<BotConversationReply> {
  const text = raw.trim();
  const choice = choiceOf(text);
  const context = contextOf(conversation.context);

  if (choice === 0 || ['cancelar', 'início', 'inicio', 'voltar'].includes(text.toLowerCase())) {
    return { next: 'IDLE', text: mainMenu, context: { menuShown: true } };
  }

  if (conversation.state !== 'IDLE' && !context.menuShown) {
    return { next: 'IDLE', text: mainMenu, context: { menuShown: true } };
  }

  if (conversation.state === 'IDLE') {
    if (!context.menuShown || choice === null) return { next: 'IDLE', text: mainMenu, context: { menuShown: true } };
    if (choice === 1) return categoryMenu(restaurantId, context);
    if (choice === 2) return fullCatalog(restaurantId, context);
    if (choice === 3) {
      const now = new Date();
      const promotions = await prisma.promotion.findMany({
        where: { restaurantId, active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        orderBy: { startsAt: 'desc' },
      });
      const list = promotions.length ? promotions.map((promotion, index) => `${index + 1}. ${promotion.name}${promotion.description ? ` — ${promotion.description}` : ''}`).join('\n') : 'Nenhuma promoção ativa no momento.';
      return { next: 'IDLE', text: `🏷️ *PROMOÇÕES*\n\n${list}\n\n0. Voltar ao menu principal`, context: { menuShown: true } };
    }
    if (choice === 4) {
      const order = await prisma.order.findFirst({ where: { restaurantId, customerId: conversation.customerId }, orderBy: { createdAt: 'desc' } });
      const isDelivery = Boolean(order?.address);
      const labels: Record<string, string> = { NEW: 'Pedido recebido, aguardando o preparo', CONFIRMED: 'Pedido recebido, aguardando o preparo', PREPARING: 'Está sendo preparado', READY: isDelivery ? 'Está sendo preparado' : 'Já está pronto, pode ir retirar', OUT_FOR_DELIVERY: 'O motoboy saiu para entrega', DELIVERED: isDelivery ? 'O motoboy saiu para entrega' : 'Já está pronto, pode ir retirar', CANCELLED: 'Cancelado' };
      const result = order ? `Pedido #${order.number}: ${labels[order.status] ?? order.status}.` : 'Não encontrei pedidos para este número.';
      return { next: 'IDLE', text: `📦 ${result}\n\n0. Voltar ao menu principal`, context: { menuShown: true } };
    }
    if (choice === 5) return { next: 'HUMAN_SUPPORT', text: '👤 Certo! Um atendente assumirá a conversa em instantes.', mode: 'HUMAN', context };
    return { next: 'IDLE', text: `Opção inválida.\n\n${mainMenu}`, context: { menuShown: true } };
  }

  if (conversation.state === 'CHOOSING_CATEGORY') {
    const categoryId = choice ? context.categoryIds?.[choice - 1] : undefined;
    if (!categoryId) return categoryMenu(restaurantId, context);
    const products = await prisma.product.findMany({ where: { restaurantId, categoryId, active: true }, orderBy: { name: 'asc' } });
    return {
      next: 'CHOOSING_PRODUCT',
      text: `Escolha um item:\n\n${products.map((product, index) => `${index + 1}. ${product.name} — ${money(Number(product.basePrice))}`).join('\n')}\n\n0. Voltar ao menu principal`,
      context: { ...context, productIds: products.map((product) => product.id) },
    };
  }

  if (conversation.state === 'CHOOSING_PRODUCT') {
    const productId = choice ? context.productIds?.[choice - 1] : undefined;
    const product = productId ? await prisma.product.findFirst({ where: { id: productId, restaurantId, active: true } }) : null;
    if (!product) return fullCatalog(restaurantId, context);
    const nextContext: BotContext = {
      menuShown: true,
      categoryIds: context.categoryIds,
      productIds: context.productIds,
      selectedProduct: { id: product.id, name: product.name, price: Number(product.basePrice), isPizza: product.isPizza },
    };
    if (!product.isPizza) {
      return { next: 'REVIEWING_CART', text: `✅ *ITEM SELECIONADO*\n\n${product.name}\nQuantidade: 1\nValor: ${money(Number(product.basePrice))}\n\n1. Finalizar pedido\n2. Escolher outro item\n0. Cancelar`, context: nextContext };
    }
    const sizes = await prisma.pizzaSize.findMany({ where: { restaurantId, active: true }, orderBy: { priceMultiplier: 'asc' } });
    return {
      next: 'CHOOSING_SIZE',
      text: `📏 Escolha o tamanho:\n\n${sizes.map((size, index) => `${index + 1}. ${size.name} — ${size.slices} fatias`).join('\n')}\n\n0. Cancelar`,
      context: { ...nextContext, sizeIds: sizes.map((size) => size.id) },
    };
  }

  if (conversation.state === 'CHOOSING_SIZE') {
    const sizeId = choice ? context.sizeIds?.[choice - 1] : undefined;
    const size = sizeId ? await prisma.pizzaSize.findFirst({ where: { id: sizeId, restaurantId, active: true } }) : null;
    if (!size) return { next: 'CHOOSING_SIZE', text: 'Digite somente o número de um tamanho válido ou 0 para cancelar.', context };
    const crusts = await prisma.crust.findMany({ where: { restaurantId, active: true }, orderBy: { price: 'asc' } });
    return {
      next: 'CHOOSING_CRUST',
      text: `Escolha a borda:\n\n${crusts.map((crust, index) => `${index + 1}. ${crust.name}${Number(crust.price) ? ` — +${money(Number(crust.price))}` : ''}`).join('\n')}\n\n0. Cancelar`,
      context: { ...context, selectedSize: { id: size.id, name: size.name, multiplier: Number(size.priceMultiplier) }, crustIds: crusts.map((crust) => crust.id) },
    };
  }

  if (conversation.state === 'CHOOSING_CRUST') {
    const crustId = choice ? context.crustIds?.[choice - 1] : undefined;
    const crust = crustId ? await prisma.crust.findFirst({ where: { id: crustId, restaurantId, active: true } }) : null;
    if (!crust) return { next: 'CHOOSING_CRUST', text: 'Digite somente o número de uma borda válida ou 0 para cancelar.', context };
    const nextContext = { ...context, selectedCrust: { id: crust.id, name: crust.name, price: Number(crust.price) } };
    return { next: 'REVIEWING_CART', text: `🛒 *RESUMO*\n${orderSummary(nextContext)}\n\n1. Finalizar pedido\n2. Escolher outro item\n0. Cancelar`, context: nextContext };
  }

  if (conversation.state === 'REVIEWING_CART') {
    if (choice === 1) return { next: 'CHOOSING_DELIVERY_TYPE', text: 'Como deseja receber?\n\n1. Entrega\n2. Retirada no balcão\n\n0. Cancelar', context };
    if (choice === 2) return categoryMenu(restaurantId, context);
    return { next: 'REVIEWING_CART', text: 'Digite 1 para finalizar, 2 para escolher outro item ou 0 para cancelar.', context };
  }

  if (conversation.state === 'CHOOSING_DELIVERY_TYPE') {
    if (choice === 1) return { next: 'CHOOSING_ADDRESS', text: '📍 Digite seu endereço completo para entrega.', context: { ...context, deliveryType: 'DELIVERY' } };
    if (choice === 2) return paymentMenu({ ...context, deliveryType: 'PICKUP' });
    return { next: 'CHOOSING_DELIVERY_TYPE', text: 'Digite 1 para entrega, 2 para retirada ou 0 para cancelar.', context };
  }

  if (conversation.state === 'CHOOSING_ADDRESS') {
    if (text.length < 8) return { next: 'CHOOSING_ADDRESS', text: 'Informe um endereço completo, incluindo rua e número.', context };
    return paymentMenu({ ...context, address: text });
  }

  if (conversation.state === 'CHOOSING_PAYMENT') {
    const payments: Record<number, string> = { 1: 'PIX', 2: 'Cartão na entrega', 3: 'Dinheiro' };
    if (!choice || !payments[choice]) return paymentMenu(context);
    const nextContext = { ...context, payment: payments[choice] };
    return { next: 'CONFIRMING_ORDER', text: `✅ *CONFIRME SEU PEDIDO*\n${orderSummary(nextContext)}\nPagamento: ${payments[choice]}\n${nextContext.deliveryType === 'PICKUP' ? 'Retirada no balcão' : `Entrega: ${nextContext.address}`}\n\n1. Confirmar pedido\n2. Alterar pedido\n0. Cancelar`, context: nextContext };
  }

  if (conversation.state === 'CONFIRMING_ORDER') {
    if (choice === 1) {
      const product = context.selectedProduct;
      if (!product) return { next: 'IDLE', text: `Não consegui recuperar o item escolhido.\n\n${mainMenu}`, context: { menuShown: true } };

      const unitPrice = product.isPizza
        ? product.price * (context.selectedSize?.multiplier ?? 1) + (context.selectedCrust?.price ?? 0)
        : product.price;
      const neighborhood = context.deliveryType === 'DELIVERY' ? await neighborhoodFromAddress(restaurantId, context.address) : undefined;
      const order = await createOrder(restaurantId, {
        customerId: conversation.customerId,
        items: [{
          productId: product.id,
          quantity: 1,
          unitPriceOverride: unitPrice,
          configuration: {
            ...(product.isPizza && context.selectedSize ? { size: context.selectedSize.name } : {}),
            ...(product.isPizza && context.selectedCrust ? { crust: context.selectedCrust.name } : {}),
            source: 'WHATSAPP_WEB',
          },
        }],
        neighborhood,
        paymentMethod: paymentMethodOf(context.payment),
        address: context.deliveryType === 'DELIVERY' ? {
          street: context.address ?? 'Endereço informado pelo WhatsApp',
          number: '',
          neighborhood: neighborhood ?? '',
          city: '',
          reference: 'Pedido recebido pelo WhatsApp',
        } : undefined,
        notes: context.deliveryType === 'PICKUP' ? 'Retirada no balcão — pedido recebido pelo WhatsApp' : 'Pedido recebido pelo WhatsApp',
      });
      const nextContext = { ...context, createdOrderId: order.id, createdOrderNumber: order.number };
      return {
        next: 'ORDER_CONFIRMED',
        text: `✅ Pedido #${order.number} confirmado e enviado para o sistema!\nTotal: ${money(Number(order.total))}\n\n1. Fazer novo pedido\n2. Ver cardápio\n5. Falar com atendente`,
        context: nextContext,
      };
    }
    if (choice === 2) return categoryMenu(restaurantId, { menuShown: true });
    return { next: 'CONFIRMING_ORDER', text: 'Digite 1 para confirmar, 2 para alterar ou 0 para cancelar.', context };
  }

  if (conversation.state === 'ORDER_CONFIRMED') {
    if (choice === 1) return categoryMenu(restaurantId, { menuShown: true });
    if (choice === 2) return fullCatalog(restaurantId, { menuShown: true });
    if (choice === 5) return { next: 'HUMAN_SUPPORT', text: '👤 Um atendente assumirá a conversa em instantes.', mode: 'HUMAN', context };
    return { next: 'ORDER_CONFIRMED', text: 'Digite 1 para novo pedido, 2 para ver o cardápio ou 5 para falar com atendente.', context };
  }

  return { next: 'IDLE', text: mainMenu, context: { menuShown: true } };
}
