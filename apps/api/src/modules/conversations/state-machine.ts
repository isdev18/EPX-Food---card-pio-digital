import { ConversationState } from '@prisma/client';

export type BotReply = { next: ConversationState; text: string };

export function resolveConversation(state: ConversationState, raw: string): BotReply {
  const text = raw.trim().toLowerCase();
  if (['cancelar', 'início', 'inicio'].includes(text)) return { next: 'IDLE', text: 'Pedido cancelado. Como podemos ajudar?\n\n1. Fazer pedido\n2. Ver cardápio\n3. Promoções\n4. Acompanhar pedido\n5. Falar com atendente' };
  if (text === 'atendente' || text === '5') return { next: 'HUMAN_SUPPORT', text: 'Certo! Um atendente assumirá a conversa em instantes.' };
  if (text.includes('meu pedido') || text === '4') return { next: state, text: 'Vou consultar seu pedido mais recente para você.' };
  if (text === 'voltar') return { next: 'IDLE', text: 'Voltamos ao início. Digite 1 para fazer um pedido.' };
  const flows: Partial<Record<ConversationState, BotReply>> = {
    IDLE: { next: 'CHOOSING_CATEGORY', text: '🍕 Escolha uma categoria:\n1. Pizzas\n2. Bebidas\n3. Lanches\n4. Porções\n5. Sobremesas' },
    CHOOSING_CATEGORY: { next: 'CHOOSING_PRODUCT', text: 'Ótimo! Agora escolha um produto do cardápio.' },
    CHOOSING_PRODUCT: { next: 'CHOOSING_SIZE', text: 'Qual tamanho você prefere? Pequena, Média, Grande ou Família?' },
    CHOOSING_SIZE: { next: 'CHOOSING_FLAVOR', text: 'Escolha o sabor. Você também pode pedir meio a meio.' },
    CHOOSING_FLAVOR: { next: 'CHOOSING_CRUST', text: 'Deseja borda? Sem borda, Catupiry ou Cheddar.' },
    CHOOSING_CRUST: { next: 'CHOOSING_EXTRAS', text: 'Deseja adicionar algum extra?' },
    CHOOSING_EXTRAS: { next: 'REVIEWING_CART', text: 'Item adicionado! Deseja adicionar uma bebida ou revisar o carrinho?' },
    REVIEWING_CART: { next: 'CHOOSING_DELIVERY_TYPE', text: 'O pedido será para entrega ou retirada?' },
    CHOOSING_DELIVERY_TYPE: { next: 'CHOOSING_ADDRESS', text: 'Informe o endereço de entrega, por favor.' },
    CHOOSING_ADDRESS: { next: 'CHOOSING_PAYMENT', text: 'Como deseja pagar? PIX, cartão na entrega ou dinheiro?' },
    CHOOSING_PAYMENT: { next: 'CONFIRMING_ORDER', text: 'Confira o resumo. Responda CONFIRMAR para concluir ou ALTERAR para corrigir.' },
    CONFIRMING_ORDER: { next: 'ORDER_CONFIRMED', text: '✅ Pedido confirmado! Em breve enviaremos a previsão.' },
  };
  return flows[state] ?? { next: state, text: 'Não entendi. Digite “voltar” para retornar ou “atendente” para falar com a equipe.' };
}
