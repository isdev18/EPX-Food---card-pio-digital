import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { OrderDrawer } from '../components/OrderDrawer';
import { api } from '../lib/api';
import type { Order, Status } from '../types';

const columns: { status: Status; title: string; color: string }[] = [
  { status: 'NEW', title: 'Novos', color: '#e7a21b' }, { status: 'CONFIRMED', title: 'Confirmados', color: '#448de0' },
  { status: 'PREPARING', title: 'Em preparo', color: '#9a63dc' }, { status: 'READY', title: 'Prontos', color: '#28a879' },
  { status: 'OUT_FOR_DELIVERY', title: 'Em entrega', color: '#ef7655' }, { status: 'DELIVERED', title: 'Entregues', color: '#7d8b91' },
];
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
  const [filter, setFilter] = useState<Status | 'ALL'>(columns.some((column) => column.status === requestedStatus) ? requestedStatus as Status : 'ALL');
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
    return (filter === 'ALL' || order.status === filter) && `${order.number} ${customerName}`.toLowerCase().includes(search.toLowerCase());
  }), [orders, search, filter]);

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

  return <div className="page-stack orders-page"><div className="page-toolbar"><label className="page-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número ou cliente" /></label><div><select className="button ghost" value={filter} onChange={(event) => setFilter(event.target.value as Status | 'ALL')}><option value="ALL">Todos os pedidos</option>{columns.map((column) => <option value={column.status} key={column.status}>{column.title}</option>)}</select></div></div>
    {error && <div className="kanban-empty" role="alert">{error}</div>}
    <div className="kanban">{columns.map((column) => { const list = shown.filter((order) => order.status === column.status); return <section className="kanban-column" key={column.status}><header><span style={{ background: column.color }} /><b>{column.title}</b><em>{list.length}</em></header><div className="kanban-list">{list.map((order) => <button className="order-card" onClick={() => setSelected(order)} key={order.id}><div className="order-card-head"><strong>#{order.number}</strong><time><Clock3 size={13} />{new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time></div><h4>{order.customer.name ?? 'Cliente WhatsApp'}</h4><p>{order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</p><div className="order-card-foot"><span>{order.items.length} {order.items.length === 1 ? 'item' : 'itens'}</span><strong>{brl(order.total)}</strong></div></button>)}{list.length === 0 && <div className="kanban-empty">{loading ? 'Carregando...' : 'Nenhum pedido'}</div>}</div></section>; })}</div>
    {selected && <OrderDrawer order={selected} onClose={() => setSelected(undefined)} onStatus={(status) => void changeStatus(status)} />}
  </div>;
}
