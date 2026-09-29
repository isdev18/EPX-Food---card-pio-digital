import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, BookOpen, ChevronDown, ClipboardList, Gift, Headphones, LayoutDashboard, LogOut, Menu, MessageCircle, PackageOpen, Search, Settings, Store, Tag, Truck, Users, X } from 'lucide-react';
import { Brand } from './Brand';
import './Layout.css';

const nav = [
  ['/', 'Visão geral', LayoutDashboard], ['/pedidos', 'Pedidos', ClipboardList], ['/cardapio', 'Cardápio', BookOpen],
  ['/clientes', 'Clientes', Users], ['/entregas', 'Entregas', Truck], ['/cupons', 'Cupons', Tag],
  ['/promocoes', 'Promoções', Gift], ['/relatorios', 'Relatórios', BarChart3], ['/whatsapp', 'WhatsApp', MessageCircle], ['/configuracoes', 'Configurações', Settings],
] as const;

const titles: Record<string, [string, string]> = {
  '/': ['Visão geral', 'Acompanhe o desempenho da sua pizzaria hoje.'], '/pedidos': ['Gestão de pedidos', 'Acompanhe cada pedido em tempo real.'],
  '/cardapio': ['Cardápio', 'Gerencie produtos, preços e disponibilidade.'], '/clientes': ['Clientes', 'Histórico e relacionamento com seus clientes.'],
  '/entregas': ['Áreas de entrega', 'Taxas e prazos definidos pelo backend.'], '/cupons': ['Cupons', 'Regras de desconto e campanhas.'],
  '/promocoes': ['Promoções', 'Ofertas programadas para vender mais.'], '/relatorios': ['Relatórios', 'Indicadores para decisões mais inteligentes.'],
  '/whatsapp': ['WhatsApp', 'Conexão, conversas e automações.'], '/configuracoes': ['Configurações', 'Preferências da operação.'],
};

export function Layout() {
  const [open, setOpen] = useState(false); const location = useLocation(); const navigate = useNavigate();
  const [title, subtitle] = titles[location.pathname] ?? titles['/'];
  const user = (() => { try { return JSON.parse(localStorage.getItem('epx-user') ?? 'null') as { name?: string; role?: string; restaurant?: string } | null; } catch { return null; } })();
  const userName = user?.name?.trim() || 'Usuário';
  const initials = userName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const role = user?.role === 'OWNER' ? 'Proprietário(a)' : user?.role === 'ADMIN' ? 'Administrador(a)' : 'Usuário';
  const logout = () => { localStorage.removeItem('epx-token'); localStorage.removeItem('epx-user'); navigate('/login'); window.location.reload(); };
  return <div className="app-shell">
    {open && <button className="nav-backdrop" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-head"><Brand /><button className="icon-button mobile-only" onClick={() => setOpen(false)}><X size={19} /></button></div>
      <nav className="main-nav">{nav.map(([path, label, Icon]) => <NavLink end={path === '/'} key={path} to={path} onClick={() => setOpen(false)}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="store-card"><span><Store size={18} /></span><div><b>{user?.restaurant || 'Meu restaurante'}</b><small>Conta ativa</small></div><i /></div><button className="logout" onClick={logout}><LogOut size={17} /> Sair da conta</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-title"><button className="menu-button" onClick={() => setOpen(true)}><Menu /></button><div><h1>{title}</h1><p>{subtitle}</p></div></div><div className="top-actions"><label className="global-search"><Search size={17} /><input placeholder="Buscar pedido ou cliente..." onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/pedidos?q=${encodeURIComponent(event.currentTarget.value)}`); }} /></label><button className="icon-button notification" onClick={() => alert('Você não tem novas notificações.')} aria-label="Notificações"><Bell size={19} /></button><button className="profile" onClick={() => navigate('/configuracoes')}><span>{initials}</span><div><b>{userName}</b><small>{role}</small></div><ChevronDown size={15} /></button></div></header>
      <section className="content"><Outlet /></section>
    </main>
  </div>;
}
