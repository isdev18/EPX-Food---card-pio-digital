export const API_URL = import.meta.env.VITE_API_URL
  ?? (import.meta.env.PROD ? '/api' : 'http://localhost:3000/api');

function expireSession(path: string, response: Response) {
  if (response.status !== 401 || path === '/auth/login') return;
  localStorage.removeItem('epx-token');
  localStorage.removeItem('epx-user');
  if (!window.location.pathname.startsWith('/login')) {
    window.location.replace('/login?reason=session-expired');
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('epx-token');
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers } });
  expireSession(path, response);
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'Erro de comunicação com a API');
  return response.json();
}

export async function subscribeApi<T>(path: string, onData: (data: T) => void, signal: AbortSignal) {
  const token = localStorage.getItem('epx-token');
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
    signal,
  });
  expireSession(path, response);
  if (!response.ok) {
    const message = (await response.json().catch(() => null))?.message;
    throw new Error(message ?? 'Não foi possível abrir a atualização em tempo real.');
  }
  if (!response.body) throw new Error('O navegador não disponibilizou o canal de atualização em tempo real.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const data = frame.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trimStart();
        if (data) onData(JSON.parse(data) as T);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
