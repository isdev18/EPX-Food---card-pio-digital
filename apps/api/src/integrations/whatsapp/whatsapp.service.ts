import { env } from '../../config/env.js';

export type WhatsAppCredentials = { accessToken: string; phoneNumberId: string };
type SendOptions = { customerInitiated?: boolean };

export class WhatsAppService {
  async sendText(to: string, body: string, credentials?: WhatsAppCredentials, options?: SendOptions) {
    return this.send({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }, credentials, options);
  }

  async sendButtons(to: string, body: string, buttons: { id: string; title: string }[], credentials?: WhatsAppCredentials) {
    return this.send({ messaging_product: 'whatsapp', to, type: 'interactive', interactive: { type: 'button', body: { text: body }, action: { buttons: buttons.map((button) => ({ type: 'reply', reply: button })) } } }, credentials);
  }

  async sendList(to: string, body: string, button: string, rows: { id: string; title: string; description?: string }[], credentials?: WhatsAppCredentials) {
    return this.send({ messaging_product: 'whatsapp', to, type: 'interactive', interactive: { type: 'list', body: { text: body }, action: { button, sections: [{ title: 'Opcoes', rows }] } } }, credentials);
  }

  async sendTemplate(to: string, name: string, credentials?: WhatsAppCredentials) {
    return this.send({ messaging_product: 'whatsapp', to, type: 'template', template: { name, language: { code: 'pt_BR' } } }, credentials);
  }

  async markAsRead(messageId: string, credentials?: WhatsAppCredentials) {
    return this.send({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }, credentials);
  }

  private async send(payload: object, credentials?: WhatsAppCredentials, options?: SendOptions) {
    if (env.WHATSAPP_TEST_MODE && 'to' in payload && !options?.customerInitiated) {
      return { simulated: true, reason: 'whatsapp-test-mode', payload };
    }
    const accessToken = credentials?.accessToken || env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = credentials?.phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken || !phoneNumberId) return { simulated: true, payload };
    const response = await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`WhatsApp API: ${response.status}`);
    return response.json();
  }
}

export const whatsapp = new WhatsAppService();
