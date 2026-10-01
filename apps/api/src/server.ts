import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { restoreWhatsAppWebSessions, shutdownWhatsAppWebSessions } from './services/whatsapp-web.service.js';

const server = app.listen(env.PORT, () => {
  console.log(`API EPX Menu em http://localhost:${env.PORT}`);
  void restoreWhatsAppWebSessions().catch((error) => console.error('Falha ao restaurar sessões do WhatsApp:', error));
});
async function shutdown() { server.close(); await shutdownWhatsAppWebSessions(); await prisma.$disconnect(); process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
