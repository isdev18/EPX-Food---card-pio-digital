import { Router } from 'express';
import { receiveWebhook, verifyWebhook } from '../controllers/webhook.controller.js';
export const webhookRouter = Router();
webhookRouter.get('/whatsapp', verifyWebhook);
webhookRouter.post('/whatsapp', receiveWebhook);
