import { useEffect, useState, type FormEvent } from 'react';
import { Clock3, ImagePlus, Save, Settings as SettingsIcon, Store } from 'lucide-react';
import { api } from '../lib/api';
import { imageFileToDataUrl } from '../lib/image';
import type { RestaurantSettings } from '../types';

export function Settings() {
  const [form, setForm] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void api<RestaurantSettings>('/settings').then(setForm).catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as configurações.')).finally(() => setLoading(false));
  }, []);

  async function attach(field: 'logoUrl' | 'bannerUrl', file?: File) {
    if (!file || !form) return;
    setProcessing(field); setError('');
    try { setForm({ ...form, [field]: await imageFileToDataUrl(file) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível anexar a imagem.'); }
    finally { setProcessing(''); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const saved = await api<RestaurantSettings>('/settings', { method: 'PATCH', body: JSON.stringify({
        name: form.name, phone: form.phone || null, logoUrl: form.logoUrl, bannerUrl: form.bannerUrl,
        primaryColor: form.primaryColor, secondaryColor: form.secondaryColor, addressText: form.addressText || null,
        openingHoursText: form.openingHoursText || null, deliveryEstimateMin: Number(form.deliveryEstimateMin),
        deliveryEstimateMax: Number(form.deliveryEstimateMax), minimumOrder: Number(form.minimumOrder),
        acceptScheduledOrders: form.acceptScheduledOrders, halfPizzaPricing: form.halfPizzaPricing,
      }) });
      setForm(saved); setNotice('Configurações salvas com sucesso.');
      const stored = localStorage.getItem('epx-user');
      if (stored) { const user = JSON.parse(stored); localStorage.setItem('epx-user', JSON.stringify({ ...user, restaurant: saved.name })); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar as configurações.'); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="panel">Carregando configurações…</div>;
  if (!form) return <div className="form-error">{error || 'Configurações indisponíveis.'}</div>;
  return <form className="settings-page" onSubmit={(event) => void save(event)}>
    <section className="module-hero"><span><SettingsIcon /></span><div><h2>Configurações da loja</h2><p>Edite identidade, operação, prazos e regras do cardápio público.</p></div><button className="button primary hero-action" disabled={saving || Boolean(processing)}><Save size={17} /> {saving ? 'Salvando…' : 'Salvar alterações'}</button></section>
    {error && <div className="form-error">{error}</div>}{notice && <div className="integration-message success">{notice}</div>}
    <div className="settings-grid">
      <section className="panel settings-card"><header><Store /><div><h3>Identidade da loja</h3><p>Informações mostradas no painel e cardápio.</p></div></header><div className="editor-grid"><label className="wide">Nome do restaurante<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Telefone<input value={form.phone ?? ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="(00) 00000-0000" /></label><label>Endereço<input value={form.addressText} onChange={(event) => setForm({ ...form, addressText: event.target.value })} /></label><label className="wide">Horário de funcionamento<input value={form.openingHoursText} onChange={(event) => setForm({ ...form, openingHoursText: event.target.value })} placeholder="Segunda a domingo, 18h às 23h" /></label><label>Cor principal<div className="color-input"><input type="color" value={form.primaryColor} onChange={(event) => setForm({ ...form, primaryColor: event.target.value })} /><input value={form.primaryColor} onChange={(event) => setForm({ ...form, primaryColor: event.target.value })} /></div></label><label>Cor secundária<div className="color-input"><input type="color" value={form.secondaryColor} onChange={(event) => setForm({ ...form, secondaryColor: event.target.value })} /><input value={form.secondaryColor} onChange={(event) => setForm({ ...form, secondaryColor: event.target.value })} /></div></label></div>
        <div className="settings-images"><div><span>Logotipo</span>{form.logoUrl ? <img src={form.logoUrl} alt="Logotipo" /> : <div className="image-placeholder"><ImagePlus /></div>}<label className="button ghost file-button"><ImagePlus size={16} /> {processing === 'logoUrl' ? 'Processando…' : 'Alterar logo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void attach('logoUrl', event.target.files?.[0])} /></label>{form.logoUrl && <button type="button" className="text-danger" onClick={() => setForm({ ...form, logoUrl: null })}>Remover</button>}</div><div className="banner-setting"><span>Banner</span>{form.bannerUrl ? <img src={form.bannerUrl} alt="Banner" /> : <div className="image-placeholder"><ImagePlus /></div>}<label className="button ghost file-button"><ImagePlus size={16} /> {processing === 'bannerUrl' ? 'Processando…' : 'Alterar banner'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void attach('bannerUrl', event.target.files?.[0])} /></label>{form.bannerUrl && <button type="button" className="text-danger" onClick={() => setForm({ ...form, bannerUrl: null })}>Remover</button>}</div></div>
      </section>
      <section className="panel settings-card"><header><Clock3 /><div><h3>Operação e pedidos</h3><p>Prazos e regras usadas no cálculo do pedido.</p></div></header><div className="editor-grid"><label>Prazo mínimo (min)<input type="number" min="0" max="600" value={form.deliveryEstimateMin} onChange={(event) => setForm({ ...form, deliveryEstimateMin: Number(event.target.value) })} /></label><label>Prazo máximo (min)<input type="number" min="0" max="600" value={form.deliveryEstimateMax} onChange={(event) => setForm({ ...form, deliveryEstimateMax: Number(event.target.value) })} /></label><label>Pedido mínimo (R$)<input type="number" min="0" step="0.01" value={form.minimumOrder} onChange={(event) => setForm({ ...form, minimumOrder: Number(event.target.value) })} /></label><label>Preço de pizza meio a meio<select value={form.halfPizzaPricing} onChange={(event) => setForm({ ...form, halfPizzaPricing: event.target.value as RestaurantSettings['halfPizzaPricing'] })}><option value="HIGHEST">Maior sabor</option><option value="AVERAGE">Média dos sabores</option></select></label><label className="check-field wide"><input type="checkbox" checked={form.acceptScheduledOrders} onChange={(event) => setForm({ ...form, acceptScheduledOrders: event.target.checked })} /> Aceitar pedidos agendados</label></div><div className="public-menu-link"><span>Link do cardápio público</span><a href={`/r/${form.slug}`} target="_blank" rel="noreferrer">{window.location.origin}/r/{form.slug}</a></div></section>
    </div>
  </form>;
}
