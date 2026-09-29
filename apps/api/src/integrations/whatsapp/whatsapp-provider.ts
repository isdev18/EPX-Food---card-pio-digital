export type WhatsAppConnectionState =
  | 'DISCONNECTED'
  | 'INITIALIZING'
  | 'QR_REQUIRED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'AUTH_FAILURE'
  | 'DISCONNECTED_BY_USER'
  | 'ERROR';

export type WhatsAppProviderStatus = {
  provider: 'QR_SESSION' | 'META_CLOUD';
  state: WhatsAppConnectionState;
  qrDataUrl: string | null;
  qrExpiresAt: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  connectedAt: string | null;
  lastActivityAt: string | null;
  error: string | null;
};

export type IncomingMessage = {
  providerMessageId: string;
  restaurantId: string;
  from: string;
  phone: string;
  displayName: string | null;
  type: string;
  text: string;
  timestamp: Date;
  fromMe: boolean;
  isStatus: boolean;
};

export type OutgoingMessage = {
  to: string;
  type: 'text';
  text: string;
};

export type Unsubscribe = () => void;

export interface WhatsAppProvider {
  readonly restaurantId: string;
  readonly type: 'QR_SESSION' | 'META_CLOUD';
  connect(): Promise<WhatsAppProviderStatus>;
  disconnect(removeCredentials?: boolean): Promise<WhatsAppProviderStatus>;
  getStatus(): WhatsAppProviderStatus;
  sendText(to: string, text: string): Promise<void>;
  sendMessage(message: OutgoingMessage): Promise<void>;
  onMessage(handler: (message: IncomingMessage) => void | Promise<void>): Unsubscribe;
  onConnectionUpdate(handler: (status: WhatsAppProviderStatus) => void | Promise<void>): Unsubscribe;
  checkHealth(): Promise<boolean>;
}
