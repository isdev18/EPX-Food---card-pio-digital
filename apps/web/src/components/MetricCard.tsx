import type { LucideIcon } from 'lucide-react';
export function MetricCard({ label, value, detail, icon: Icon, tone = 'green' }: { label: string; value: string; detail: string; icon: LucideIcon; tone?: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={20} /></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}
