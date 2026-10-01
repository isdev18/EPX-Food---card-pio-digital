import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bike, ChefHat, CircleDollarSign, Clock3, PackageCheck, ReceiptText, ShoppingBag } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { MetricCard } from '../components/MetricCard';
import { api } from '../lib/api';
import type { Order } from '../types';

type DashboardData = {
  metrics: { orders: number; revenue: number; averageTicket: number; preparing: number; delivering: number; completed: number };
  topProducts: { name: string; quantity: number }[];
};

const emptyDashboard: DashboardData = { metrics: { orders: 0, revenue: 0, averageTicket: 0, preparing: 0, delivering: 0, completed: 0 }, topProducts: [] };
const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const localDay = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export function Dashboard() {
  const [period, setPeriod] = useState('7 dias');
  const [now, setNow] = useState(new Date());
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [summary, loadedOrders] = await Promise.all([api<DashboardData>('/dashboard'), api<Order[]>('/orders')]);
        if (!active) return;
        setDashboard(summary);
        setOrders(loadedOrders.map((order) => ({ ...order, total: Number(order.total), subtotal: Number(order.subtotal), deliveryFee: Number(order.deliveryFee) })));
        setError('');
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os indicadores.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const refresh = window.setInterval(() => void load(), 15_000);
    const clock = window.setInterval(() => setNow(new Date()), 60_000);
    return () => { active = false; window.clearInterval(refresh); window.clearInterval(clock); };
  }, []);

  const days = period === '30 dias' ? 30 : 7;
  const revenueData = useMemo(() => Array.from({ length: days }, (_, index) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (days - index - 1));
    const value = orders.filter((order) => localDay(new Date(order.createdAt)) === localDay(date) && order.status !== 'CANCELLED').reduce((sum, order) => sum + order.total, 0);
    return { day: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), value };
  }), [orders, days]);
  const todayOrders = useMemo(() => orders.filter((order) => localDay(new Date(order.createdAt)) === localDay(new Date()) && order.status !== 'CANCELLED'), [orders]);
  const hourlyData = useMemo(() => Array.from({ length: 13 }, (_, index) => {
    const hour = index + 10;
    return { hour: `${hour}h`, value: todayOrders.filter((order) => new Date(order.createdAt).getHours() === hour).length };
  }), [todayOrders]);
  const paymentColors = { PIX: '#21a67a', CARD: '#e44c4c', CASH: '#f0af45' } as const;
  const payments = (Object.keys(paymentColors) as (keyof typeof paymentColors)[]).map((method) => ({
    name: method === 'CARD' ? 'Cartão' : method === 'CASH' ? 'Dinheiro' : 'PIX',
    value: todayOrders.filter((order) => order.paymentMethod === method).length,
    color: paymentColors[method],
  }));
  const periodRevenue = revenueData.reduce((sum, point) => sum + point.value, 0);
  const peak = hourlyData.reduce((best, item) => item.value > best.value ? item : best, { hour: '—', value: 0 });

  return <div className="page-stack">
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="welcome-row"><div><span className="live-dot" /> Operação ao vivo · atualizado às {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div><Link className="button primary" to="/pedidos"><ShoppingBag size={17} /> Ver pedidos</Link></div>
    <div className="metrics-grid"><MetricCard label="Pedidos hoje" value={String(dashboard.metrics.orders)} detail={loading ? 'Carregando…' : 'Dados reais da operação'} icon={ReceiptText} /><MetricCard label="Faturamento" value={brl(dashboard.metrics.revenue)} detail="Pedidos não cancelados" icon={CircleDollarSign} tone="red" /><MetricCard label="Ticket médio" value={brl(dashboard.metrics.averageTicket)} detail="Média de hoje" icon={ShoppingBag} tone="orange" /><MetricCard label="Em preparo" value={String(dashboard.metrics.preparing)} detail="Pedidos na cozinha" icon={ChefHat} tone="blue" /><MetricCard label="Em entrega" value={String(dashboard.metrics.delivering)} detail="Motoboy saiu" icon={Bike} tone="purple" /><MetricCard label="Prontos" value={String(dashboard.metrics.completed)} detail="Aguardando retirada" icon={PackageCheck} tone="slate" /></div>
    <div className="dashboard-grid"><article className="panel chart-large"><div className="panel-head"><div><h3>Faturamento</h3><p>Desempenho do período</p></div><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>7 dias</option><option>30 dias</option></select></div><div className="chart-total"><strong>{brl(periodRevenue)}</strong></div><ResponsiveContainer width="100%" height={245}><AreaChart data={revenueData}><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#21a67a" stopOpacity={0.24}/><stop offset="95%" stopColor="#21a67a" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#edf1ef" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} width={34} /><Tooltip formatter={(value) => brl(Number(value))} /><Area type="monotone" dataKey="value" stroke="#15966b" strokeWidth={3} fill="url(#area)" /></AreaChart></ResponsiveContainer></article>
      <article className="panel"><div className="panel-head"><div><h3>Pedidos por horário</h3><p>Movimento de hoje</p></div></div><ResponsiveContainer width="100%" height={245}><BarChart data={hourlyData}><CartesianGrid stroke="#edf1ef" vertical={false} /><XAxis dataKey="hour" axisLine={false} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} width={24} /><Tooltip /><Bar dataKey="value" fill="#46c9a3" radius={[5,5,0,0]} /></BarChart></ResponsiveContainer></article>
      <article className="panel"><div className="panel-head"><div><h3>Pedidos recentes</h3><p>Acompanhe os últimos pedidos</p></div><Link to="/pedidos">Ver todos <ArrowRight size={15} /></Link></div><div className="recent-list">{orders.slice(0, 4).map((order) => <Link to={`/pedidos?q=${order.number}`} key={order.id}><span className={`order-dot ${order.status.toLowerCase()}`} /><div><b>#{order.number} · {order.customer.name ?? 'Cliente'}</b><small>{order.items.length} {order.items.length === 1 ? 'item' : 'itens'} · {brl(order.total)}</small></div><time>{new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time></Link>)}{!orders.length && <div className="kanban-empty">Nenhum pedido registrado.</div>}</div></article>
      <article className="panel top-products"><div className="panel-head"><div><h3>Mais vendidos</h3><p>Produtos de hoje</p></div></div>{dashboard.topProducts.map((product, index) => <div className="rank" key={product.name}><em>{index + 1}</em><img src="/pizza-hero.png" alt="" /><div><b>{product.name}</b><span><i style={{ width: `${Math.min(100, product.quantity * 10)}%` }} /></span></div><strong>{product.quantity}</strong></div>)}{!dashboard.topProducts.length && <div className="kanban-empty">Sem vendas hoje.</div>}</article>
      <article className="panel payments"><div className="panel-head"><div><h3>Formas de pagamento</h3><p>Distribuição de hoje</p></div></div>{todayOrders.length ? <div className="payment-chart"><ResponsiveContainer width="55%" height={180}><PieChart><Pie data={payments} dataKey="value" innerRadius={50} outerRadius={72} paddingAngle={3}>{payments.map((entry) => <Cell fill={entry.color} key={entry.name} />)}</Pie></PieChart></ResponsiveContainer><div>{payments.map((entry) => <p key={entry.name}><i style={{ background: entry.color }} /><span>{entry.name}</span><b>{Math.round(entry.value / todayOrders.length * 100)}%</b></p>)}</div></div> : <div className="kanban-empty">Sem pagamentos hoje.</div>}</article>
    </div>
    <div className="operation-strip"><span><Clock3 /> Horário de pico observado</span><b>{peak.value ? peak.hour : 'Sem dados'}</b><p>{peak.value ? `${peak.value} pedido(s) neste horário.` : 'Os dados aparecerão após os primeiros pedidos.'}</p></div>
  </div>;
}
