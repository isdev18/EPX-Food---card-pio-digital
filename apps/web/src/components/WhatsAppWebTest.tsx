import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LogOut,
  MessageCircle,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShoppingBag,
  UserRound,
} from 'lucide-react';
import { api, subscribeApi } from '../lib/api';
import './WhatsAppWebTest.css';

type ConnectionState =
  | 'DISCONNECTED'
  | 'INITIALIZING'
  | 'QR_REQUIRED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'AUTH_FAILURE'
  | 'DISCONNECTED_BY_USER'
  | 'ERROR';

type WhatsAppStatus = {
  provider: 'QR_SESSION';
  state: ConnectionState;
  qrDataUrl: string | null;
  qrExpiresAt: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  connectedAt: string | null;
  lastActivityAt: string | null;
  error: string | null;
  active: boolean;
  metrics: {
    receivedToday: number;
    ordersOriginated: number;
    humanHandoffs: number;
    lastActivityAt: string | null;
  };
};

const stateCopy: Record<ConnectionState, { title: string; detail: string; tone: string }> = {
  DISCONNECTED: { title: 'Não conectado', detail: 'Conecte o WhatsApp para iniciar o atendimento.', tone: 'idle' },
  INITIALIZING: { title: 'Preparando WhatsApp...', detail: 'Iniciando uma sessão segura no servidor.', tone: 'pending' },
  QR_REQUIRED: { title: 'Escaneie o QR Code', detail: 'Use o celular vinculado ao estabelecimento.', tone: 'pending' },
  CONNECTING: { title: 'Conectando...', detail: 'QR reconhecido. Aguarde a sincronização.', tone: 'pending' },
  CONNECTED: { title: 'WhatsApp conectado', detail: 'Sessão online e pronta para receber mensagens.', tone: 'connected' },
  RECONNECTING: { title: 'Reconectando...', detail: 'Tentando recuperar a sessão existente.', tone: 'pending' },
  AUTH_FAILURE: { title: 'Autenticação revogada', detail: 'É necessário gerar um novo QR.', tone: 'error' },
  DISCONNECTED_BY_USER: { title: 'Desconectado', detail: 'A sessão foi encerrada pelo administrador.', tone: 'idle' },
  ERROR: { title: 'Não foi possível conectar', detail: 'Confira o servidor e tente novamente.', tone: 'error' },
};

