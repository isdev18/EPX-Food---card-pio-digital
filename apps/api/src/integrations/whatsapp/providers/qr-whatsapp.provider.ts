import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import pkg from 'whatsapp-web.js';
import type {
  IncomingMessage,
  OutgoingMessage,
  Unsubscribe,
  WhatsAppConnectionState,
  WhatsAppProvider,
  WhatsAppProviderStatus,
} from '../whatsapp-provider.js';

const { Client, LocalAuth } = pkg;
type WebClient = InstanceType<typeof Client>;

type QrProviderOptions = {
  authPath: string;
  chromePath?: string;
  disableSandbox?: boolean;
  qrLifetimeMs?: number;
  maxReconnectAttempts?: number;
};

const emptyStatus = (): WhatsAppProviderStatus => ({
  provider: 'QR_SESSION',
  state: 'DISCONNECTED',
  qrDataUrl: null,
  qrExpiresAt: null,
  phoneNumber: null,
  displayName: null,
  connectedAt: null,
  lastActivityAt: null,
  error: null,
});

export class QrWhatsAppProvider implements WhatsAppProvider {
  readonly type = 'QR_SESSION' as const;
  private client: WebClient | null = null;
  private status = emptyStatus();
  private readonly messageHandlers = new Set<(message: IncomingMessage) => void | Promise<void>>();
  private readonly statusHandlers = new Set<(status: WhatsAppProviderStatus) => void | Promise<void>>();
  private qrExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readyRecoveryTriggered = false;
  private disconnectingByUser = false;

  constructor(readonly restaurantId: string, private readonly options: QrProviderOptions) {}

  async connect() {
    const sessionIsBusy = ['INITIALIZING', 'CONNECTING', 'CONNECTED', 'RECONNECTING'].includes(this.status.state)
      || (this.status.state === 'QR_REQUIRED' && Boolean(this.status.qrDataUrl));
    if (sessionIsBusy) {
      return this.getStatus();
    }
    await this.closeClient();
    this.disconnectingByUser = false;
    this.reconnectAttempts = 0;
    this.readyRecoveryTriggered = false;
    await this.createClient('INITIALIZING');
    return this.getStatus();
  }

