import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { decryptSecret } from '../lib/secrets.js';
import { createWhatsAppMenuReply } from '../services/whatsapp-menu-link.service.js';
import { whatsapp } from '../integrations/whatsapp/whatsapp.service.js';

export function verifyWebhook(req: Request, res: Response) {
  if (env.WHATSAPP_VERIFY_TOKEN && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(req.query['hub.challenge']);
  return res.sendStatus(403);
}

export function isValidMetaSignature(rawBody: Buffer, received: string, secret: string) {
  if (!secret || !received) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function receiveWebhook(req: Request, res: Response) {
  if (env.NODE_ENV === 'production' && !env.META_APP_SECRET) return res.sendStatus(503);
  if (env.META_APP_SECRET) {
    const received = req.header('x-hub-signature-256') ?? '';
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    if (!isValidMetaSignature(rawBody, received, env.META_APP_SECRET)) return res.sendStatus(401);
  }
  res.sendStatus(200);
  void processIncomingMessage(req.body).catch((error) => console.error('Falha ao processar webhook do WhatsApp:', error));
}

async function processIncomingMessage(payload: any) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  const phoneNumberId = value?.metadata?.phone_number_id;
  if (!message?.id || !message?.from || !phoneNumberId) return;
  if (await prisma.message.findUnique({ where: { externalId: message.id } })) return;
  const connection = await prisma.whatsAppConnection.findUnique({ where: { phoneNumberId } });
  if (!connection?.active) return;
  const body = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? '';
  const customer = await prisma.customer.upsert({ where: { restaurantId_phone: { restaurantId: connection.restaurantId, phone: message.from } }, update: {}, create: { restaurantId: connection.restaurantId, phone: message.from, name: value?.contacts?.[0]?.profile?.name } });
  const conversation = await prisma.conversation.upsert({ where: { restaurantId_customerId: { restaurantId: connection.restaurantId, customerId: customer.id } }, update: {}, create: { restaurantId: connection.restaurantId, customerId: customer.id } });
  await prisma.message.create({ data: { conversationId: conversation.id, externalId: message.id, direction: 'INBOUND', type: message.type ?? 'text', body, payload: message } });
  const reply = await createWhatsAppMenuReply({
    restaurantId: connection.restaurantId,
    customerId: customer.id,
    conversationId: conversation.id,
    customerName: customer.name,
  });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { state: 'IDLE', mode: 'BOT', context: { flow: 'ONLINE_MENU', menuUrl: reply.menuUrl, menuLinkSentAt: new Date().toISOString() } } });
  const credentials = connection.accessTokenEncrypted && connection.phoneNumberId ? {
    accessToken: decryptSecret(connection.accessTokenEncrypted),
    phoneNumberId: connection.phoneNumberId,
  } : undefined;
  await whatsapp.markAsRead(message.id, credentials);
  await whatsapp.sendText(message.from, reply.text, credentials, { customerInitiated: true });
  await prisma.message.create({ data: { conversationId: conversation.id, direction: 'OUTBOUND', type: 'text', body: reply.text } });
}
