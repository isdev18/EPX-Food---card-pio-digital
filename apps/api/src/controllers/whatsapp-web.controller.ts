import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import { whatsappEvents } from '../lib/events.js';
import type { AuthRequest } from '../middlewares/auth.js';
import { getWhatsAppWebStatus, resetWhatsAppWeb, setWhatsAppWebAutomation, startWhatsAppWeb, testWhatsAppWeb } from '../services/whatsapp-web.service.js';

export async function status(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    return res.json(await getWhatsAppWebStatus(req.auth!.restaurantId));
  } catch (error) {
    next(error);
  }
}

export async function start(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const restaurantId = req.auth!.restaurantId;
    const current = await getWhatsAppWebStatus(restaurantId);
    const response = { ...current, state: 'INITIALIZING' as const, error: null, qrDataUrl: null, qrExpiresAt: null };
    res.status(202).json(response);
    // O carregamento inicial de Chromium/Puppeteer é pesado em Windows e OneDrive.
    // Ele começa somente depois que a resposta 202 já foi entregue ao painel.
    setTimeout(() => {
      void startWhatsAppWeb(restaurantId).catch((error) => {
        console.error('Falha ao iniciar a sessão do WhatsApp:', error);
      });
    }, 100);
    return;
  } catch (error) {
    next(error);
  }
}

export async function reset(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    return res.json(await resetWhatsAppWeb(req.auth!.restaurantId));
  } catch (error) {
    next(error);
  }
}

export async function test(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    return res.json(await testWhatsAppWeb(req.auth!.restaurantId));
  } catch (error) {
    next(error);
  }
}

export async function events(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const restaurantId = req.auth!.restaurantId;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(`event: status\ndata: ${JSON.stringify(await getWhatsAppWebStatus(restaurantId))}\n\n`);
    const handler = (event: { restaurantId: string; status: unknown }) => {
      if (event.restaurantId === restaurantId && !res.writableEnded) {
        res.write(`event: status\ndata: ${JSON.stringify(event.status)}\n\n`);
      }
    };
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, 20_000);
    whatsappEvents.on('changed', handler);
    const cleanup = () => {
      clearInterval(heartbeat);
      whatsappEvents.off('changed', handler);
    };
    res.once('close', cleanup);
    req.once('aborted', cleanup);
  } catch (error) {
    if (!res.headersSent) return next(error);
    res.end();
  }
}

export async function automation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    return res.json(await setWhatsAppWebAutomation(req.auth!.restaurantId, active));
  } catch (error) {
    next(error);
  }
}