  async disconnect(removeCredentials = true) {
    this.disconnectingByUser = true;
    this.clearTimers();
    const client = this.client;
    this.client = null;
    if (client) {
      if (removeCredentials) {
        await client.logout().catch(async () => client.destroy().catch(() => undefined));
      } else {
        await client.destroy().catch(() => undefined);
      }
    }
    if (!removeCredentials) return this.getStatus();
    if (removeCredentials) {
      await rm(this.sessionPath(), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
    this.updateStatus({
      state: 'DISCONNECTED_BY_USER',
      qrDataUrl: null,
      qrExpiresAt: null,
      phoneNumber: null,
      displayName: null,
      connectedAt: null,
      error: null,
    });
    this.log('disconnected', { reason: 'by_user' });
    return this.getStatus();
  }

  getStatus() {
    return { ...this.status };
  }

  async sendText(to: string, text: string) {
    return this.sendMessage({ to, type: 'text', text });
  }

  async sendMessage(message: OutgoingMessage) {
    if (!this.client || this.status.state !== 'CONNECTED') throw new Error('WhatsApp não está conectado.');
    try {
      await this.client.sendMessage(message.to, message.text);
      this.updateStatus({ lastActivityAt: new Date().toISOString() });
      this.log('message_sent', { type: message.type });
    } catch (error) {
      this.log('message_failed', { error: this.errorMessage(error) });
      throw error;
    }
  }

  onMessage(handler: (message: IncomingMessage) => void | Promise<void>): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnectionUpdate(handler: (status: WhatsAppProviderStatus) => void | Promise<void>): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  async checkHealth() {
    if (!this.client || this.status.state !== 'CONNECTED') return false;
    try {
      return await this.client.getState() === 'CONNECTED';
    } catch {
      return false;
    }
  }

  private async createClient(state: WhatsAppConnectionState) {
    this.updateStatus({ state, error: null, qrDataUrl: null, qrExpiresAt: null });
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: this.clientId(), dataPath: path.resolve(this.options.authPath), rmMaxRetries: 10 }),
      puppeteer: {
        headless: true,
        executablePath: this.chromeExecutablePath(),
        args: this.options.disableSandbox
          ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
          : ['--disable-dev-shm-usage'],
      },
    });
    this.client = client;

    client.on('qr', (qr) => void this.handleQr(qr));
    client.on('authenticated', () => {
      this.clearQrTimer();
      this.updateStatus({ state: 'CONNECTING', qrDataUrl: null, qrExpiresAt: null, error: null });
    });
    client.on('ready', () => {
      this.clearTimers();
      this.reconnectAttempts = 0;
      this.updateStatus({
        state: 'CONNECTED',
        phoneNumber: client.info?.wid?.user ?? null,
        displayName: client.info?.pushname ?? null,
        connectedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        qrDataUrl: null,
        qrExpiresAt: null,
        error: null,
      });
      this.log('connected');
    });
    client.on('auth_failure', (reason) => {
      this.clearTimers();
      this.updateStatus({ state: 'AUTH_FAILURE', error: `A autenticação foi recusada: ${String(reason)}`, qrDataUrl: null, qrExpiresAt: null });
      this.log('authentication_failure', { error: String(reason) });
    });
    client.on('disconnected', (reason) => void this.handleDisconnect(String(reason)));
    client.on('message', (message) => void this.handleMessage(message));

    void client.initialize().catch((error) => {
      this.updateStatus({ state: 'ERROR', error: this.friendlyInitializationError(error), qrDataUrl: null, qrExpiresAt: null });
      this.log('authentication_failure', { error: this.errorMessage(error) });
    });
    this.startReadyRecovery();
  }

  private async handleQr(qr: string) {
    try {
      const expiresAt = new Date(Date.now() + (this.options.qrLifetimeMs ?? 60_000));
      const qrDataUrl = await QRCode.toDataURL(qr, { width: 360, margin: 2 });
      this.updateStatus({ state: 'QR_REQUIRED', qrDataUrl, qrExpiresAt: expiresAt.toISOString(), error: null });
      this.clearQrTimer();
      this.qrExpiryTimer = setTimeout(() => {
        if (this.status.qrExpiresAt === expiresAt.toISOString()) {
          this.updateStatus({ qrDataUrl: null, qrExpiresAt: null, error: 'QR Code expirado. Gere um novo QR.' });
        }
      }, this.options.qrLifetimeMs ?? 60_000);
      this.log('qr_generated');
    } catch (error) {
      this.updateStatus({ state: 'ERROR', error: 'Não foi possível gerar a imagem do QR Code.' });
      this.log('authentication_failure', { error: this.errorMessage(error) });
    }
  }

  private async handleMessage(message: any) {
    const normalized = this.normalizeMessage(message);
    if (!normalized) return;
    this.updateStatus({ lastActivityAt: normalized.timestamp.toISOString() });
    this.log('message_received', { type: normalized.type });
    for (const handler of this.messageHandlers) {
      await Promise.resolve(handler(normalized)).catch((error) => {
        this.log('message_failed', { stage: 'consumer', error: this.errorMessage(error) });
      });
    }
  }

  private normalizeMessage(message: any): IncomingMessage | null {
    const from = typeof message.from === 'string' ? message.from : '';
    const direct = from.endsWith('@c.us') || from.endsWith('@lid');
    const id = message.id?._serialized
      ?? message.id?.$1
      ?? (message.id?.remote && message.id?.id ? `${String(message.id.fromMe)}_${String(message.id.remote)}_${String(message.id.id)}` : null);
    if (!direct || !id) return null;
    return {
      providerMessageId: String(id),
      restaurantId: this.restaurantId,
      from,
      phone: from.replace(/@(c\.us|lid)$/, ''),
      displayName: message._data?.notifyName ? String(message._data.notifyName) : null,
      type: String(message.type ?? 'chat'),
      text: String(message.body ?? '').trim(),
      timestamp: new Date(Number(message.timestamp || Math.floor(Date.now() / 1000)) * 1000),
      fromMe: Boolean(message.fromMe),
      isStatus: Boolean(message.isStatus) || from === 'status@broadcast',
    };
  }

  private async handleDisconnect(reason: string) {
    this.clearTimers();
    if (this.disconnectingByUser) return;
    this.log('disconnected', { reason });
    const revoked = /logout|unpaired|conflict/i.test(reason);
    if (revoked) {
      this.updateStatus({ state: 'DISCONNECTED', error: 'WhatsApp desconectado. É necessário conectar novamente.', qrDataUrl: null, qrExpiresAt: null });
      return;
    }
    const maxAttempts = this.options.maxReconnectAttempts ?? 2;
    if (this.reconnectAttempts >= maxAttempts) {
      this.updateStatus({ state: 'ERROR', error: 'Não foi possível restabelecer a conexão.', qrDataUrl: null, qrExpiresAt: null });
      return;
    }
    this.reconnectAttempts += 1;
    this.updateStatus({ state: 'RECONNECTING', error: null, qrDataUrl: null, qrExpiresAt: null });
    this.reconnectTimer = setTimeout(() => void this.reconnect(), 5_000 * this.reconnectAttempts);
  }

  private async reconnect() {
    await this.closeClient();
    this.readyRecoveryTriggered = false;
    await this.createClient('RECONNECTING');
  }

  private startReadyRecovery() {
    this.recoveryTimer = setInterval(() => {
      if (!['INITIALIZING', 'CONNECTING', 'RECONNECTING'].includes(this.status.state)) return;
      void this.recoverMissedReadyEvent();
    }, 5_000);
  }

  private async recoverMissedReadyEvent() {
    if (this.readyRecoveryTriggered || !this.client) return;
    const endpoint = (this.client as any).pupBrowser?.wsEndpoint?.();
    if (!endpoint) return;
    const browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
    try {
      const pages = await browser.pages();
      const page = pages.find((candidate) => candidate.url().startsWith('https://web.whatsapp.com'));
      if (!page) return;
      const missed = await page.evaluate(`(() => {
        try {
          const socket = window.require && window.require('WAWebSocketModel').Socket;
          return Boolean(socket && socket.hasSynced && typeof window.onAppStateHasSyncedEvent === 'function');
        } catch (_) { return false; }
      })()`);
      if (missed) {
        this.readyRecoveryTriggered = true;
        await page.evaluate('window.onAppStateHasSyncedEvent(); true');
      }
    } finally {
      browser.disconnect();
    }
  }

  private updateStatus(patch: Partial<WhatsAppProviderStatus>) {
    this.status = { ...this.status, ...patch };
    const snapshot = this.getStatus();
    for (const handler of this.statusHandlers) void Promise.resolve(handler(snapshot));
  }

  private async closeClient() {
    this.clearTimers();
    const client = this.client;
    this.client = null;
    if (client) await client.destroy().catch(() => undefined);
  }

  private clearQrTimer() {
    if (this.qrExpiryTimer) clearTimeout(this.qrExpiryTimer);
    this.qrExpiryTimer = null;
  }

  private clearTimers() {
    this.clearQrTimer();
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.recoveryTimer = null;
    this.reconnectTimer = null;
  }

  private clientId() {
    return `restaurant-${this.restaurantId}`;
  }

  private sessionPath() {
    return path.join(this.options.authPath, `session-${this.clientId()}`);
  }

  private chromeExecutablePath() {
    if (this.options.chromePath) return this.options.chromePath;
    const windowsPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    return process.platform === 'win32' && existsSync(windowsPath) ? windowsPath : undefined;
  }

  private friendlyInitializationError(error: unknown) {
    const message = this.errorMessage(error);
    if (/internet|network|ERR_/i.test(message)) return 'Não foi possível acessar o WhatsApp. Verifique a internet do servidor.';
    if (/profile|lock|user data/i.test(message)) return 'A sessão local está em uso ou corrompida. Tente conectar novamente.';
    return `Não foi possível iniciar o WhatsApp: ${message}`;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private log(event: string, details: Record<string, unknown> = {}) {
    console.info(JSON.stringify({ scope: 'whatsapp', provider: this.type, event, restaurantId: this.restaurantId, ...details }));
  }
}
