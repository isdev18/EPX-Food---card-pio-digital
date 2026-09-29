import { PaymentMethod, type ConversationState, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { addPizzaToCart, addProductToCart, cancelCart, closeCart, getOrCreateCart, loadCart, prepareCartForOrder, removeCartItem } from './cart.service.js';
import { pricePizza } from './order-pricing.service.js';
import { createOrder } from './orders.service.js';
import { createMenuSession, issueOrderTrackingToken } from './public-menu.service.js';
import { env } from '../config/env.js';

type ConversationSnapshot = { id: string; state: ConversationState; customerId: string; context: Prisma.JsonValue | null };
type AddressDraft = { zipCode?: string; street?: string; number?: string; neighborhood?: string; city?: string; reference?: string };
type FlowContext = {
  menuShown?: boolean;
  cartId?: string;
  orderType?: 'DELIVERY' | 'PICKUP';
  categoryIds?: string[];
  productIds?: string[];
  sizeIds?: string[];
  flavorIds?: string[];
  crustIds?: string[];
  extraIds?: string[];
  cartItemIds?: string[];
  addressIds?: string[];
  selectedProductId?: string;
  selectedSizeId?: string;
  flavorCount?: number;
  selectedFlavorIds?: string[];
  selectedCrustId?: string;
  selectedExtraIds?: string[];
  step?: string;
  address?: AddressDraft;
  neighborhood?: string;
  paymentMethod?: 'PIX' | 'CASH' | 'CARD';
  changeAmount?: number;
  notes?: string;
  confirmedTotal?: number;
  createdOrderId?: string;
  createdOrderNumber?: number;
};

export type OrderConversationReply = { next: ConversationState; text: string; mode?: 'BOT' | 'HUMAN'; context: FlowContext };
type StateHandler = (restaurantId: string, conversation: ConversationSnapshot, text: string, choice: number | null, context: FlowContext) => Promise<OrderConversationReply>;

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const choiceOf = (value: string) => /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
const contextOf = (value: Prisma.JsonValue | null): FlowContext => value && typeof value === 'object' && !Array.isArray(value) ? value as FlowContext : {};
const jsonObject = (value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};

const welcome = `🍕 *Atendimento do restaurante*

Olá! 👋
Como podemos ajudar?

*1* - 🍕 Fazer pedido
*2* - 🛵 Acompanhar pedido
*3* - 👤 Falar com atendente

_Responda apenas com o número da opção._`;

const orderTypeText = `🍕 *Vamos fazer seu pedido!*

Como deseja receber?

*1* - 🛵 Entrega
*2* - 🏪 Retirada no local
*0* - ↩️ Voltar`;

const humanReply = (context: FlowContext): OrderConversationReply => ({
  next: 'HUMAN_SUPPORT',
  mode: 'HUMAN',
  context,
  text: '👤 *Atendimento*\n\nCerto! Vou encaminhar sua conversa para um atendente.\n\nAguarde um momento. 😉',
});

function orderBase(context: FlowContext): FlowContext {
  return { menuShown: true, ...(context.cartId ? { cartId: context.cartId } : {}), ...(context.orderType ? { orderType: context.orderType } : {}) };
}

async function categoryMenu(restaurantId: string, context: FlowContext): Promise<OrderConversationReply> {
  const categories = await prisma.category.findMany({
    where: { restaurantId, active: true, products: { some: { active: true } } },
    orderBy: { position: 'asc' },
  });
  const icon = (name: string) => normalized(name).includes('pizza') ? '🍕' : normalized(name).includes('bebida') ? '🥤' : normalized(name).includes('por') ? '🍟' : normalized(name).includes('sobrem') ? '🍰' : '🍽️';
  return {
    next: 'CHOOSING_CATEGORY',
    context: { ...orderBase(context), categoryIds: categories.map((category) => category.id) },
    text: `🍽️ *O que deseja pedir?*\n\n${categories.map((category, index) => `*${index + 1}* - ${icon(category.name)} ${category.name}`).join('\n')}\n\n*9* - 🛒 Ver carrinho\n*0* - ❌ Cancelar pedido`,
  };
}

async function productMenu(restaurantId: string, categoryId: string, context: FlowContext): Promise<OrderConversationReply> {
  const category = await prisma.category.findFirst({ where: { id: categoryId, restaurantId, active: true } });
  const products = await prisma.product.findMany({ where: { restaurantId, categoryId, active: true, isPizza: false }, orderBy: { name: 'asc' } });
  return {
    next: 'CHOOSING_PRODUCT',
    context: { ...orderBase(context), productIds: products.map((product) => product.id) },
    text: `🥤 *${category?.name ?? 'Escolha um item'}*\n\n${products.map((product, index) => `*${index + 1}* - ${product.name} — ${money(Number(product.basePrice))}`).join('\n')}\n\n*0* - ↩️ Voltar`,
  };
}

async function sizeMenu(restaurantId: string, context: FlowContext): Promise<OrderConversationReply> {
  const [sizes, cheapest] = await Promise.all([
    prisma.pizzaSize.findMany({ where: { restaurantId, active: true }, orderBy: { priceMultiplier: 'asc' } }),
    prisma.product.findFirst({ where: { restaurantId, active: true, isPizza: true }, orderBy: { basePrice: 'asc' } }),
  ]);
  const base = Number(cheapest?.basePrice ?? 0);
  return {
    next: 'CHOOSING_SIZE',
    context: { ...orderBase(context), sizeIds: sizes.map((size) => size.id) },
    text: `🍕 *Escolha o tamanho da pizza:*\n\n${sizes.map((size, index) => `*${index + 1}* - ${size.name} — a partir de ${money(base * Number(size.priceMultiplier))}`).join('\n')}\n\n*0* - ↩️ Voltar`,
  };
}

async function flavorCountMenu(restaurantId: string, context: FlowContext): Promise<OrderConversationReply> {
  const size = context.selectedSizeId ? await prisma.pizzaSize.findFirst({ where: { id: context.selectedSizeId, restaurantId, active: true } }) : null;
  if (!size) return sizeMenu(restaurantId, context);
  return {
    next: 'CHOOSING_FLAVOR',
    context: { ...context, step: 'COUNT' },
    text: `🍕 *Quantos sabores?*\n\n*1* - Um sabor${size.maxFlavors > 1 ? '\n*2* - Dois sabores' : ''}\n\n*0* - ↩️ Voltar`,
  };
}

async function flavorMenu(restaurantId: string, context: FlowContext, step: 'FLAVOR_1' | 'FLAVOR_2'): Promise<OrderConversationReply> {
  const flavors = await prisma.flavor.findMany({ where: { restaurantId, active: true }, orderBy: { name: 'asc' } });
  const chosen = new Set(context.selectedFlavorIds ?? []);
  const available = step === 'FLAVOR_2' ? flavors.filter((flavor) => !chosen.has(flavor.id)) : flavors;
  return {
    next: 'CHOOSING_FLAVOR',
    context: { ...context, step, flavorIds: available.map((flavor) => flavor.id) },
    text: `🍕 *${step === 'FLAVOR_2' ? 'Agora escolha o segundo sabor:' : 'Escolha o sabor:'}*\n\n${available.map((flavor, index) => `*${index + 1}* - ${flavor.name}${flavor.description ? `\n${flavor.description}` : ''}`).join('\n\n')}\n\n*0* - ↩️ Voltar`,
  };
}

async function crustMenu(restaurantId: string, context: FlowContext): Promise<OrderConversationReply> {
  const crusts = await prisma.crust.findMany({ where: { restaurantId, active: true }, orderBy: { price: 'asc' } });
  return {
    next: 'CHOOSING_CRUST',
    context: { ...context, crustIds: crusts.map((crust) => crust.id) },
    text: `🧀 *Deseja borda recheada?*\n\n${crusts.map((crust, index) => `*${index + 1}* - ${crust.name}${Number(crust.price) ? ` + ${money(Number(crust.price))}` : ''}`).join('\n')}\n\n*0* - ↩️ Voltar`,
  };
}

async function extrasMenu(restaurantId: string, context: FlowContext): Promise<OrderConversationReply> {
  const extras = await prisma.extra.findMany({ where: { restaurantId, active: true }, orderBy: { name: 'asc' } });
  if (!extras.length) return confirmPizzaMenu(restaurantId, { ...context, selectedExtraIds: [] });
  return {
    next: 'CHOOSING_EXTRAS',
    context: { ...context, extraIds: extras.map((extra) => extra.id) },
    text: `➕ *Deseja algum adicional?*\n\n${extras.map((extra, index) => `*${index + 1}* - ${extra.name} + ${money(Number(extra.price))}`).join('\n')}\n*${extras.length + 1}* - Não quero adicionais\n\n*0* - ↩️ Voltar`,
  };
}

async function confirmPizzaMenu(restaurantId: string, context: FlowContext): Promise<OrderConversationReply> {
  if (!context.selectedSizeId || !context.selectedCrustId || !context.selectedFlavorIds?.length) return sizeMenu(restaurantId, context);
  const priced = await pricePizza(restaurantId, { sizeId: context.selectedSizeId, flavorIds: context.selectedFlavorIds, crustId: context.selectedCrustId, extraIds: context.selectedExtraIds ?? [] });
  const config = priced.configuration as Record<string, unknown>;
  const flavors = Array.isArray(config.flavors) ? config.flavors.map(String) : [];
  const extras = Array.isArray(config.extras) ? config.extras.map(String) : [];
  return {
    next: 'REVIEWING_CART',
    context: { ...context, step: 'CONFIRM_ITEM' },
    text: `🍕 *Sua pizza*\n\n${String(config.size)}\n${flavors.map((flavor) => `${flavors.length > 1 ? '½ ' : ''}${flavor}`).join('\n')}\n\nBorda: ${String(config.crust)}${extras.length ? `\nAdicionais: ${extras.join(', ')}` : ''}\n\n*${money(priced.unitPrice)}*\n\nEstá correto?\n\n*1* - ✅ Adicionar ao carrinho\n*2* - ✏️ Alterar\n*0* - ❌ Cancelar`,
  };
}

function formatCart(cart: Awaited<ReturnType<typeof loadCart>>) {
  if (!cart || !cart.items.length) return 'Seu carrinho está vazio.';
  return cart.items.map((item) => {
    if (!item.sizeName) return `*${item.quantity}x ${item.product.name}*\n${money(Number(item.subtotal))}`;
    const flavors = jsonObject(item.flavors);
    const crust = jsonObject(item.crust);
    const names = Array.isArray(flavors.names) ? flavors.names.map(String) : [];
    return `*${item.quantity}x Pizza ${item.sizeName}*\n${names.map((name) => `${names.length > 1 ? '½ ' : ''}${name}`).join('\n')}\nBorda ${String(crust.name ?? '')}\n${money(Number(item.subtotal))}`;
  }).join('\n\n');
}

async function cartMenu(restaurantId: string, customerId: string, context: FlowContext, viewOnly = false): Promise<OrderConversationReply> {
  const cart = await loadCart(restaurantId, customerId);
  const subtotal = cart?.items.reduce((sum, item) => sum + Number(item.subtotal), 0) ?? 0;
  return {
    next: 'REVIEWING_CART',
    context: { ...orderBase(context), step: viewOnly ? 'CART_VIEW' : 'CART_MENU' },
    text: `🛒 *SEU PEDIDO*\n\n${formatCart(cart)}\n\n──────────────\nSubtotal: *${money(subtotal)}*\n\n${viewOnly ? '*1* - ➕ Adicionar item\n*2* - 🗑️ Remover item\n*3* - ✅ Finalizar pedido\n*0* - ↩️ Voltar' : '*1* - 🍕 Adicionar outra pizza\n*2* - 🥤 Adicionar bebida\n*3* - 🍽️ Adicionar outro produto\n*4* - 🛒 Ver carrinho\n*5* - ✅ Finalizar pedido\n*0* - ❌ Cancelar pedido'}`,
  };
}

async function cancelConfirmation(context: FlowContext): Promise<OrderConversationReply> {
  return { next: 'REVIEWING_CART', context: { ...context, step: 'CANCEL_CONFIRM' }, text: '⚠️ *Cancelar pedido?*\n\nSeu carrinho será apagado.\n\n*1* - Sim, cancelar\n*2* - Não, continuar' };
}

async function startAddress(restaurantId: string, customerId: string, context: FlowContext): Promise<OrderConversationReply> {
  if (context.orderType === 'PICKUP') return paymentMenu({ ...context, address: undefined, neighborhood: undefined });
  const addresses = await prisma.address.findMany({ where: { restaurantId, customerId }, orderBy: { createdAt: 'desc' } });
  if (!addresses.length) return { next: 'CHOOSING_ADDRESS', context: { ...context, step: 'CEP', address: {} }, text: '📍 Digite seu *CEP*:' };
  return {
    next: 'CHOOSING_ADDRESS',
    context: { ...context, step: 'SELECT', addressIds: addresses.map((address) => address.id) },
    text: `📍 *Onde devemos entregar?*\n\n${addresses.map((address, index) => `*${index + 1}* - ${address.street}, ${address.number} - ${address.neighborhood}`).join('\n')}\n*${addresses.length + 1}* - ➕ Cadastrar novo endereço\n\n*0* - ↩️ Voltar`,
  };
}

function paymentMenu(context: FlowContext): OrderConversationReply {
  return { next: 'CHOOSING_PAYMENT', context: { ...context, step: 'PAYMENT' }, text: '💳 *Como deseja pagar?*\n\n*1* - PIX\n*2* - 💵 Dinheiro\n*3* - 💳 Cartão na entrega\n\n*0* - ↩️ Voltar' };
}

function notesMenu(context: FlowContext): OrderConversationReply {
  return { next: 'CHOOSING_PAYMENT', context: { ...context, step: 'NOTES_DECISION' }, text: '📝 *Deseja adicionar alguma observação?*\n\n*1* - Sim\n*2* - Não' };
}

async function finalConfirmation(restaurantId: string, customerId: string, context: FlowContext): Promise<OrderConversationReply> {
  const prepared = await prepareCartForOrder(restaurantId, customerId);
  const subtotal = prepared.items.reduce((sum, item) => sum + Number(item.unitPriceOverride) * item.quantity, 0);
  const zone = context.neighborhood ? await prisma.deliveryZone.findFirst({ where: { restaurantId, neighborhood: { equals: context.neighborhood, mode: 'insensitive' }, active: true } }) : null;
  const deliveryFee = zone ? Number(zone.fee) : 0;
  const total = subtotal + deliveryFee;
  const cart = await loadCart(restaurantId, customerId);
  const address = context.orderType === 'PICKUP' ? 'Retirada no local' : `${context.address?.street}, ${context.address?.number}\n${context.address?.neighborhood}`;
  return {
    next: 'CONFIRMING_ORDER',
    context: { ...context, confirmedTotal: total },
    text: `${prepared.priceChanged ? '⚠️ Um preço foi atualizado. Confira novamente.\n\n' : ''}🍕 *CONFIRME SEU PEDIDO*\n\n${formatCart(cart)}\n\n──────────────\nSubtotal: ${money(subtotal)}\nEntrega: ${money(deliveryFee)}\n*TOTAL: ${money(total)}*\n\n📍 ${address}\n💳 Pagamento: ${context.paymentMethod}${context.changeAmount ? `\nTroco para: ${money(context.changeAmount)}` : ''}${context.notes ? `\n📝 Observação: ${context.notes}` : ''}\n\n*1* - ✅ CONFIRMAR PEDIDO\n*2* - ✏️ ALTERAR\n*3* - ❌ CANCELAR`,
  };
}

const handlers: Partial<Record<ConversationState, StateHandler>> = {
  IDLE: async (restaurantId, conversation, _text, choice, context) => {
    if (!context.menuShown || choice === null) return { next: 'IDLE', text: welcome, context: { menuShown: true } };
    if (choice === 1) {
      const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { slug: true } });
      const session = await createMenuSession(restaurant.slug, conversation.customerId, conversation.id);
      const webUrl = env.WEB_URL.split(',')[0].replace(/\/$/, '');
      return { next: 'IDLE', context: { menuShown: true }, text: `🍕 *Bora montar seu pedido!*\n\nNo nosso cardápio você encontra fotos, preços, promoções e todas as opções disponíveis.\n\n👇 Acesse:\n${webUrl}${session.path}` };
    }
    if (choice === 2) {
      const order = await prisma.order.findFirst({ where: { restaurantId, customerId: conversation.customerId, status: { notIn: ['DELIVERED', 'CANCELLED'] } }, orderBy: { createdAt: 'desc' } });
      const labels: Record<string, string> = { NEW: 'Aguardando confirmação', CONFIRMED: 'Confirmado', PREPARING: 'Em preparação', READY: order?.address ? 'Pronto' : 'Pronto para retirada', OUT_FOR_DELIVERY: 'Saiu para entrega' };
      const trackingToken = order ? await issueOrderTrackingToken(restaurantId, order.id) : null;
      const webUrl = env.WEB_URL.split(',')[0].replace(/\/$/, '');
      return { next: 'IDLE', context: { menuShown: true }, text: order ? `🛵 *Pedido #${order.number}*\n\nStatus: ${labels[order.status] ?? order.status}\nTotal: ${money(Number(order.total))}${order.estimatedAt ? `\nPrevisão: ${order.estimatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}\n\nAcompanhe em tempo real:\n${webUrl}/pedido/${trackingToken}` : 'Não encontrei pedido ativo para este número.\n\n*0* - ↩️ Voltar' };
    }
    if (choice === 3) return humanReply(context);
    return { next: 'IDLE', text: `⚠️ Não encontrei essa opção.\n\n${welcome}`, context: { menuShown: true } };
  },

  CHOOSING_DELIVERY_TYPE: async (restaurantId, conversation, _text, choice, context) => {
    if (choice === 0) return { next: 'IDLE', text: welcome, context: { menuShown: true } };
    if (choice !== 1 && choice !== 2) return { next: 'CHOOSING_DELIVERY_TYPE', text: `⚠️ Não encontrei essa opção.\n\n${orderTypeText}`, context };
    const cart = await getOrCreateCart(restaurantId, conversation.customerId);
    return categoryMenu(restaurantId, { ...context, cartId: cart.id, orderType: choice === 1 ? 'DELIVERY' : 'PICKUP' });
  },

  CHOOSING_CATEGORY: async (restaurantId, conversation, _text, choice, context) => {
    if (choice === 0) return cancelConfirmation(context);
    if (choice === 9) return cartMenu(restaurantId, conversation.customerId, context, true);
    const categoryId = choice ? context.categoryIds?.[choice - 1] : undefined;
    if (!categoryId) return categoryMenu(restaurantId, context);
    const pizzaCategory = await prisma.product.count({ where: { restaurantId, categoryId, active: true, isPizza: true } });
    return pizzaCategory ? sizeMenu(restaurantId, context) : productMenu(restaurantId, categoryId, context);
  },

  CHOOSING_PRODUCT: async (restaurantId, _conversation, _text, choice, context) => {
    if (choice === 0) return categoryMenu(restaurantId, context);
    const productId = choice ? context.productIds?.[choice - 1] : undefined;
    const product = productId ? await prisma.product.findFirst({ where: { id: productId, restaurantId, active: true, isPizza: false } }) : null;
    if (!product) return { next: 'CHOOSING_PRODUCT', context, text: '⚠️ Escolha somente um número válido da lista ou 0 para voltar.' };
    return { next: 'CHOOSING_DRINK', context: { ...context, selectedProductId: product.id }, text: `🥤 *${product.name}*\n\nQuantas unidades?\n\n*1* - 1\n*2* - 2\n*3* - 3\n*4* - 4\n\n*0* - ↩️ Voltar` };
  },

  CHOOSING_DRINK: async (restaurantId, conversation, _text, choice, context) => {
    if (choice === 0) return categoryMenu(restaurantId, context);
    if (!choice || choice < 1 || choice > 4 || !context.selectedProductId) return { next: 'CHOOSING_DRINK', context, text: '⚠️ Digite 1, 2, 3 ou 4 para escolher a quantidade.\n\n*0* - ↩️ Voltar' };
    await addProductToCart(restaurantId, conversation.customerId, context.selectedProductId, choice);
    return cartMenu(restaurantId, conversation.customerId, context);
  },

  CHOOSING_SIZE: async (restaurantId, _conversation, _text, choice, context) => {
    if (choice === 0) return categoryMenu(restaurantId, context);
    const sizeId = choice ? context.sizeIds?.[choice - 1] : undefined;
    if (!sizeId) return sizeMenu(restaurantId, context);
    return flavorCountMenu(restaurantId, { ...context, selectedSizeId: sizeId });
  },

  CHOOSING_FLAVOR: async (restaurantId, _conversation, _text, choice, context) => {
    if (context.step === 'COUNT') {
      if (choice === 0) return sizeMenu(restaurantId, context);
      const size = context.selectedSizeId ? await prisma.pizzaSize.findFirst({ where: { id: context.selectedSizeId, restaurantId, active: true } }) : null;
      if (!choice || choice < 1 || choice > Math.min(2, size?.maxFlavors ?? 1)) return flavorCountMenu(restaurantId, context);
      return flavorMenu(restaurantId, { ...context, flavorCount: choice, selectedFlavorIds: [] }, 'FLAVOR_1');
    }
    if (choice === 0) return context.step === 'FLAVOR_2' ? flavorMenu(restaurantId, { ...context, selectedFlavorIds: [] }, 'FLAVOR_1') : flavorCountMenu(restaurantId, context);
    const flavorId = choice ? context.flavorIds?.[choice - 1] : undefined;
    if (!flavorId) return flavorMenu(restaurantId, context, context.step === 'FLAVOR_2' ? 'FLAVOR_2' : 'FLAVOR_1');
    const selected = [...(context.selectedFlavorIds ?? []), flavorId];
    if ((context.flavorCount ?? 1) > selected.length) return flavorMenu(restaurantId, { ...context, selectedFlavorIds: selected }, 'FLAVOR_2');
    return crustMenu(restaurantId, { ...context, selectedFlavorIds: selected });
  },

  CHOOSING_CRUST: async (restaurantId, _conversation, _text, choice, context) => {
    if (choice === 0) return flavorMenu(restaurantId, { ...context, selectedFlavorIds: [] }, 'FLAVOR_1');
    const crustId = choice ? context.crustIds?.[choice - 1] : undefined;
    if (!crustId) return crustMenu(restaurantId, context);
    return extrasMenu(restaurantId, { ...context, selectedCrustId: crustId });
  },

  CHOOSING_EXTRAS: async (restaurantId, _conversation, _text, choice, context) => {
    if (choice === 0) return crustMenu(restaurantId, context);
    const noExtras = (context.extraIds?.length ?? 0) + 1;
    if (choice === noExtras) return confirmPizzaMenu(restaurantId, { ...context, selectedExtraIds: [] });
    const extraId = choice ? context.extraIds?.[choice - 1] : undefined;
    if (!extraId) return extrasMenu(restaurantId, context);
    return confirmPizzaMenu(restaurantId, { ...context, selectedExtraIds: [extraId] });
  },

  REVIEWING_CART: async (restaurantId, conversation, _text, choice, context) => {
    if (context.step === 'CONFIRM_ITEM') {
      if (choice === 1 && context.selectedSizeId && context.selectedFlavorIds && context.selectedCrustId) {
        await addPizzaToCart(restaurantId, conversation.customerId, { sizeId: context.selectedSizeId, flavorIds: context.selectedFlavorIds, crustId: context.selectedCrustId, extraIds: context.selectedExtraIds ?? [] });
        return cartMenu(restaurantId, conversation.customerId, context);
      }
      if (choice === 2) return sizeMenu(restaurantId, context);
      if (choice === 0) return cancelConfirmation(context);
      return confirmPizzaMenu(restaurantId, context);
    }
    if (context.step === 'CANCEL_CONFIRM') {
      if (choice === 1) { await cancelCart(restaurantId, conversation.customerId); return { next: 'IDLE', context: { menuShown: true }, text: `Pedido cancelado.\n\n${welcome}` }; }
      if (choice === 2) return cartMenu(restaurantId, conversation.customerId, context);
      return cancelConfirmation(context);
    }
    if (context.step === 'REMOVE_SELECT') {
      if (choice === 0) return cartMenu(restaurantId, conversation.customerId, context, true);
      const itemId = choice ? context.cartItemIds?.[choice - 1] : undefined;
      if (!itemId) return cartMenu(restaurantId, conversation.customerId, context, true);
      return { next: 'REVIEWING_CART', context: { ...context, step: 'REMOVE_CONFIRM', cartItemIds: [itemId] }, text: '🗑️ Remover este item?\n\n*1* - Sim\n*2* - Não' };
    }
    if (context.step === 'REMOVE_CONFIRM') {
      if (choice === 1 && context.cartItemIds?.[0]) await removeCartItem(restaurantId, conversation.customerId, context.cartItemIds[0]);
      return cartMenu(restaurantId, conversation.customerId, context, true);
    }
    const view = context.step === 'CART_VIEW';
    if (view) {
      if (choice === 0) return cartMenu(restaurantId, conversation.customerId, context);
      if (choice === 1) return categoryMenu(restaurantId, context);
      if (choice === 2) {
        const cart = await loadCart(restaurantId, conversation.customerId);
        if (!cart?.items.length) return cartMenu(restaurantId, conversation.customerId, context, true);
        return { next: 'REVIEWING_CART', context: { ...context, step: 'REMOVE_SELECT', cartItemIds: cart.items.map((item) => item.id) }, text: `🗑️ *Qual item deseja remover?*\n\n${cart.items.map((item, index) => `*${index + 1}* - ${item.sizeName ? `Pizza ${item.sizeName}` : item.product.name} — ${money(Number(item.subtotal))}`).join('\n')}\n\n*0* - Cancelar` };
      }
      if (choice === 3) return startAddress(restaurantId, conversation.customerId, context);
      return cartMenu(restaurantId, conversation.customerId, context, true);
    }
    if (choice === 0) return cancelConfirmation(context);
    if (choice === 1) return sizeMenu(restaurantId, context);
    if (choice === 2) {
      const category = await prisma.category.findFirst({ where: { restaurantId, active: true, name: { contains: 'Bebida', mode: 'insensitive' } } });
      return category ? productMenu(restaurantId, category.id, context) : categoryMenu(restaurantId, context);
    }
    if (choice === 3) return categoryMenu(restaurantId, context);
    if (choice === 4) return cartMenu(restaurantId, conversation.customerId, context, true);
    if (choice === 5) return startAddress(restaurantId, conversation.customerId, context);
    return cartMenu(restaurantId, conversation.customerId, context);
  },

  CHOOSING_ADDRESS: async (restaurantId, conversation, text, choice, context) => {
    if (choice === 0 && context.step !== 'NUMBER') return cartMenu(restaurantId, conversation.customerId, context, true);
    if (context.step === 'SELECT') {
      const addressId = choice ? context.addressIds?.[choice - 1] : undefined;
      if (addressId) {
        const address = await prisma.address.findFirst({ where: { id: addressId, restaurantId, customerId: conversation.customerId } });
        if (address) return paymentMenu({ ...context, address: { zipCode: address.zipCode ?? undefined, street: address.street, number: address.number, neighborhood: address.neighborhood, city: address.city, reference: address.reference ?? undefined }, neighborhood: address.neighborhood });
      }
      if (choice === (context.addressIds?.length ?? 0) + 1) return { next: 'CHOOSING_ADDRESS', context: { ...context, step: 'CEP', address: {} }, text: '📍 Digite seu *CEP*:' };
      return startAddress(restaurantId, conversation.customerId, context);
    }
    if (context.step === 'CEP') {
      if (text.replace(/\D/g, '').length !== 8) return { next: 'CHOOSING_ADDRESS', context, text: '⚠️ Digite um CEP com 8 números.' };
      return { next: 'CHOOSING_ADDRESS', context: { ...context, step: 'STREET', address: { ...context.address, zipCode: text } }, text: 'Digite o nome da *rua*:' };
    }
    if (context.step === 'STREET') {
      if (text.length < 3) return { next: 'CHOOSING_ADDRESS', context, text: 'Informe o nome completo da rua.' };
      return { next: 'CHOOSING_ADDRESS', context: { ...context, step: 'NUMBER', address: { ...context.address, street: text } }, text: 'Digite o *número*:' };
    }
    if (context.step === 'NUMBER') {
      return { next: 'CHOOSING_ADDRESS', context: { ...context, step: 'NEIGHBORHOOD', address: { ...context.address, number: text } }, text: 'Digite o *bairro*:' };
    }
    if (context.step === 'NEIGHBORHOOD') {
      const zone = await prisma.deliveryZone.findFirst({ where: { restaurantId, neighborhood: { equals: text, mode: 'insensitive' }, active: true } });
      if (!zone) return { next: 'CHOOSING_ADDRESS', context: { ...context, step: 'UNSUPPORTED' }, text: '⚠️ Não conseguimos calcular automaticamente a entrega para esse bairro.\n\n*1* - Falar com atendente\n*0* - Voltar' };
      return { next: 'CHOOSING_ADDRESS', context: { ...context, step: 'REFERENCE', neighborhood: zone.neighborhood, address: { ...context.address, neighborhood: zone.neighborhood, city: 'Alagoinhas' } }, text: `📍 *Entrega para ${zone.neighborhood}*\nTaxa: ${money(Number(zone.fee))}\nPrevisão: ${zone.estimatedMinutes} minutos\n\nDigite um ponto de referência ou *não*:` };
    }
    if (context.step === 'UNSUPPORTED') {
      if (choice === 1) return humanReply(context);
      return { next: 'CHOOSING_ADDRESS', context: { ...context, step: 'NEIGHBORHOOD' }, text: 'Digite o *bairro*:' };
    }
    if (context.step === 'REFERENCE') {
      const address = { ...context.address, reference: normalized(text) === 'nao' ? undefined : text };
      return { next: 'CHOOSING_ADDRESS', context: { ...context, step: 'CONFIRM', address }, text: `📍 *Confirme o endereço*\n\n${address.street}, ${address.number}\n${address.neighborhood}\nCEP: ${address.zipCode}${address.reference ? `\nReferência: ${address.reference}` : ''}\n\n*1* - Confirmar\n*2* - Alterar\n*0* - Voltar` };
    }
    if (context.step === 'CONFIRM') {
      if (choice === 2) return { next: 'CHOOSING_ADDRESS', context: { ...context, step: 'CEP', address: {} }, text: '📍 Digite seu *CEP*:' };
      if (choice === 1 && context.address?.street && context.address.number && context.address.neighborhood) {
        await prisma.address.create({ data: { restaurantId, customerId: conversation.customerId, street: context.address.street, number: context.address.number, neighborhood: context.address.neighborhood, city: context.address.city ?? 'Alagoinhas', zipCode: context.address.zipCode, reference: context.address.reference } });
        return paymentMenu(context);
      }
    }
    return startAddress(restaurantId, conversation.customerId, context);
  },

  CHOOSING_PAYMENT: async (restaurantId, conversation, text, choice, context) => {
    if (context.step === 'PAYMENT') {
      if (choice === 0) return startAddress(restaurantId, conversation.customerId, context);
      if (choice === 1) return notesMenu({ ...context, paymentMethod: 'PIX' });
      if (choice === 2) return { next: 'CHOOSING_PAYMENT', context: { ...context, paymentMethod: 'CASH', step: 'CHANGE_DECISION' }, text: '💵 *Precisa de troco?*\n\n*1* - Sim\n*2* - Não' };
      if (choice === 3) return notesMenu({ ...context, paymentMethod: 'CARD' });
      return paymentMenu(context);
    }
    if (context.step === 'CHANGE_DECISION') {
      if (choice === 1) return { next: 'CHOOSING_PAYMENT', context: { ...context, step: 'CHANGE_AMOUNT' }, text: '💵 Troco para quanto?\n\nExemplo: 100' };
      if (choice === 2) return notesMenu(context);
      return { next: 'CHOOSING_PAYMENT', context, text: 'Digite *1* para sim ou *2* para não.' };
    }
    if (context.step === 'CHANGE_AMOUNT') {
      const amount = Number(text.replace(',', '.'));
      const prepared = await prepareCartForOrder(restaurantId, conversation.customerId);
      const subtotal = prepared.items.reduce((sum, item) => sum + Number(item.unitPriceOverride) * item.quantity, 0);
      const zone = context.neighborhood ? await prisma.deliveryZone.findFirst({ where: { restaurantId, neighborhood: { equals: context.neighborhood, mode: 'insensitive' }, active: true } }) : null;
      const total = subtotal + Number(zone?.fee ?? 0);
      if (!Number.isFinite(amount) || amount <= total) return { next: 'CHOOSING_PAYMENT', context, text: `⚠️ O valor do troco deve ser maior que ${money(total)}.` };
      return notesMenu({ ...context, changeAmount: amount });
    }
    if (context.step === 'NOTES_DECISION') {
      if (choice === 1) return { next: 'CHOOSING_PAYMENT', context: { ...context, step: 'NOTES_TEXT' }, text: '📝 Digite sua observação:\n\nExemplo: Sem cebola' };
      if (choice === 2) return finalConfirmation(restaurantId, conversation.customerId, context);
      return notesMenu(context);
    }
    if (context.step === 'NOTES_TEXT') return finalConfirmation(restaurantId, conversation.customerId, { ...context, notes: text });
    return paymentMenu(context);
  },

  CONFIRMING_ORDER: async (restaurantId, conversation, _text, choice, context) => {
    if (choice === 2) return categoryMenu(restaurantId, context);
    if (choice === 3) return cancelConfirmation(context);
    if (choice !== 1) return finalConfirmation(restaurantId, conversation.customerId, context);
    if (context.createdOrderId && context.createdOrderNumber) return { next: 'ORDER_CONFIRMED', context, text: `✅ O pedido *#${context.createdOrderNumber}* já foi recebido.` };
    const prepared = await prepareCartForOrder(restaurantId, conversation.customerId);
    const subtotal = prepared.items.reduce((sum, item) => sum + Number(item.unitPriceOverride) * item.quantity, 0);
    const zone = context.neighborhood ? await prisma.deliveryZone.findFirst({ where: { restaurantId, neighborhood: { equals: context.neighborhood, mode: 'insensitive' }, active: true } }) : null;
    const total = subtotal + Number(zone?.fee ?? 0);
    if (context.confirmedTotal !== total || prepared.priceChanged) return finalConfirmation(restaurantId, conversation.customerId, context);
    const paymentMethod = context.paymentMethod === 'CASH' ? PaymentMethod.CASH : context.paymentMethod === 'CARD' ? PaymentMethod.CARD : PaymentMethod.PIX;
    const order = await createOrder(restaurantId, {
      customerId: conversation.customerId,
      items: prepared.items,
      neighborhood: context.neighborhood,
      paymentMethod,
      address: context.orderType === 'DELIVERY' ? context.address : undefined,
      notes: [context.notes, context.changeAmount ? `Troco para ${money(context.changeAmount)}` : undefined, context.orderType === 'PICKUP' ? 'Retirada no local' : undefined].filter(Boolean).join(' — ') || undefined,
    });
    await closeCart(prepared.cart.id);
    return {
      next: 'ORDER_CONFIRMED',
      context: { ...context, createdOrderId: order.id, createdOrderNumber: order.number },
      text: `✅ *PEDIDO RECEBIDO!*\n\nPedido: *#${order.number}*\nTotal: *${money(Number(order.total))}*\nPagamento: ${context.paymentMethod}\nStatus: 🕐 Aguardando confirmação\n\nVocê receberá as atualizações por aqui. 😉`,
    };
  },

  ORDER_CONFIRMED: async (restaurantId, conversation, _text, choice, context) => {
    if (choice === 1) {
      const cart = await getOrCreateCart(restaurantId, conversation.customerId);
      return { next: 'CHOOSING_DELIVERY_TYPE', text: orderTypeText, context: { menuShown: true, cartId: cart.id } };
    }
    if (choice === 5) return humanReply(context);
    return { next: 'ORDER_CONFIRMED', context, text: 'Pedido concluído.\n\n*1* - Fazer novo pedido\n*5* - Falar com atendente' };
  },
};

export async function resolveOrderConversation(restaurantId: string, conversation: ConversationSnapshot, raw: string): Promise<OrderConversationReply> {
  const text = raw.trim();
  const choice = choiceOf(text);
  const context = contextOf(conversation.context);
  if (normalized(text) === 'atendente') return humanReply(context);
  if (['inicio', 'menu'].includes(normalized(text))) return { next: 'IDLE', text: welcome, context: { menuShown: true } };
  if (conversation.state !== 'IDLE' && !context.cartId && !['ORDER_CONFIRMED', 'HUMAN_SUPPORT'].includes(conversation.state)) {
    return { next: 'IDLE', text: welcome, context: { menuShown: true } };
  }
  const handler = handlers[conversation.state] ?? handlers.IDLE!;
  return handler(restaurantId, conversation, text, choice, context);
}
