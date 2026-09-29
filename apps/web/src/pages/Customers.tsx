import { useEffect, useMemo, useState } from 'react';
import { Mail, MessageCircle, Search } from 'lucide-react';
import { api } from '../lib/api';

type Customer = { id: string; name: string | null; phone: string; orderCount: number; totalSpent: number | string; lastOrderAt: string | null };
const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api<Customer[]>('/customers').then((result) => { if (active) setCustomers(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os clientes.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const shown = useMemo(() => customers.filter((customer) => `${customer.name ?? ''} ${customer.phone}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))), [customers, search]);
  return <div className="page-stack">{error && <div className="form-error" role="alert">{error}</div>}<div className="page-toolbar"><label className="page-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome ou telefone" /></label><span className="muted">{shown.length} {shown.length === 1 ? 'cliente encontrado' : 'clientes encontrados'}</span></div><div className="table-panel"><table><thead><tr><th>Cliente</th><th>Histórico</th><th>Total gasto</th><th>Último pedido</th><th></th></tr></thead><tbody>{shown.map((customer) => { const name = customer.name ?? 'Cliente WhatsApp'; const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(); return <tr key={customer.id}><td><div className="customer-cell"><span>{initials}</span><div><b>{name}</b><small>{customer.phone}</small></div></div></td><td>{customer.orderCount} {customer.orderCount === 1 ? 'pedido' : 'pedidos'}</td><td><b>{brl(Number(customer.totalSpent))}</b></td><td>{customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem pedidos'}</td><td><button className="icon-button" aria-label={`Conversar com ${name}`} onClick={() => window.open(`https://wa.me/${customer.phone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer')}><MessageCircle size={17} /></button></td></tr>; })}</tbody></table>{!shown.length && <div className="kanban-empty">{loading ? 'Carregando clientes…' : 'Nenhum cliente cadastrado.'}</div>}</div><div className="customer-insight"><Mail /><div><b>Relacionamento protegido por restaurante</b><p>Os dados exibidos vêm da API e são isolados pelo restaurante autenticado.</p></div></div></div>;
}
