import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { OrderDrawer } from '../components/OrderDrawer';
import { api } from '../lib/api';
import type { Order, Status } from '../types';

type ActiveStatus = 'NEW' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY';
type OperationalStatus = ActiveStatus | 'CANCELLED';
const columns: { status: ActiveStatus; title: string; color: string }[] = [
  { status: 'NEW', title: 'Pedidos recebidos', color: '#d99a2b' },
  { status: 'PREPARING', title: 'Está sendo preparado', color: '#9a63dc' },
  { status: 'READY', title: 'Pronto para retirar', color: '#28a879' },
  { status: 'OUT_FOR_DELIVERY', title: 'Motoboy saiu para entrega', color: '#ef7655' },
];
const operationalStatus = (order: Order): OperationalStatus | null => {
  if (order.status === 'CANCELLED') return 'CANCELLED';
  if (order.status === 'NEW' || order.status === 'CONFIRMED') return 'NEW';
  if (!order.address && (order.status === 'READY' || order.status === 'DELIVERED')) return 'READY';
  if (order.address && (order.status === 'OUT_FOR_DELIVERY' || order.status === 'DELIVERED')) return 'OUT_FOR_DELIVERY';
  return 'PREPARING';
};
const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const normalizeOrder = (order: Order): Order => ({
  ...order,
  subtotal: Number(order.subtotal),
  deliveryFee: Number(order.deliveryFee),
  total: Number(order.total),
  items: order.items.map((item) => ({
    ...item,
    unitPrice: Number(item.unitPrice),
    subtotal: Number(item.subtotal),
  })),
});

export function Orders() {
  const [params] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order>();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const requestedStatus = params.get('status');
  const [tab, setTab] = useState<'ACTIVE' | 'CANCELLED'>(requestedStatus === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE');
  const [filter, setFilter] = useState<ActiveStatus | 'ALL'>(columns.some((column) => column.status === requestedStatus) ? requestedStatus as ActiveStatus : 'ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const data = await api<Order[]>('/orders');
      const normalized = data.map(normalizeOrder);
      setOrders(normalized);
      setSelected((current) => current ? normalized.find((order) => order.id === current.id) : undefined);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os pedidos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const shown = useMemo(() => orders.filter((order) => {
    const customerName = order.customer.name ?? 'Cliente WhatsApp';
    const stage = operationalStatus(order);
    const matchesTab = tab === 'CANCELLED' ? stage === 'CANCELLED' : stage !== null && stage !== 'CANCELLED';
    return matchesTab && (tab === 'CANCELLED' || filter === 'ALL' || stage === filter) && `${order.number} ${customerName}`.toLowerCase().includes(search.toLowerCase());
  }), [orders, search, filter, tab]);
  const cancelledCount = orders.filter((order) => order.status === 'CANCELLED').length;
  const visibleColumns: { status: OperationalStatus; title: string; color: string }[] = tab === 'CANCELLED'
    ? [{ status: 'CANCELLED', title: 'Pedidos cancelados', color: '#c65348' }]
    : columns;

  const changeStatus = async (status: Status) => {
    if (!selected) return;
    try {
      const updated = normalizeOrder(await api<Order>(`/orders/${selected.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }));
      setOrders((all) => all.map((order) => order.id === updated.id ? updated : order));
      setSelected(updated);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o pedido.');
      await refresh();
    }
  };

  return <div className="page-stack orders-page"><nav className="orders-tabs" aria-label="Tipo de pedido"><button className={tab === 'ACTIVE' ? 'active' : ''} onClick={() => { setTab('ACTIVE'); setSelected(undefined); }}>Pedidos ativos</button><button className={tab === 'CANCELLED' ? 'active' : ''} onClick={() => { setTab('CANCELLED'); setSelected(undefined); }}>Cancelados <span>{cancelledCount}</span></button></nav><div className="page-toolbar"><label className="page-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número ou cliente" /></label>{tab === 'ACTIVE' && <div><select className="button ghost" value={filter} onChange={(event) => setFilter(event.target.value as ActiveStatus | 'ALL')}><option value="ALL">Todos os pedidos</option>{columns.map((column) => <option value={column.status} key={column.status}>{column.title}</option>)}</select></div>}</div>
    {error && <div className="kanban-empty" role="alert">{error}</div>}
    <div className={`kanban simplified-kanban ${tab === 'CANCELLED' ? 'cancelled-kanban' : ''}`}>{visibleColumns.map((column) => { const list = shown.filter((order) => operationalStatus(order) === column.status); return <section className="kanban-column" key={column.status}><header><span style={{ background: column.color }} /><b>{column.title}</b><em>{list.length}</em></header><div className="kanban-list">{list.map((order) => <button className="order-card" onClick={() => setSelected(order)} key={order.id}><div className="order-card-head"><strong>#{order.number}</strong><time><Clock3 size={13} />{new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time></div><h4>{order.customer.name ?? 'Cliente WhatsApp'}</h4><p>{order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</p><div className="order-card-foot"><span>{order.items.length} {order.items.length === 1 ? 'item' : 'itens'} · {order.address ? 'Entrega' : 'Retirada'}</span><strong>{brl(order.total)}</strong></div></button>)}{list.length === 0 && <div className="kanban-empty">{loading ? 'Carregando...' : 'Nenhum pedido'}</div>}</div></section>; })}</div>
    {selected && <OrderDrawer order={selected} onClose={() => setSelected(undefined)} onStatus={(status) => void changeStatus(status)} />}
  </div>;
}
