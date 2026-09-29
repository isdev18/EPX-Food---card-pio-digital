import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import type { IncomingMessage, WhatsAppProviderStatus } from '../integrations/whatsapp/whatsapp-provider.js';
import type { QrWhatsAppProvider } from '../integrations/whatsapp/providers/qr-whatsapp.provider.js';
import { env } from '../config/env.js';
import { whatsappEvents } from '../lib/events.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { registerWhatsAppSender } from '../lib/whatsapp-notifier.js';
import { createWhatsAppMenuReply } from './whatsapp-menu-link.service.js';

type Provider = QrWhatsAppProvider;
type RateBucket = number[];

const providers = new Map<string, Provider>();
const providerLoads = new Map<string, Promise<Provider>>();
const processingMessages = new Set<string>();
const conversationRates = new Map<string, RateBucket>();
const restaurantRates = new Map<string, RateBucket>();
const projectAuthPath = fileURLToPath(new URL('../../../../.wwebjs_auth', import.meta.url));
const windowsLocalAuthPath = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'EPXFood', 'whatsapp-auth')
  : null;
const authPath = env.WWEBJS_AUTH_PATH
  ? path.resolve(env.WWEBJS_AUTH_PATH)
  : (process.platform === 'win32' && windowsLocalAuthPath ? windowsLocalAuthPath : projectAuthPath);

function trimBucket(bucket: RateBucket, now: number) {
  while (bucket.length && bucket[0] < now - 60_000) bucket.shift();
}

function mayRespond(restaurantId: string, conversationId: string) {
  const now = Date.now();
  const conversation = conversationRates.get(conversationId) ?? [];
  const restaurant = restaurantRates.get(restaurantId) ?? [];
  trimBucket(conversation, now);
  trimBucket(restaurant, now);
  conversationRates.set(conversationId, conversation);
  restaurantRates.set(restaurantId, restaurant);
  if (conversation.length >= 12 || restaurant.length >= 80) return false;
  conversation.push(now);
  restaurant.push(now);
  return true;
}

async function providerFor(restaurantId: string) {
  let provider = providers.get(restaurantId);
  if (provider) return provider;
  const pending = providerLoads.get(restaurantId);
  if (pending) return pending;
  const load = import('../integrations/whatsapp/providers/qr-whatsapp.provider.js').then(({ QrWhatsAppProvider }) => {
    const existing = providers.get(restaurantId);
    if (existing) return existing;
    const created = new QrWhatsAppProvider(restaurantId, {
      authPath,
      chromePath: env.WWEBJS_CHROME_PATH || undefined,
      disableSandbox: env.WWEBJS_DISABLE_SANDBOX || Boolean(process.env.RAILWAY_ENVIRONMENT),
      qrLifetimeMs: 60_000,
      maxReconnectAttempts: 2,
    });
    created.onConnectionUpdate((status) => void handleConnectionUpdate(restaurantId, status));
    created.onMessage((message) => processIncomingMessage(created, message));
    providers.set(restaurantId, created);
    return created;
  });
  providerLoads.set(restaurantId, load);
  try {
    return await load;
  } finally {
    if (providerLoads.get(restaurantId) === load) providerLoads.delete(restaurantId);
  }
}

async function handleConnectionUpdate(restaurantId: string, status: WhatsAppProviderStatus) {
  const disconnected = ['DISCONNECTED', 'DISCONNECTED_BY_USER', 'AUTH_FAILURE', 'ERROR'].includes(status.state);
  await prisma.whatsAppConnection.upsert({
    where: { restaurantId_provider: { restaurantId, provider: 'QR_SESSION' } },
    update: {
      status: status.state,
      phoneNumber: status.phoneNumber,
      displayName: status.displayName,
      connectedAt: status.connectedAt ? new Date(status.connectedAt) : undefined,
      disconnectedAt: disconnected ? new Date() : null,
      lastActivityAt: status.lastActivityAt ? new Date(status.lastActivityAt) : undefined,
      active: status.state === 'CONNECTED',
    },
    create: {
      restaurantId,
      provider: 'QR_SESSION',
      status: status.state,
      phoneNumber: status.phoneNumber,
      displayName: status.displayName,
      connectedAt: status.connectedAt ? new Date(status.connectedAt) : null,
      disconnectedAt: disconnected ? new Date() : null,
      lastActivityAt: status.lastActivityAt ? new Date(status.lastActivityAt) : null,
      active: status.state === 'CONNECTED',
    },
  });
  whatsappEvents.emit('changed', { restaurantId, status: await getWhatsAppWebStatus(restaurantId) });
}

