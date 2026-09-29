import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Edit3, Gift, Plus, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Category, Promotion } from '../types';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const dateInput = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
type Editor = { item?: Promotion; name: string; description: string; promotionalPrice: string; startsAt: string; endsAt: string; active: boolean; productIds: string[] };

export function Promotions() {
  const [items, setItems] = useState<Promotion[]>([]);
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const products = useMemo(() => catalog.flatMap((category) => category.products.filter((product) => product.active).map((product) => ({ ...product, category: category.name }))), [catalog]);

  useEffect(() => {
    Promise.all([api<Promotion[]>('/promotions'), api<Category[]>('/catalog')]).then(([promotions, categories]) => { setItems(promotions); setCatalog(categories); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as promoções.')).finally(() => setLoading(false));
  }, []);

  function createNew() {
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setEditor({ name: '', description: '', promotionalPrice: '', startsAt: now.toISOString().slice(0, 16), endsAt: '', active: true, productIds: [] });
  }

  function edit(item: Promotion) {
    setEditor({ item, name: item.name, description: item.description ?? '', promotionalPrice: item.promotionalPrice === null ? '' : String(item.promotionalPrice), startsAt: dateInput(item.startsAt), endsAt: dateInput(item.endsAt), active: item.active, productIds: item.items.map((entry) => entry.productId) });
  }

  function selectProduct(productId: string, selected: boolean) {
    if (!editor) return;
    setEditor({ ...editor, productIds: selected ? [...editor.productIds, productId] : editor.productIds.filter((id) => id !== productId) });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    if (!editor.productIds.length) return setError('Selecione ao menos um produto para a promoção.');
    const promotionalPrice = editor.promotionalPrice ? Number(editor.promotionalPrice.replace(',', '.')) : null;
    if (promotionalPrice !== null && (!Number.isFinite(promotionalPrice) || promotionalPrice <= 0)) return setError('Informe um preço promocional válido.');
    setSaving(true); setError('');
    try {
      const payload = { name: editor.name, description: editor.description || null, promotionalPrice, startsAt: new Date(editor.startsAt).toISOString(), endsAt: editor.endsAt ? new Date(editor.endsAt).toISOString() : null, active: editor.active, productIds: editor.productIds };
      const saved = editor.item
        ? await api<Promotion>(`/promotions/${editor.item.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await api<Promotion>('/promotions', { method: 'POST', body: JSON.stringify(payload) });
      setItems((current) => editor.item ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setEditor(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a promoção.'); }
    finally { setSaving(false); }
  }

  async function toggle(item: Promotion) {
    try {
      const saved = await api<Promotion>(`/promotions/${item.id}`, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) });
      setItems((current) => current.map((promotion) => promotion.id === saved.id ? saved : promotion));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível alterar a promoção.'); }
  }

  async function remove(item: Promotion) {
    if (!window.confirm(`Excluir a promoção “${item.name}”?`)) return;
    try { await api(`/promotions/${item.id}`, { method: 'DELETE' }); setItems((current) => current.filter((promotion) => promotion.id !== item.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir a promoção.'); }
  }

  if (loading) return <div className="panel">Carregando promoções…</div>;
  return <div className="module-page">
    <section className="module-hero"><span><Gift /></span><div><h2>Promoções</h2><p>Programe ofertas, escolha produtos e defina o preço promocional.</p></div><button className="button primary hero-action" onClick={createNew}><Plus size={17} /> Nova promoção</button></section>
    {error && <div className="form-error">{error}</div>}
    <div className="promotion-grid">{items.map((item) => <article className="panel promotion-card" key={item.id}><header><div><span className={`status-label ${item.active ? 'active' : ''}`}>{item.active ? 'Ativa' : 'Pausada'}</span><h3>{item.name}</h3></div><div className="row-actions"><button onClick={() => edit(item)} aria-label="Editar"><Edit3 /></button><button className="danger" onClick={() => void remove(item)} aria-label="Excluir"><Trash2 /></button></div></header><p>{item.description || 'Sem descrição.'}</p>{item.promotionalPrice !== null && <strong>{brl(item.promotionalPrice)}</strong>}<div className="promotion-products">{item.items.map((entry) => <span key={entry.id}>{entry.product.name}</span>)}</div><footer><small>{new Date(item.startsAt).toLocaleString('pt-BR')} {item.endsAt ? `até ${new Date(item.endsAt).toLocaleString('pt-BR')}` : '— sem término'}</small><label className="switch"><input type="checkbox" checked={item.active} onChange={() => void toggle(item)} /><i /></label></footer></article>)}{!items.length && <div className="panel empty-row">Nenhuma promoção cadastrada.</div>}</div>

    {editor && <div className="modal-layer"><button className="drawer-backdrop" onClick={() => setEditor(null)} aria-label="Fechar" /><form className="modal editor-modal promotion-modal" onSubmit={(event) => void save(event)}><header><div><span className="eyebrow">PROMOÇÃO</span><h2>{editor.item ? 'Editar promoção' : 'Nova promoção'}</h2></div><button type="button" className="icon-button" onClick={() => setEditor(null)}><X /></button></header><div className="editor-grid">
      <label className="wide">Nome<input required minLength={2} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label><label className="wide">Descrição<textarea maxLength={500} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label><label>Preço promocional (R$)<input inputMode="decimal" value={editor.promotionalPrice} onChange={(event) => setEditor({ ...editor, promotionalPrice: event.target.value })} placeholder="Opcional" /></label><label className="check-field"><input type="checkbox" checked={editor.active} onChange={(event) => setEditor({ ...editor, active: event.target.checked })} /> Promoção ativa</label><label>Início<input required type="datetime-local" value={editor.startsAt} onChange={(event) => setEditor({ ...editor, startsAt: event.target.value })} /></label><label>Término<input type="datetime-local" value={editor.endsAt} onChange={(event) => setEditor({ ...editor, endsAt: event.target.value })} /></label>
      <fieldset className="wide product-picker"><legend>Produtos da promoção</legend>{products.map((product) => <label key={product.id}><input type="checkbox" checked={editor.productIds.includes(product.id)} onChange={(event) => selectProduct(product.id, event.target.checked)} /><img src={product.imageUrl || '/pizza-hero.png'} alt="" /><span><b>{product.name}</b><small>{product.category}</small></span></label>)}{!products.length && <p>Cadastre produtos ativos no cardápio primeiro.</p>}</fieldset>
    </div><footer><button type="button" className="button ghost" onClick={() => setEditor(null)}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar promoção'}</button></footer></form></div>}
  </div>;
}