function formatPhone(value: string | null) {
  if (!value) return 'Número não identificado';
  const digits = value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `+${value.replace(/\D/g, '')}`;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem atividade';
}

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export function WhatsAppWebTest() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      setStatus(await api<WhatsAppStatus>('/integrations/whatsapp'));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível consultar o WhatsApp.');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh();
    void (async () => {
      let retryDelay = 2_000;
      while (!controller.signal.aborted) {
        try {
          await subscribeApi<WhatsAppStatus>('/integrations/whatsapp/events', (next) => {
            setStatus(next);
            setError('');
          }, controller.signal);
          retryDelay = 2_000;
        } catch {
          if (!controller.signal.aborted) {
            // Mantém a tela funcional por consulta normal enquanto o canal SSE reconecta.
            // Se a própria API estiver indisponível, refresh exibirá o erro relevante.
            await refresh();
          }
        }
        if (!controller.signal.aborted) {
          await wait(retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        }
      }
    })();
    return () => controller.abort();
  }, [refresh]);

  const connect = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setStatus(await api<WhatsAppStatus>('/integrations/whatsapp/connect', { method: 'POST' }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível gerar o QR Code.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Tem certeza que deseja desconectar este WhatsApp?')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setStatus(await api<WhatsAppStatus>('/integrations/whatsapp', { method: 'DELETE' }));
      setNotice('WhatsApp desconectado com segurança.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível desconectar.');
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ ok: boolean; message: string }>('/integrations/whatsapp/test', { method: 'POST' });
      result.ok ? setNotice(`✅ ${result.message}`) : setError(`❌ ${result.message}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Problema na conexão.');
    } finally {
      setBusy(false);
    }
  };

  const currentState = status?.state ?? 'DISCONNECTED';
  const copy = stateCopy[currentState];
  const connected = currentState === 'CONNECTED';
  const waiting = ['INITIALIZING', 'CONNECTING', 'RECONNECTING'].includes(currentState);
  const qrExpired = currentState === 'QR_REQUIRED' && !status?.qrDataUrl;

  return <div className="whatsapp-web-test">
    <div className="integration-message error"><ShieldAlert />O modo QR usa um conector não oficial. Utilize um número comercial dedicado e esteja ciente das limitações da plataforma.</div>
    {error && <div className="integration-message error"><AlertTriangle />{error}</div>}
    {notice && <div className="integration-message success"><CheckCircle2 />{notice}</div>}

    <section className="panel whatsapp-connection-card">
      <header>
        <div><span className="eyebrow">CONEXÃO</span><h3>WhatsApp do estabelecimento</h3></div>
        <button className="icon-button" onClick={() => void refresh()} aria-label="Atualizar estado"><RefreshCw size={17} /></button>
      </header>

      <div className={`web-test-status ${copy.tone}`}>
        {connected ? <CheckCircle2 /> : waiting ? <RefreshCw className="spin-icon" /> : <QrCode />}
        <span><b>{copy.title}</b><small>{status?.error || copy.detail}</small></span>
      </div>

      {status?.qrDataUrl && <div className="web-qr">
        <h4>Conectar WhatsApp</h4>
        <img src={status.qrDataUrl} alt="QR Code temporário do WhatsApp" />
        <ol>
          <li>Abra o WhatsApp no celular.</li>
          <li>Acesse <b>Configurações → Aparelhos conectados</b>.</li>
          <li>Toque em <b>Conectar aparelho</b> e escaneie o QR acima.</li>
        </ol>
        {status.qrExpiresAt && <small>QR temporário. Expira em aproximadamente 1 minuto.</small>}
      </div>}

      {qrExpired && <div className="qr-expired"><AlertTriangle /><div><b>QR Code expirado.</b><span>Gere um novo código para continuar.</span></div></div>}

      {connected && <div className="connected-details">
        <div><span>Número</span><strong>{formatPhone(status?.phoneNumber ?? null)}</strong></div>
        <div><span>Status</span><strong className="online-dot">Online</strong></div>
        <div><span>Última conexão</span><strong>{formatDate(status?.connectedAt ?? null)}</strong></div>
      </div>}

      {!connected && !status?.qrDataUrl && !waiting && <button className="button primary connect-button" onClick={() => void connect()} disabled={busy}>
        <QrCode size={18} /> {qrExpired || ['AUTH_FAILURE', 'ERROR'].includes(currentState) ? 'Gerar novo QR' : 'Conectar WhatsApp'}
      </button>}

      {connected && <div className="connection-actions">
        <button className="button ghost" onClick={() => void testConnection()} disabled={busy}><Activity size={17} /> Testar conexão</button>
        <button className="button danger" onClick={() => void disconnect()} disabled={busy}><LogOut size={17} /> Desconectar</button>
      </div>}
    </section>

    <section className="whatsapp-metrics">
      <article className="panel"><MessageCircle /><span>Mensagens recebidas hoje</span><strong>{status?.metrics.receivedToday ?? 0}</strong></article>
      <article className="panel"><ShoppingBag /><span>Pedidos originados</span><strong>{status?.metrics.ordersOriginated ?? 0}</strong></article>
      <article className="panel"><UserRound /><span>Atendimentos humanos</span><strong>{status?.metrics.humanHandoffs ?? 0}</strong></article>
      <article className="panel"><Clock3 /><span>Última atividade</span><strong>{formatDate(status?.metrics.lastActivityAt ?? null)}</strong></article>
    </section>
  </div>;
}
