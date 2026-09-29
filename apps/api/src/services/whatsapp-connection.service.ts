import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { encryptSecret } from '../lib/secrets.js';

type GraphError = { message?: string; code?: number; error_subcode?: number };
type GraphResult<T> = T & { error?: GraphError };
type TokenResult = GraphResult<{ access_token?: string; expires_in?: number }>;
type PhoneResult = GraphResult<{
  data?: Array<{
    id: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
  }>;
}>;

export type EmbeddedSignupInput = {
  code: string;
  businessAccountId: string;
  phoneNumberId: string;
  businessPortfolioId?: string;
};

function configuration() {
  const missing = [
    !env.META_APP_ID && 'App ID',
    !env.META_EMBEDDED_SIGNUP_CONFIG_ID && 'Configuration ID',
    !env.META_APP_SECRET && 'App Secret',
  ].filter(Boolean) as string[];
  return { missing, ready: missing.length === 0 };
}

function graphUrl(path: string) {
  return `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}${path}`;
}

async function graphJson<T>(url: string, init: RequestInit, context: string): Promise<T> {
  let response: globalThis.Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new HttpError(502, `NÃ£o foi possÃ­vel acessar a Meta durante ${context}.`);
  }
  const payload = await response.json().catch(() => ({})) as GraphResult<T>;
  if (!response.ok || payload.error) {
    const detail = payload.error?.message ? `: ${payload.error.message}` : '';
    throw new HttpError(502, `A Meta recusou a operaÃ§Ã£o ${context}${detail}`);
  }
  return payload;
}

async function exchangeCode(code: string) {
  const url = new URL(graphUrl('/oauth/access_token'));
  url.searchParams.set('client_id', env.META_APP_ID);
  url.searchParams.set('client_secret', env.META_APP_SECRET);
  url.searchParams.set('code', code);
  url.searchParams.set('redirect_uri', env.META_REDIRECT_URI);
  const result = await graphJson<TokenResult>(url.toString(), { method: 'GET' }, 'ao autorizar o WhatsApp');
  if (!result.access_token) throw new HttpError(502, 'A Meta nÃ£o retornou um token de acesso.');
  return { accessToken: result.access_token, expiresIn: result.expires_in };
}

async function verifyPhone(accessToken: string, businessAccountId: string, phoneNumberId: string) {
  const url = new URL(graphUrl(`/${businessAccountId}/phone_numbers`));
  url.searchParams.set('fields', 'id,display_phone_number,verified_name,quality_rating');
  const result = await graphJson<PhoneResult>(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, 'ao validar o nÃºmero');
  const phone = result.data?.find((item) => item.id === phoneNumberId);
  if (!phone) throw new HttpError(422, 'O nÃºmero informado nÃ£o pertence Ã  conta do WhatsApp autorizada.');
  return phone;
}

async function subscribeWebhook(accessToken: string, businessAccountId: string) {
  await graphJson<{ success?: boolean }>(graphUrl(`/${businessAccountId}/subscribed_apps`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  }, 'ao assinar o webhook');
}

export async function getWhatsAppIntegration(restaurantId: string) {
  const connection = await prisma.whatsAppConnection.findFirst({
    where: { restaurantId },
    orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
  });
  const config = configuration();
  return {
    configuration: {
      appId: env.META_APP_ID,
      configId: env.META_EMBEDDED_SIGNUP_CONFIG_ID,
      graphApiVersion: env.WHATSAPP_API_VERSION,
      testMode: env.WHATSAPP_TEST_MODE,
      ready: config.ready,
      missing: config.missing,
    },
    connection: connection ? {
      id: connection.id,
      phoneNumberId: connection.phoneNumberId,
      businessAccountId: connection.businessAccountId,
      displayPhone: connection.displayPhone,
      verifiedName: connection.verifiedName,
      qualityRating: connection.qualityRating,
      active: connection.active,
      connected: Boolean(connection.accessTokenEncrypted),
      tokenExpiresAt: connection.tokenExpiresAt,
      connectedAt: connection.connectedAt,
    } : null,
  };
}

export async function completeEmbeddedSignup(restaurantId: string, input: EmbeddedSignupInput) {
  const config = configuration();
  if (!config.ready) throw new HttpError(503, `IntegraÃ§Ã£o Meta incompleta: ${config.missing.join(', ')}.`);
  const { accessToken, expiresIn } = await exchangeCode(input.code);
  const phone = await verifyPhone(accessToken, input.businessAccountId, input.phoneNumberId);
  await subscribeWebhook(accessToken, input.businessAccountId);
  const now = new Date();
  const tokenExpiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null;
  const connection = await prisma.whatsAppConnection.upsert({
    where: { phoneNumberId: input.phoneNumberId },
    update: {
      restaurantId,
      businessAccountId: input.businessAccountId,
      businessPortfolioId: input.businessPortfolioId || null,
      displayPhone: phone.display_phone_number || null,
      verifiedName: phone.verified_name || null,
      qualityRating: phone.quality_rating || null,
      phoneNumber: phone.display_phone_number || null,
      displayName: phone.verified_name || null,
      accessTokenEncrypted: encryptSecret(accessToken),
      tokenExpiresAt,
      active: !env.WHATSAPP_TEST_MODE,
      status: 'CONNECTED',
      connectedAt: now,
    },
    create: {
      restaurantId,
      phoneNumberId: input.phoneNumberId,
      businessAccountId: input.businessAccountId,
      businessPortfolioId: input.businessPortfolioId || null,
      displayPhone: phone.display_phone_number || null,
      verifiedName: phone.verified_name || null,
      qualityRating: phone.quality_rating || null,
      provider: 'META_CLOUD',
      status: 'CONNECTED',
      phoneNumber: phone.display_phone_number || null,
      displayName: phone.verified_name || null,
      accessTokenEncrypted: encryptSecret(accessToken),
      tokenExpiresAt,
      active: !env.WHATSAPP_TEST_MODE,
      connectedAt: now,
    },
  });
  return { connected: true, connectionId: connection.id };
}

export async function setWhatsAppAutomation(restaurantId: string, active: boolean) {
  const connection = await prisma.whatsAppConnection.findFirst({
    where: { restaurantId },
    orderBy: { updatedAt: 'desc' },
  });
  if (!connection) throw new HttpError(404, 'Nenhuma conexÃ£o do WhatsApp foi encontrada.');
  if (active && !connection.accessTokenEncrypted) throw new HttpError(409, 'Conclua a autorizaÃ§Ã£o da Meta antes de ativar o bot.');
  await prisma.whatsAppConnection.update({ where: { id: connection.id }, data: { active } });
  return { active };
}
