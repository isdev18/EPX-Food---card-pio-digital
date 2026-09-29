import { Clock, MapPin, MessageCircle, Printer, UserRound, WalletCards, X } from 'lucide-react';
import type { Order, Status } from '../types';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const labels: Record<Status, string> = { NEW: 'Novo', CONFIRMED: 'Confirmado', PREPARING: 'Em preparo', READY: 'Pronto', OUT_FOR_DELIVERY: 'Em entrega', DELIVERED: 'Entregue', CANCELLED: 'Cancelado' };
const next: Partial<Record<Status, Status>> = { NEW: 'CONFIRMED', CONFIRMED: 'PREPARING', PREPARING: 'READY', READY: 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'DELIVERED' };

export function OrderDrawer({ order, onClose, onStatus }: { order: Order; onClose: () => void; onStatus: (status: Status) => void }) {
  const isDelivery = Boolean(order.address);
  const advance = order.status === 'READY' && !isDelivery ? 'DELIVERED' : next[order.status];
  const currentLabel = order.status === 'READY' && !isDelivery ? 'Pronto para retirada' : order.status === 'DELIVERED' && !isDelivery ? 'Retirado' : labels[order.status];
  const advanceLabel = advance === 'READY' && !isDelivery ? 'Pronto para retirada' : advance === 'DELIVERED' && !isDelivery ? 'Retirado' : advance === 'OUT_FOR_DELIVERY' ? 'Saiu para entrega' : advance ? labels[advance] : '';
  return <><button className="drawer-backdrop" onClick={onClose} aria-label="Fechar detalhes" /><aside className="order-drawer">
    <header><div><span className="eyebrow">Detalhes do pedido</span><h2>Pedido #{order.number}</h2></div><button className="icon-button" onClick={onClose}><X size={20} /></button></header>
    <div className="drawer-status"><span className={`status-pill ${order.status.toLowerCase()}`}>{currentLabel}</span><small><Clock size={14} /> Recebido às {new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></div>
    <div className="info-grid"><div><UserRound /><span><small>Cliente</small><b>{order.customer.name}</b><em>{order.customer.phone}</em></span></div><div><WalletCards /><span><small>Pagamento</small><b>{order.paymentMethod === 'PIX' ? 'PIX' : order.paymentMethod === 'CARD' ? 'Cartão' : 'Dinheiro'}</b><em>{order.paymentStatus === 'PAID' ? 'Pago' : 'Aguardando'}</em></span></div></div>
    {order.address && <div className="address-box"><MapPin size={18} /><div><small>Endereço de entrega</small><b>{order.address.street}, {order.address.number} · {order.address.neighborhood}</b><span>{order.address.city}{order.address.reference ? ` · Ref.: ${order.address.reference}` : ''}</span></div></div>}
    <section className="drawer-items"><h3>Itens do pedido <span>{order.items.length}</span></h3>{order.items.map((item) => <div className="drawer-item" key={item.id}><img src="/pizza-hero.png" alt="" /><div><b>{item.quantity}× {item.name}</b>{item.configuration && <small>{[item.configuration.size, item.configuration.flavors?.join(' / '), item.configuration.crust && `Borda ${item.configuration.crust}`, item.configuration.extras?.join(', ')].filter(Boolean).join(' · ')}</small>}<strong>{brl(item.subtotal)}</strong></div></div>)}</section>
    <div className="totals"><p><span>Subtotal</span><b>{brl(order.subtotal)}</b></p><p><span>Entrega</span><b>{brl(order.deliveryFee)}</b></p><p className="total"><span>Total</span><b>{brl(order.total)}</b></p></div>
    <div className="drawer-actions"><button className="button ghost" onClick={() => window.print()}><Printer size={17} /> Imprimir</button><button className="button ghost" onClick={() => window.open(`https://wa.me/55${order.customer.phone.replace(/\D/g, '')}`, '_blank')}><MessageCircle size={17} /> Mensagem</button>{advance && <button className="button primary" onClick={() => onStatus(advance)}>Avançar para: {advanceLabel}</button>}</div>
  </aside></>;
}
