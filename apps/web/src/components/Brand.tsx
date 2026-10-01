import { Pizza } from 'lucide-react';
export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}><span className="brand-mark"><Pizza size={22} strokeWidth={2.4} /></span>{!compact && <span><b>EPX Menu</b><small>Gestão inteligente</small></span>}</div>;
}
