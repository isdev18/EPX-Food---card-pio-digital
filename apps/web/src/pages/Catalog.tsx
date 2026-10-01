import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Edit3, ExternalLink, ImagePlus, Plus, Search, Settings2, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { imageFileToDataUrl } from '../lib/image';
import type { Category, Flavor, PizzaSize, Product } from '../types';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
type ProductEditor = { product?: Product; categoryId: string; name: string; description: string; basePrice: string; imageUrl: string | null; isPizza: boolean };
type PizzaOptions = { sizes: PizzaSize[]; flavors: Flavor[] };
type SizeDraft = { id?: string; name: string; slices: string; maxFlavors: string; priceMultiplier: string };
type FlavorDraft = { id?: string; name: string; description: string; surcharge: string };
const emptySize = (): SizeDraft => ({ name: '', slices: '8', maxFlavors: '2', priceMultiplier: '1' });
const emptyFlavor = (): FlavorDraft => ({ name: '', description: '', surcharge: '0' });

export function Catalog() {
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [menuSlug, setMenuSlug] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [processingImage, setProcessingImage] = useState(false);
  const [editor, setEditor] = useState<ProductEditor | null>(null);
  const [pizzaOptions, setPizzaOptions] = useState<PizzaOptions>({ sizes: [], flavors: [] });
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sizeDraft, setSizeDraft] = useState<SizeDraft>(emptySize);
  const [flavorDraft, setFlavorDraft] = useState<FlavorDraft>(emptyFlavor);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([api<Category[]>('/catalog'), api<PizzaOptions>('/catalog/pizza-options'), api<{ slug: string }>('/settings')]).then(([result, options, settings]) => { if (active) { setCatalog(result); setPizzaOptions(options); setMenuSlug(settings.slug); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o cardápio.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const products = useMemo(() => catalog
    .flatMap((category) => category.products.map((product) => ({ ...product, category: category.name, categoryId: category.id })))
    .filter((product) => (activeCategory === 'all' || product.categoryId === activeCategory)
      && (!onlyAvailable || product.active)
      && product.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))),
  [catalog, activeCategory, search, onlyAvailable]);

  function replaceProduct(updated: Product) {
    setCatalog((current) => current.map((category) => ({ ...category, products: category.products.map((product) => product.id === updated.id ? updated : product) })));
  }

  async function refreshPizzaOptions() {
    setPizzaOptions(await api<PizzaOptions>('/catalog/pizza-options'));
  }

  async function toggle(product: Product) {
    setSaving(product.id); setError('');
    try { replaceProduct(await api<Product>(`/catalog/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ active: !product.active }) })); await refreshPizzaOptions(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível alterar a disponibilidade.'); }
    finally { setSaving(''); }
  }

  function openNewProduct() {
    const category = activeCategory === 'all' ? catalog[0] : catalog.find((item) => item.id === activeCategory);
    if (!category) return setError('Cadastre uma categoria antes de adicionar produtos.');
    setEditor({ categoryId: category.id, name: '', description: '', basePrice: '', imageUrl: null, isPizza: category.name.toLocaleLowerCase('pt-BR').includes('pizza') });
  }

  function openEditProduct(product: Product & { categoryId: string }) {
    setEditor({ product, categoryId: product.categoryId, name: product.name, description: product.description ?? '', basePrice: product.basePrice.toFixed(2), imageUrl: product.imageUrl ?? null, isPizza: product.isPizza });
  }

  async function selectImage(file?: File) {
    if (!file || !editor) return;
    setProcessingImage(true); setError('');
    try { setEditor({ ...editor, imageUrl: await imageFileToDataUrl(file) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível anexar a foto.'); }
    finally { setProcessingImage(false); }
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const basePrice = Number(editor.basePrice.replace(',', '.'));
    if (!Number.isFinite(basePrice) || basePrice <= 0) return setError('Informe um preço válido.');
    setSaving(editor.product?.id ?? 'new'); setError('');
    try {
      const payload = { name: editor.name, description: editor.description, imageUrl: editor.imageUrl, basePrice };
      if (editor.product) {
        replaceProduct(await api<Product>(`/catalog/products/${editor.product.id}`, { method: 'PATCH', body: JSON.stringify(payload) }));
      } else {
        const product = await api<Product>('/catalog/products', { method: 'POST', body: JSON.stringify({ ...payload, categoryId: editor.categoryId, isPizza: editor.isPizza }) });
        setCatalog((current) => current.map((category) => category.id === editor.categoryId ? { ...category, products: [...category.products, product] } : category));
      }
      await refreshPizzaOptions();
      setEditor(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o produto.'); }
    finally { setSaving(''); }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Excluir “${product.name}” do cardápio? Os pedidos antigos serão preservados.`)) return;
    setSaving(product.id); setError('');
    try {
      await api<{ ok: boolean }>(`/catalog/products/${product.id}`, { method: 'DELETE' });
      setCatalog((current) => current.map((category) => ({ ...category, products: category.products.filter((item) => item.id !== product.id) })));
      await refreshPizzaOptions();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o produto.'); }
    finally { setSaving(''); }
  }

  async function saveSize(event: FormEvent) {
    event.preventDefault();
    const payload = { name: sizeDraft.name, slices: Number(sizeDraft.slices), maxFlavors: Number(sizeDraft.maxFlavors), priceMultiplier: Number(sizeDraft.priceMultiplier.replace(',', '.')) };
    if (!payload.name.trim() || !Number.isInteger(payload.slices) || !Number.isInteger(payload.maxFlavors) || !Number.isFinite(payload.priceMultiplier)) return setError('Preencha os dados do tamanho corretamente.');
    setSaving(sizeDraft.id ?? 'new-size'); setError('');
    try {
      const saved = await api<PizzaSize>(sizeDraft.id ? `/catalog/sizes/${sizeDraft.id}` : '/catalog/sizes', { method: sizeDraft.id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setPizzaOptions((current) => ({ ...current, sizes: sizeDraft.id ? current.sizes.map((item) => item.id === saved.id ? saved : item) : [...current.sizes, saved] }));
      setSizeDraft(emptySize());
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o tamanho.'); }
    finally { setSaving(''); }
  }

  async function saveFlavor(event: FormEvent) {
    event.preventDefault();
    const payload = { name: flavorDraft.name, description: flavorDraft.description, surcharge: Number(flavorDraft.surcharge.replace(',', '.')) };
    if (!payload.name.trim() || !Number.isFinite(payload.surcharge)) return setError('Preencha os dados do sabor corretamente.');
    setSaving(flavorDraft.id ?? 'new-flavor'); setError('');
    try {
      const saved = await api<Flavor>(flavorDraft.id ? `/catalog/flavors/${flavorDraft.id}` : '/catalog/flavors', { method: flavorDraft.id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setPizzaOptions((current) => ({ ...current, flavors: flavorDraft.id ? current.flavors.map((item) => item.id === saved.id ? saved : item) : [...current.flavors, saved] }));
      setFlavorDraft(emptyFlavor());
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o sabor.'); }
    finally { setSaving(''); }
  }

  async function toggleOption(kind: 'sizes' | 'flavors', item: PizzaSize | Flavor) {
    setSaving(item.id); setError('');
    try {
      const saved = await api<PizzaSize | Flavor>(`/catalog/${kind}/${item.id}`, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) });
      setPizzaOptions((current) => ({ ...current, [kind]: current[kind].map((entry) => entry.id === saved.id ? saved : entry) } as PizzaOptions));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível alterar a disponibilidade.'); }
    finally { setSaving(''); }
  }

  async function removeOption(kind: 'sizes' | 'flavors', item: PizzaSize | Flavor) {
    if (!window.confirm(`Excluir “${item.name}”?`)) return;
    setSaving(item.id); setError('');
    try {
      await api<{ ok: boolean }>(`/catalog/${kind}/${item.id}`, { method: 'DELETE' });
      setPizzaOptions((current) => ({ ...current, [kind]: current[kind].filter((entry) => entry.id !== item.id) } as PizzaOptions));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir este item.'); }
    finally { setSaving(''); }
  }

  if (loading) return <div className="page-stack"><div className="panel">Carregando cardápio…</div></div>;
  return <div className="page-stack">
    {error && <div className="form-error">{error}</div>}
    <div className="catalog-summary"><div><b>{products.length}</b><span>produtos cadastrados</span></div><div><b>{products.filter((product) => product.active).length}</b><span>disponíveis agora</span></div><div><b>{catalog.length}</b><span>categorias ativas</span></div></div>
    <div className="page-toolbar">
      <label className="page-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto" /></label>
      <div><a className="button ghost" href={`/r/${menuSlug}`} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Visualizar cardápio</a><button className="button ghost" onClick={() => setOptionsOpen(true)}><Settings2 size={16} /> Tamanhos e sabores</button><button className={`button ghost ${onlyAvailable ? 'filter-active' : ''}`} onClick={() => setOnlyAvailable(!onlyAvailable)}><SlidersHorizontal size={16} /> {onlyAvailable ? 'Só disponíveis' : 'Todos os itens'}</button><button className="button primary" onClick={openNewProduct}><Plus size={17} /> Novo produto</button></div>
    </div>
    <div className="category-tabs"><button className={activeCategory === 'all' ? 'active' : ''} onClick={() => setActiveCategory('all')}>Todos</button>{catalog.map((category) => <button className={activeCategory === category.id ? 'active' : ''} key={category.id} onClick={() => setActiveCategory(category.id)}>{category.icon} {category.name}</button>)}</div>
    <div className="product-grid">{products.map((product) => <article className="product-card" key={product.id}>
      <img src={product.imageUrl || '/pizza-hero.png'} alt={product.name} />
      <div className="product-card-body"><span className="product-category">{product.category}</span><h3>{product.name}</h3><p>{product.description}</p><strong>A partir de {brl(product.basePrice)}</strong><div className="product-card-actions"><label className="switch"><input checked={product.active} disabled={saving === product.id} onChange={() => void toggle(product)} type="checkbox" /><i /><span>{product.active ? 'Disponível' : 'Indisponível'}</span></label><button disabled={saving === product.id} aria-label={`Editar ${product.name}`} onClick={() => openEditProduct(product)}><Edit3 size={16} /></button><button className="danger" disabled={saving === product.id} aria-label={`Excluir ${product.name}`} onClick={() => void deleteProduct(product)}><Trash2 size={16} /></button></div></div>
    </article>)}</div>

    {editor && <div className="modal-layer"><button className="drawer-backdrop" aria-label="Fechar" onClick={() => setEditor(null)} /><form className="modal editor-modal" onSubmit={(event) => void saveProduct(event)}>
      <header><div><span className="eyebrow">PRODUTO</span><h2>{editor.product ? 'Editar produto' : 'Novo produto'}</h2></div><button type="button" className="icon-button" onClick={() => setEditor(null)}><X size={18} /></button></header>
      <div className="editor-grid"><label className="wide">Nome<input required minLength={2} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label><label className="wide">Descrição<textarea maxLength={500} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label><label>Preço (R$)<input required inputMode="decimal" value={editor.basePrice} onChange={(event) => setEditor({ ...editor, basePrice: event.target.value })} /></label><label>Categoria<select value={editor.categoryId} disabled={Boolean(editor.product)} onChange={(event) => setEditor({ ...editor, categoryId: event.target.value })}>{catalog.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <div className="wide image-field"><span>Foto do produto</span><div>{editor.imageUrl ? <img src={editor.imageUrl} alt="Prévia" /> : <div className="image-placeholder"><ImagePlus /></div>}<div><label className="button ghost file-button"><ImagePlus size={16} /> {processingImage ? 'Processando…' : 'Anexar foto'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={processingImage} onChange={(event) => void selectImage(event.target.files?.[0])} /></label>{editor.imageUrl && <button type="button" className="text-danger" onClick={() => setEditor({ ...editor, imageUrl: null })}>Remover foto</button>}<small>PNG, JPG ou WebP. A imagem será comprimida automaticamente.</small></div></div></div>
      </div>
      <footer><button type="button" className="button ghost" onClick={() => setEditor(null)}>Cancelar</button><button className="button primary" disabled={Boolean(saving) || processingImage}>{saving ? 'Salvando…' : 'Salvar produto'}</button></footer>
    </form></div>}
    {optionsOpen && <div className="modal-layer"><button className="drawer-backdrop" aria-label="Fechar" onClick={() => setOptionsOpen(false)} /><section className="modal pizza-options-modal">
      <header><div><span className="eyebrow">PIZZAS</span><h2>Tamanhos e sabores</h2><p>Configure as opções que o cliente verá ao montar a pizza.</p></div><button type="button" className="icon-button" onClick={() => setOptionsOpen(false)}><X size={18} /></button></header>
      {error && <div className="form-error">{error}</div>}
      <div className="pizza-options-grid">
        <section><div className="option-manager-title"><div><h3>Tamanhos</h3><small>Pequena, média, grande, família e outros.</small></div></div>
          <form className="compact-option-form" onSubmit={(event) => void saveSize(event)}><label>Nome<input required value={sizeDraft.name} onChange={(event) => setSizeDraft({ ...sizeDraft, name: event.target.value })} placeholder="Ex.: Família" /></label><label>Fatias<input required type="number" min="1" max="40" value={sizeDraft.slices} onChange={(event) => setSizeDraft({ ...sizeDraft, slices: event.target.value })} /></label><label>Máx. sabores<input required type="number" min="1" max="4" value={sizeDraft.maxFlavors} onChange={(event) => setSizeDraft({ ...sizeDraft, maxFlavors: event.target.value })} /></label><label>Multiplicador<input required inputMode="decimal" value={sizeDraft.priceMultiplier} onChange={(event) => setSizeDraft({ ...sizeDraft, priceMultiplier: event.target.value })} /></label><div><button type="submit" className="button primary" disabled={Boolean(saving)}>{sizeDraft.id ? 'Atualizar' : 'Adicionar'}</button>{sizeDraft.id && <button type="button" className="button ghost" onClick={() => setSizeDraft(emptySize())}>Cancelar</button>}</div></form>
          <div className="option-manager-list">{pizzaOptions.sizes.map((item) => <article key={item.id} className={!item.active ? 'inactive' : ''}><div><b>{item.name}</b><small>{item.slices} fatias · até {item.maxFlavors} {item.maxFlavors === 1 ? 'sabor' : 'sabores'} · {item.priceMultiplier}× o preço</small></div><label className="switch"><input checked={item.active} disabled={saving === item.id} onChange={() => void toggleOption('sizes', item)} type="checkbox" /><i /></label><button onClick={() => setSizeDraft({ id: item.id, name: item.name, slices: String(item.slices), maxFlavors: String(item.maxFlavors), priceMultiplier: String(item.priceMultiplier) })} aria-label={`Editar ${item.name}`}><Edit3 size={15} /></button><button className="danger" onClick={() => void removeOption('sizes', item)} aria-label={`Excluir ${item.name}`}><Trash2 size={15} /></button></article>)}</div>
        </section>
        <section><div className="option-manager-title"><div><h3>Sabores</h3><small>Opções exibidas ao cliente no cardápio.</small></div></div>
          <form className="compact-option-form flavor-form" onSubmit={(event) => void saveFlavor(event)}><label>Nome<input required value={flavorDraft.name} onChange={(event) => setFlavorDraft({ ...flavorDraft, name: event.target.value })} placeholder="Ex.: Calabresa" /></label><label>Descrição<input value={flavorDraft.description} onChange={(event) => setFlavorDraft({ ...flavorDraft, description: event.target.value })} placeholder="Ingredientes do sabor" /></label><label>Acréscimo (R$)<input required inputMode="decimal" value={flavorDraft.surcharge} onChange={(event) => setFlavorDraft({ ...flavorDraft, surcharge: event.target.value })} /></label><div><button type="submit" className="button primary" disabled={Boolean(saving)}>{flavorDraft.id ? 'Atualizar' : 'Adicionar'}</button>{flavorDraft.id && <button type="button" className="button ghost" onClick={() => setFlavorDraft(emptyFlavor())}>Cancelar</button>}</div></form>
          <div className="option-manager-list">{pizzaOptions.flavors.map((item) => <article key={item.id} className={!item.active ? 'inactive' : ''}><div><b>{item.name}</b><small>{item.description || 'Sem descrição'}{item.surcharge > 0 ? ` · + ${brl(item.surcharge)}` : ' · sem acréscimo'}</small></div><label className="switch"><input checked={item.active} disabled={saving === item.id} onChange={() => void toggleOption('flavors', item)} type="checkbox" /><i /></label><button onClick={() => setFlavorDraft({ id: item.id, name: item.name, description: item.description ?? '', surcharge: String(item.surcharge) })} aria-label={`Editar ${item.name}`}><Edit3 size={15} /></button><button className="danger" onClick={() => void removeOption('flavors', item)} aria-label={`Excluir ${item.name}`}><Trash2 size={15} /></button></article>)}</div>
        </section>
      </div>
    </section></div>}
  </div>;
}
