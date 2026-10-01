import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  WEB_URL: z.string().default('http://localhost:5173'),
  PUBLIC_MENU_URL: z.string().default(''),
  JWT_SECRET: z.string().min(32),
  WHATSAPP_VERIFY_TOKEN: z.string().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().default(''),
  WHATSAPP_API_VERSION: z.string().default('v23.0'),
  WHATSAPP_TEST_MODE: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  WWEBJS_CHROME_PATH: z.string().default(''),
  WWEBJS_AUTH_PATH: z.string().default(''),
  WWEBJS_DISABLE_SANDBOX: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  META_APP_ID: z.string().default(''),
  META_EMBEDDED_SIGNUP_CONFIG_ID: z.string().default(''),
  META_REDIRECT_URI: z.string().default(''),
  META_APP_SECRET: z.string().default(''),
  TOKEN_ENCRYPTION_SECRET: z.string().min(32).optional(),
  ASAAS_BASE_URL: z.string().url().default('https://api-sandbox.asaas.com/v3'),
  ASAAS_API_KEY: z.string().default(''),
  ASAAS_WEBHOOK_TOKEN: z.string().default(''),
}).superRefine((value, context) => {
  if (value.ASAAS_WEBHOOK_TOKEN && value.ASAAS_WEBHOOK_TOKEN.length < 32) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ASAAS_WEBHOOK_TOKEN'], message: 'ASAAS_WEBHOOK_TOKEN deve ter pelo menos 32 caracteres.' });
  }
  if (value.ASAAS_API_KEY.startsWith('$aact_hmlg_') && !value.ASAAS_BASE_URL.includes('api-sandbox.asaas.com')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ASAAS_BASE_URL'], message: 'Use a URL de Sandbox com uma chave Asaas de homologacao.' });
  }
  if (value.ASAAS_API_KEY.startsWith('$aact_prod_') && value.ASAAS_BASE_URL.includes('api-sandbox.asaas.com')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ASAAS_BASE_URL'], message: 'Use a URL de producao com uma chave Asaas de producao.' });
  }
  if (value.NODE_ENV !== 'production') return;
  if (/change-this|change-me/i.test(value.JWT_SECRET)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_SECRET'], message: 'Use um JWT_SECRET aleatório em produção.' });
  }
  const webOrigins = value.WEB_URL.split(',').map((origin) => origin.trim());
  if (webOrigins.some((origin) => !origin.startsWith('https://'))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['WEB_URL'], message: 'Use somente origens HTTPS em produção.' });
  }
  if (value.PUBLIC_MENU_URL && !value.PUBLIC_MENU_URL.startsWith('https://')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['PUBLIC_MENU_URL'], message: 'Use HTTPS no cardápio público em produção.' });
  }
  const metaConfigured = Boolean(value.META_APP_ID || value.WHATSAPP_ACCESS_TOKEN || value.WHATSAPP_PHONE_NUMBER_ID);
  if (metaConfigured && !value.META_APP_SECRET) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['META_APP_SECRET'], message: 'META_APP_SECRET é obrigatório quando a integração Meta está configurada.' });
  }
  if (metaConfigured && !value.WHATSAPP_VERIFY_TOKEN) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['WHATSAPP_VERIFY_TOKEN'], message: 'WHATSAPP_VERIFY_TOKEN é obrigatório quando a integração Meta está configurada.' });
  }
  if (metaConfigured && !value.TOKEN_ENCRYPTION_SECRET) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['TOKEN_ENCRYPTION_SECRET'], message: 'Use um segredo exclusivo para criptografar tokens em produção.' });
  }
});

export const env = envSchema.parse(process.env);