async function processIncomingMessage(provider: Provider, message: IncomingMessage) {
  if (message.fromMe || message.isStatus || message.type === 'e2e_notification' || !message.text) return;
  if (message.timestamp.getTime() < Date.now() - 5 * 60_000) return;
  if (processingMessages.has(message.providerMessageId)) return;
  processingMessages.add(message.providerMessageId);
  try {
    if (await prisma.message.findUnique({ where: { externalId: message.providerMessageId } })) return;
    const customer = await prisma.customer.upsert({
      where: { restaurantId_phone: { restaurantId: message.restaurantId, phone: message.phone } },
      update: message.displayName ? { name: message.displayName } : {},
      create: { restaurantId: message.restaurantId, phone: message.phone, name: message.displayName },
    });
    const conversation = await prisma.conversation.upsert({
      where: { restaurantId_customerId: { restaurantId: message.restaurantId, customerId: customer.id } },
      update: {},
      create: { restaurantId: message.restaurantId, customerId: customer.id },
    });
    try {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          externalId: message.providerMessageId,
          direction: 'INBOUND',
          type: message.type,
          body: message.text,
          payload: { provider: 'QR_SESSION', recipientId: message.from, timestamp: message.timestamp.toISOString() },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
    if (!mayRespond(message.restaurantId, conversation.id)) {
      console.warn(JSON.stringify({ scope: 'whatsapp', event: 'menu_link_rate_limited', restaurantId: message.restaurantId, conversationId: conversation.id }));
      return;
    }
    const reply = await createWhatsAppMenuReply({
      restaurantId: message.restaurantId,
      customerId: customer.id,
      conversationId: conversation.id,
      customerName: customer.name,
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { state: 'IDLE', mode: 'BOT', context: { flow: 'ONLINE_MENU', menuUrl: reply.menuUrl, menuLinkSentAt: new Date().toISOString() } },
    });
    await provider.sendText(message.from, reply.text);
    await prisma.message.create({
      data: { conversationId: conversation.id, direction: 'OUTBOUND', type: 'text', body: reply.text, payload: { provider: 'QR_SESSION' } },
    });
  } finally {
    processingMessages.delete(message.providerMessageId);
  }
}

function disconnectedStatus(connection?: {
  status: string;
  phoneNumber: string | null;
  displayName: string | null;
  connectedAt: Date | null;
  lastActivityAt: Date | null;
} | null): WhatsAppProviderStatus {
  return {
    provider: 'QR_SESSION',
    state: (connection?.status as WhatsAppProviderStatus['state']) ?? 'DISCONNECTED',
    qrDataUrl: null,
    qrExpiresAt: null,
    phoneNumber: connection?.phoneNumber ?? null,
    displayName: connection?.displayName ?? null,
    connectedAt: connection?.connectedAt?.toISOString() ?? null,
    lastActivityAt: connection?.lastActivityAt?.toISOString() ?? null,
    error: null,
  };
}

export async function getWhatsAppWebStatus(restaurantId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [connection, receivedToday, ordersOriginated, humanHandoffs] = await prisma.$transaction([
    prisma.whatsAppConnection.findUnique({ where: { restaurantId_provider: { restaurantId, provider: 'QR_SESSION' } } }),
    prisma.message.count({ where: { direction: 'INBOUND', createdAt: { gte: startOfDay }, conversation: { restaurantId } } }),
    prisma.order.count({ where: { restaurantId, createdAt: { gte: startOfDay }, conversationId: { not: null } } }),
    prisma.conversation.count({ where: { restaurantId, mode: 'HUMAN' } }),
  ]);
  const provider = providers.get(restaurantId);
  const status = provider?.getStatus() ?? disconnectedStatus(connection);
  return {
    ...status,
    active: Boolean(connection?.active && status.state === 'CONNECTED'),
    metrics: {
      receivedToday,
      ordersOriginated,
      humanHandoffs,
      lastActivityAt: status.lastActivityAt ?? connection?.lastActivityAt?.toISOString() ?? null,
    },
  };
}

export async function startWhatsAppWeb(restaurantId: string) {
  const provider = await providerFor(restaurantId);
  // Um provider novo também inicia como DISCONNECTED. Apagar o perfil nessa situação
  // pode bloquear a API por minutos (especialmente em pastas sincronizadas pelo OneDrive)
  // antes que o Chromium tenha sequer a chance de emitir o QR.
  if (provider.getStatus().state === 'AUTH_FAILURE') await provider.disconnect(true);
  await provider.connect();
  return getWhatsAppWebStatus(restaurantId);
}

export async function resetWhatsAppWeb(restaurantId: string) {
  const provider = await providerFor(restaurantId);
  await provider.disconnect(true);
  return getWhatsAppWebStatus(restaurantId);
}

export async function testWhatsAppWeb(restaurantId: string) {
  const provider = providers.get(restaurantId);
  const ok = provider ? await provider.checkHealth() : false;
  return { ok, message: ok ? 'Conexão funcionando.' : 'Problema na conexão.' };
}

export async function setWhatsAppWebAutomation(restaurantId: string, active: boolean) {
  const provider = providers.get(restaurantId);
  if (active && (!provider || provider.getStatus().state !== 'CONNECTED')) {
    throw new HttpError(409, 'Conecte o WhatsApp pelo QR antes de ativar o bot.');
  }
  await prisma.whatsAppConnection.update({
    where: { restaurantId_provider: { restaurantId, provider: 'QR_SESSION' } },
    data: { active },
  });
  return getWhatsAppWebStatus(restaurantId);
}

export async function restoreWhatsAppWebSessions() {
  const connections = await prisma.whatsAppConnection.findMany({
    where: { provider: 'QR_SESSION', status: { in: ['CONNECTED', 'CONNECTING', 'RECONNECTING', 'INITIALIZING'] } },
    select: { restaurantId: true },
  });
  await Promise.allSettled(connections.map(async ({ restaurantId }) => (await providerFor(restaurantId)).connect()));
}

export async function shutdownWhatsAppWebSessions() {
  await Promise.allSettled([...providers.values()].map((provider) => provider.disconnect(false)));
  providers.clear();
}

registerWhatsAppSender(async ({ restaurantId, customerId, phone, text }) => {
  const provider = providers.get(restaurantId);
  if (!provider || provider.getStatus().state !== 'CONNECTED') return false;
  const connection = await prisma.whatsAppConnection.findUnique({ where: { restaurantId_provider: { restaurantId, provider: 'QR_SESSION' } } });
  if (!connection?.active) return false;
  const conversation = await prisma.conversation.findUnique({
    where: { restaurantId_customerId: { restaurantId, customerId } },
    include: { messages: { where: { direction: 'INBOUND' }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  const payload = conversation?.messages[0]?.payload;
  const savedRecipient = payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.recipientId === 'string'
    ? payload.recipientId
    : null;
  const recipient = savedRecipient && (savedRecipient.endsWith('@c.us') || savedRecipient.endsWith('@lid'))
    ? savedRecipient
    : `${normalizeWhatsAppPhone(phone)}@c.us`;
  await provider.sendText(recipient, text);
  if (conversation) {
    await prisma.message.create({ data: { conversationId: conversation.id, direction: 'OUTBOUND', type: 'text', body: text, payload: { provider: 'QR_SESSION' } } });
  }
  return true;
});

function normalizeWhatsAppPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}
