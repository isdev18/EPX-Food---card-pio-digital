import { useEffect, useState, type FormEvent } from 'react';
import { Edit3, Plus, Tag, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Coupon } from '../types';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
type Editor = { item?: Coupon; code: string; type: Coupon['type']; value: string; minimumOrder: string; expiresAt: string; maxUses: string; active: boolean };
const emptyEditor = (): Editor => ({ code: '', type: 'PERCENTAGE', value: '', minimumOrder: '0', expiresAt: '', maxUses: '', active: true });

export function Coupons() {
  const [items, setItems] = useState<Coupon[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void api<Coupon[]>('/coupons').then(setItems).catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os cupons.')).finally(() => setLoading(false));
  }, []);

  function edit(item: Coupon) {
    setEditor({ item, code: item.code, type: item.type, value: String(item.value), minimumOrder: String(item.minimumOrder), expiresAt: item.expiresAt?.slice(0, 10) ?? '', maxUses: item.maxUses === null ? '' : String(item.maxUses), active: item.active });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const value = Number(editor.value.replace(',', '.'));
    const minimumOrder = Number(editor.minimumOrder.replace(',', '.'));
    const maxUses = editor.maxUses ? Number(editor.maxUses) : null;
    if (!Number.isFinite(value) || value <= 0 || (editor.type === 'PERCENTAGE' && value > 100)) return setError('Informe um desconto válido.');
    if (!Number.isFinite(minimumOrder) || minimumOrder < 0) return setError('Informe um pedido mínimo válido.');
    setSaving(true); setError('');
    try {
      const payload = { code: editor.code, type: editor.type, value, minimumOrder, maxUses, active: editor.active, expiresAt: editor.expiresAt ? new Date(`${editor.expiresAt}T23:59:59`).toISOString() : null };
      const saved = editor.item
        ? await api<Coupon>(`/coupons/${editor.item.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await api<Coupon>('/coupons', { method: 'POST', body: JSON.stringify(payload) });
      setItems((current) => editor.item ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved].sort((a, b) => a.code.localeCompare(b.code)));
      setEditor(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o cupom.'); }
    finally { setSaving(false); }
  }

  async function toggle(item: Coupon) {
    try {
      const saved = await api<Coupon>(`/coupons/${item.id}`, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) });
      setItems((current) => current.map((coupon) => coupon.id === saved.id ? saved : coupon));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível alterar o cupom.'); }
  }

  async function remove(item: Coupon) {
    if (!window.confirm(`Excluir o cupom ${item.code}?`)) return;
    try { await api(`/coupons/${item.id}`, { method: 'DELETE' }); setItems((current) => current.filter((coupon) => coupon.id !== item.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o cupom.'); }
  }

  if (loading) return <div className="panel">Carregando cupons…</div>;
  return <div className="module-page">
    <section className="module-hero"><span><Tag /></span><div><h2>Cupons de desconto</h2><p>Crie códigos, limites de uso, validade e valor mínimo para o pedido.</p></div><button className="button primary hero-action" onClick={() => setEditor(emptyEditor())}><Plus size={17} /> Novo cupom</button></section>
    {error && <div className="form-error">{error}</div>}
    <section className="table-panel management-table"><table><thead><tr><th>Código</th><th>Desconto</th><th>Pedido mínimo</th><th>Uso</th><th>Validade</th><th>Status</th><th /></tr></thead><tbody>
      {items.map((item) => <tr key={item.id}><td><strong className="code-pill">{item.code}</strong></td><td>{item.type === 'PERCENTAGE' ? `${item.value}%` : brl(item.value)}</td><td>{brl(item.minimumOrder)}</td><td>{item.uses}{item.maxUses === null ? '' : ` / ${item.maxUses}`}</td><td>{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString('pt-BR') : 'Sem validade'}</td><td><label className="switch"><input type="checkbox" checked={item.active} onChange={() => void toggle(item)} /><i /><span>{item.active ? 'Ativo' : 'Pausado'}</span></label></td><td><div className="row-actions"><button onClick={() => edit(item)} aria-label="Editar"><Edit3 /></button><button className="danger" onClick={() => void remove(item)} aria-label="Excluir"><Trash2 /></button></div></td></tr>)}
      {!items.length && <tr><td colSpan={7} className="empty-row">Nenhum cupom cadastrado.</td></tr>}
    </tbody></table></section>

    {editor && <div className="modal-layer"><button className="drawer-backdrop" onClick={() => setEditor(null)} aria-label="Fechar" /><form className="modal editor-modal" onSubmit={(event) => void save(event)}><header><div><span className="eyebrow">CUPOM</span><h2>{editor.item ? 'Editar cupom' : 'Novo cupom'}</h2></div><button type="button" className="icon-button" onClick={() => setEditor(null)}><X /></button></header><div className="editor-grid">
      <label className="wide">Código<input required minLength={2} maxLength={30} value={editor.code} onChange={(event) => setEditor({ ...editor, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} placeholder="EX.: PIZZA10" /></label>
      <label>Tipo<select value={editor.type} onChange={(event) => setEditor({ ...editor, type: event.target.value as Coupon['type'] })}><option value="PERCENTAGE">Percentual</option><option value="FIXED">Valor fixo</option></select></label>
      <label>{editor.type === 'PERCENTAGE' ? 'Percentual (%)' : 'Valor (R$)'}<input required inputMode="decimal" value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value })} /></label>
      <label>Pedido mínimo (R$)<input required inputMode="decimal" value={editor.minimumOrder} onChange={(event) => setEditor({ ...editor, minimumOrder: event.target.value })} /></label>
      <label>Limite de usos<input type="number" min="1" value={editor.maxUses} onChange={(event) => setEditor({ ...editor, maxUses: event.target.value })} placeholder="Sem limite" /></label>
      <label>Validade<input type="date" value={editor.expiresAt} onChange={(event) => setEditor({ ...editor, expiresAt: event.target.value })} /></label>
      <label className="check-field"><input type="checkbox" checked={editor.active} onChange={(event) => setEditor({ ...editor, active: event.target.checked })} /> Cupom ativo</label>
    </div><footer><button type="button" className="button ghost" onClick={() => setEditor(null)}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar cupom'}</button></footer></form></div>}
  </div>;
}
