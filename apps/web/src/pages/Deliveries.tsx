import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Clock3, Edit3, MapPin, PackageCheck, Plus, Search, Trash2, Truck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OrderDrawer } from '../components/OrderDrawer';
import { api } from '../lib/api';
import type { DeliveryZone, Order, Status } from '../types';
import './Deliveries.css';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const normalizeOrder = (order: Order): Order => ({
  ...order,
  subtotal: Number(order.subtotal),
  deliveryFee: Number(order.deliveryFee),
  total: Number(order.total),
  items: order.items.map((item) => ({ ...item, unitPrice: Number(item.unitPrice), subtotal: Number(item.subtotal) })),
});

type ZoneForm = { neighborhood: string; fee: string; estimatedMinutes: string; active: boolean };
const emptyForm: ZoneForm = { neighborhood: '', fee: '', estimatedMinutes: '40', active: true };

export function Deliveries() {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order>();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<ZoneForm>(emptyForm);
  const [editing, setEditing] = useState<DeliveryZone>();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [loadedZones, loadedOrders] = await Promise.all([
        api<DeliveryZone[]>('/delivery-zones'),
        api<Order[]>('/orders'),
      ]);
      setZones(loadedZones.map((zone) => ({ ...zone, fee: Number(zone.fee) })));
      const normalized = loadedOrders.map(normalizeOrder);
      setOrders(normalized);
      setSelectedOrder((current) => current ? normalized.find((order) => order.id === current.id) : undefined);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as entregas.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 5_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const shownZones = useMemo(() => zones.filter((zone) => zone.neighborhood
    .toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))), [zones, search]);
  const deliveryOrders = useMemo(() => orders.filter((order) => order.address
    && (order.status === 'READY' || order.status === 'OUT_FOR_DELIVERY')), [orders]);
  const activeZones = zones.filter((zone) => zone.active);
  const averageFee = activeZones.length ? activeZones.reduce((sum, zone) => sum + zone.fee, 0) / activeZones.length : 0;
  const outForDelivery = deliveryOrders.filter((order) => order.status === 'OUT_FOR_DELIVERY').length;
  const deliveredToday = orders.filter((order) => order.address && order.status === 'DELIVERED'
    && new Date(order.updatedAt ?? order.createdAt).toDateString() === new Date().toDateString()).length;

  function openCreate() {
    setEditing(undefined);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(zone: DeliveryZone) {
    setEditing(zone);
    setForm({ neighborhood: zone.neighborhood, fee: String(zone.fee).replace('.', ','), estimatedMinutes: String(zone.estimatedMinutes), active: zone.active });
    setModalOpen(true);
  }

  async function saveZone(event: FormEvent) {
    event.preventDefault();
    const fee = Number(form.fee.replace(',', '.'));
    const estimatedMinutes = Number(form.estimatedMinutes);
    if (!form.neighborhood.trim() || !Number.isFinite(fee) || fee < 0 || !Number.isInteger(estimatedMinutes) || estimatedMinutes < 5) {
      setError('Informe um bairro, uma taxa válida e um prazo de pelo menos 5 minutos.');
      return;
    }
    setSaving(editing?.id ?? 'new');
    setError('');
    try {
      const saved = await api<DeliveryZone>(editing ? `/delivery-zones/${editing.id}` : '/delivery-zones', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ neighborhood: form.neighborhood.trim(), fee, estimatedMinutes, active: form.active }),
      });
      const normalized = { ...saved, fee: Number(saved.fee) };
      setZones((current) => editing
        ? current.map((zone) => zone.id === normalized.id ? normalized : zone)
        : [...current, normalized].sort((a, b) => a.neighborhood.localeCompare(b.neighborhood, 'pt-BR')));
      setModalOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a área de entrega.');
    } finally {
      setSaving('');
    }
  }

  async function toggleZone(zone: DeliveryZone) {
    setSaving(zone.id);
    setError('');
    try {
      const updated = await api<DeliveryZone>(`/delivery-zones/${zone.id}`, {
        method: 'PATCH', body: JSON.stringify({ active: !zone.active }),
      });
      setZones((current) => current.map((item) => item.id === zone.id ? { ...updated, fee: Number(updated.fee) } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível alterar a área de entrega.');
    } finally {
      setSaving('');
    }
  }

  async function removeZone(zone: DeliveryZone) {
    if (!window.confirm(`Excluir a área “${zone.neighborhood}”? Pedidos antigos continuarão preservados.`)) return;
    setSaving(zone.id);
    setError('');
    try {
      await api<{ ok: boolean }>(`/delivery-zones/${zone.id}`, { method: 'DELETE' });
      setZones((current) => current.filter((item) => item.id !== zone.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível excluir a área de entrega.');
    } finally {
      setSaving('');
    }
  }

  async function changeOrderStatus(order: Order, status: Status) {
    setSaving(order.id);
    setError('');
    try {
      const updated = normalizeOrder(await api<Order>(`/orders/${order.id}/status`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      }));
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedOrder((current) => current?.id === updated.id ? updated : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o pedido.');
      await load(true);
    } finally {
      setSaving('');
    }
  }

  if (loading) return <div className="page-stack"><div className="panel">Carregando áreas e pedidos…</div></div>;

  return <div className="deliveries-page page-stack">
    {error && <div className="form-error" role="alert">{error}</div>}
    <section className="delivery-metrics">
      <article><span><MapPin /></span><div><small>Áreas ativas</small><strong>{activeZones.length}</strong></div></article>
      <article><span><PackageCheck /></span><div><small>Taxa média</small><strong>{brl(averageFee)}</strong></div></article>
      <article><span><Truck /></span><div><small>Em rota agora</small><strong>{outForDelivery}</strong></div></article>
      <article><span><CheckCircle2 /></span><div><small>Entregues hoje</small><strong>{deliveredToday}</strong></div></article>
    </section>

    <section className="panel delivery-zones-panel">
      <header className="delivery-section-head"><div><h2>Áreas de entrega</h2><p>Edite bairros, taxas, prazos e disponibilidade exibidos no checkout e no WhatsApp.</p></div><button className="button primary" onClick={openCreate}><Plus size={17} /> Nova área</button></header>
      <label className="page-search delivery-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar bairro" /></label>
      <div className="delivery-zone-grid">
        {shownZones.map((zone) => {
          const linkedOrders = orders.filter((order) => order.address?.neighborhood?.toLocaleLowerCase('pt-BR') === zone.neighborhood.toLocaleLowerCase('pt-BR')
            && !['DELIVERED', 'CANCELLED'].includes(order.status)).length;
          return <article className={`delivery-zone-card ${zone.active ? '' : 'inactive'}`} key={zone.id}>
            <div className="delivery-zone-title"><span><MapPin /></span><div><h3>{zone.neighborhood}</h3><small>{linkedOrders} {linkedOrders === 1 ? 'pedido ativo' : 'pedidos ativos'}</small></div><label className="switch"><input type="checkbox" checked={zone.active} disabled={saving === zone.id} onChange={() => void toggleZone(zone)} /><i /><span>{zone.active ? 'Ativa' : 'Pausada'}</span></label></div>
            <div className="delivery-zone-values"><p><small>Taxa</small><strong>{brl(zone.fee)}</strong></p><p><small>Previsão</small><strong>{zone.estimatedMinutes} min</strong></p></div>
            <footer><button disabled={saving === zone.id} onClick={() => openEdit(zone)}><Edit3 /> Editar tudo</button><button className="danger" disabled={saving === zone.id} onClick={() => void removeZone(zone)}><Trash2 /> Excluir</button></footer>
          </article>;
        })}
        {!shownZones.length && <div className="delivery-empty">Nenhuma área encontrada.</div>}
      </div>
    </section>

    <section className="panel delivery-orders-panel">
      <header className="delivery-section-head"><div><h2>Operação de entregas</h2><p>Pedidos prontos e em rota, sincronizados com a tela de Pedidos.</p></div><Link className="button ghost" to="/pedidos?status=OUT_FOR_DELIVERY">Abrir todos os pedidos</Link></header>
      <div className="delivery-order-list">
        {deliveryOrders.map((order) => <article className="delivery-order-row" key={order.id}>
          <button className="delivery-order-main" onClick={() => setSelectedOrder(order)}>
            <span className={`delivery-order-icon ${order.status.toLowerCase()}`}>{order.status === 'READY' ? <PackageCheck /> : <Truck />}</span>
            <div><b>Pedido #{order.number} · {order.customer.name ?? 'Cliente WhatsApp'}</b><small><MapPin /> {order.address?.street}, {order.address?.number} · {order.address?.neighborhood}</small></div>
          </button>
          <div className="delivery-order-meta"><span className={`status-pill ${order.status.toLowerCase()}`}>{order.status === 'READY' ? 'Pronto para sair' : 'Em entrega'}</span><small><Clock3 /> {order.estimatedAt ? `Previsão ${new Date(order.estimatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Sem previsão'}</small></div>
          <button className="button primary delivery-order-action" disabled={saving === order.id} onClick={() => void changeOrderStatus(order, order.status === 'READY' ? 'OUT_FOR_DELIVERY' : 'DELIVERED')}>{saving === order.id ? 'Atualizando…' : order.status === 'READY' ? 'Enviar para entrega' : 'Marcar como entregue'}</button>
        </article>)}
        {!deliveryOrders.length && <div className="delivery-empty"><CheckCircle2 /><b>Tudo em dia</b><span>Não há pedidos aguardando saída ou em rota.</span></div>}
      </div>
    </section>

    {modalOpen && <><button className="drawer-backdrop" onClick={() => setModalOpen(false)} aria-label="Fechar formulário" /><form className="delivery-modal" onSubmit={(event) => void saveZone(event)}>
      <header><div><span className="eyebrow">CONFIGURAÇÃO DE ENTREGA</span><h2>{editing ? 'Editar área' : 'Nova área'}</h2></div><button className="icon-button" type="button" onClick={() => setModalOpen(false)}><X /></button></header>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="delivery-form-grid">
        <label className="wide">Bairro ou região<input value={form.neighborhood} onChange={(event) => setForm({ ...form, neighborhood: event.target.value })} placeholder="Ex.: Centro" maxLength={100} required /></label>
        <label>Taxa de entrega (R$)<input value={form.fee} onChange={(event) => setForm({ ...form, fee: event.target.value })} inputMode="decimal" placeholder="7,00" required /></label>
        <label>Prazo estimado (min)<input value={form.estimatedMinutes} onChange={(event) => setForm({ ...form, estimatedMinutes: event.target.value })} type="number" min="5" max="1440" required /></label>
        <label className="delivery-active-field wide"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span><b>Área ativa</b><small>Disponível para novos pedidos no cardápio e no WhatsApp</small></span></label>
      </div>
      <footer><button className="button ghost" type="button" onClick={() => setModalOpen(false)}>Cancelar</button><button className="button primary" disabled={Boolean(saving)}>{saving ? 'Salvando…' : 'Salvar área'}</button></footer>
    </form></>}

    {selectedOrder && <OrderDrawer order={selectedOrder} onClose={() => setSelectedOrder(undefined)} onStatus={(status) => void changeOrderStatus(selectedOrder, status)} />}
  </div>;
}
