import { useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Category, Product } from '../types';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export function Catalog() {
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api<Category[]>('/catalog').then((result) => {
      if (active) setCatalog(result);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o cardápio.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const products = useMemo(() => catalog
    .flatMap((category) => category.products.map((product) => ({ ...product, category: category.name, categoryId: category.id })))
    .filter((product) => (activeCategory === 'all' || product.categoryId === activeCategory)
      && (!onlyAvailable || product.active)
      && product.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))),
  [catalog, activeCategory, search, onlyAvailable]);

  function replaceProduct(updated: Product) {
    setCatalog((current) => current.map((category) => ({
      ...category,
      products: category.products.map((product) => product.id === updated.id ? updated : product),
    })));
  }

  async function toggle(product: Product) {
    setSaving(product.id);
    setError('');
    try {
      replaceProduct(await api<Product>(`/catalog/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !product.active }),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível alterar a disponibilidade.');
    } finally {
      setSaving('');
    }
  }

  async function addProduct() {
    const category = activeCategory === 'all' ? catalog[0] : catalog.find((item) => item.id === activeCategory);
    if (!category) return setError('Cadastre uma categoria antes de adicionar produtos.');
    const name = prompt('Nome do novo produto:')?.trim();
    if (!name) return;
    const description = prompt('Descrição do produto:', 'Novo produto do cardápio')?.trim();
    if (description === undefined) return;
    const rawPrice = prompt('Preço inicial (ex.: 49,90):')?.replace(',', '.');
    const basePrice = Number(rawPrice);
    if (!Number.isFinite(basePrice) || basePrice <= 0) return alert('Informe um preço válido.');
    setSaving('new');
    setError('');
    try {
      const product = await api<Product>('/catalog/products', {
        method: 'POST',
        body: JSON.stringify({ categoryId: category.id, name, description, basePrice, isPizza: category.name.toLocaleLowerCase('pt-BR').includes('pizza') }),
      });
      setCatalog((current) => current.map((item) => item.id === category.id ? { ...item, products: [...item.products, product] } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar o produto.');
    } finally {
      setSaving('');
    }
  }

  async function editProduct(product: Product) {
    const name = prompt('Nome do produto:', product.name)?.trim();
    if (!name) return;
    const description = prompt('Descrição:', product.description ?? '')?.trim();
    if (description === undefined) return;
    const rawPrice = prompt('Preço:', product.basePrice.toFixed(2).replace('.', ','))?.replace(',', '.');
    const basePrice = Number(rawPrice);
    if (!Number.isFinite(basePrice) || basePrice <= 0) return alert('Informe um preço válido.');
    setSaving(product.id);
    setError('');
    try {
      replaceProduct(await api<Product>(`/catalog/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, description, basePrice }),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível editar o produto.');
    } finally {
      setSaving('');
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Excluir “${product.name}” do cardápio? Os pedidos antigos serão preservados.`)) return;
    setSaving(product.id);
    setError('');
    try {
      await api<{ ok: boolean }>(`/catalog/products/${product.id}`, { method: 'DELETE' });
      setCatalog((current) => current.map((category) => ({ ...category, products: category.products.filter((item) => item.id !== product.id) })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o produto.');
    } finally {
      setSaving('');
    }
  }

  if (loading) return <div className="page-stack"><div className="panel">Carregando cardápio…</div></div>;
  return <div className="page-stack">
    {error && <div className="form-error">{error}</div>}
    <div className="catalog-summary">
      <div><b>{products.length}</b><span>produtos cadastrados</span></div>
      <div><b>{products.filter((product) => product.active).length}</b><span>disponíveis agora</span></div>
      <div><b>{catalog.length}</b><span>categorias ativas</span></div>
    </div>
    <div className="page-toolbar">
      <label className="page-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto" /></label>
      <div>
        <button className={`button ghost ${onlyAvailable ? 'filter-active' : ''}`} onClick={() => setOnlyAvailable(!onlyAvailable)}><SlidersHorizontal size={16} /> {onlyAvailable ? 'Só disponíveis' : 'Todos os itens'}</button>
        <button className="button primary" onClick={() => void addProduct()} disabled={saving === 'new'}><Plus size={17} /> {saving === 'new' ? 'Salvando…' : 'Novo produto'}</button>
      </div>
    </div>
    <div className="category-tabs">
      <button className={activeCategory === 'all' ? 'active' : ''} onClick={() => setActiveCategory('all')}>Todos</button>
      {catalog.map((category) => <button className={activeCategory === category.id ? 'active' : ''} key={category.id} onClick={() => setActiveCategory(category.id)}>{category.icon} {category.name}</button>)}
    </div>
    <div className="product-grid">{products.map((product) => <article className="product-card" key={product.id}>
      <img src={product.imageUrl || '/pizza-hero.png'} alt={product.name} />
      <div className="product-card-body">
        <span className="product-category">{product.category}</span><h3>{product.name}</h3><p>{product.description}</p><strong>A partir de {brl(product.basePrice)}</strong>
        <div className="product-card-actions"><label className="switch"><input checked={product.active} disabled={saving === product.id} onChange={() => void toggle(product)} type="checkbox" /><i /><span>{product.active ? 'Disponível' : 'Indisponível'}</span></label><button disabled={saving === product.id} aria-label={`Editar ${product.name}`} onClick={() => void editProduct(product)}><Edit3 size={16} /></button><button className="danger" disabled={saving === product.id} aria-label={`Excluir ${product.name}`} onClick={() => void deleteProduct(product)}><Trash2 size={16} /></button></div>
      </div>
    </article>)}</div>
  </div>;
}
