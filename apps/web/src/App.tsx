import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Orders = lazy(() => import('./pages/Orders').then((module) => ({ default: module.Orders })));
const Catalog = lazy(() => import('./pages/Catalog').then((module) => ({ default: module.Catalog })));
const Customers = lazy(() => import('./pages/Customers').then((module) => ({ default: module.Customers })));
const Deliveries = lazy(() => import('./pages/Deliveries').then((module) => ({ default: module.Deliveries })));
const ModulePage = lazy(() => import('./pages/Modules').then((module) => ({ default: module.ModulePage })));
const WhatsApp = lazy(() => import('./pages/WhatsApp').then((module) => ({ default: module.WhatsApp })));
const PublicMenu = lazy(() => import('./pages/PublicMenu').then((module) => ({ default: module.PublicMenu })));
const OrderTracking = lazy(() => import('./pages/PublicMenu').then((module) => ({ default: module.OrderTracking })));

function Protected() {
  return localStorage.getItem('epx-token') ? <Layout /> : <Navigate to="/login" replace />;
}

export function App() {
  return <Suspense fallback={<div className="route-loading"><span /></div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Register />} />
      <Route path="/r/:slug" element={<PublicMenu />} />
      <Route path="/menu/s/:token" element={<PublicMenu />} />
      <Route path="/pedido/:token" element={<OrderTracking />} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="pedidos" element={<Orders />} />
        <Route path="cardapio" element={<Catalog />} />
        <Route path="clientes" element={<Customers />} />
        <Route path="entregas" element={<Deliveries />} />
        <Route path="cupons" element={<ModulePage type="cupons" />} />
        <Route path="promocoes" element={<ModulePage type="promocoes" />} />
        <Route path="relatorios" element={<ModulePage type="relatorios" />} />
        <Route path="whatsapp" element={<WhatsApp />} />
        <Route path="configuracoes" element={<ModulePage type="configuracoes" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </Suspense>;
}
