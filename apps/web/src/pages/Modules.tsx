import type { LucideIcon } from 'lucide-react';
import { BarChart3, Check, Gift, MapPin, MessageCircle, Settings, Tag } from 'lucide-react';

const content: Record<string, { icon: LucideIcon; title: string; copy: string; stats: [string,string][] }> = {
  cupons: { icon: Tag, title: 'Cupons ativos', copy: 'Validação de valor mínimo, vigência e limite de usos.', stats: [['PIZZA10','10% de desconto'],['BEMVINDO','R$ 8 de desconto'],['FAMILIA15','15% no combo']] },
  promocoes: { icon: Gift, title: 'Promoções programadas', copy: 'Combos por dia e horário, sempre com preço validado no servidor.', stats: [['Combo Família','R$ 79,90'],['Terça em Dobro','18h — 22h'],['Marguerita especial','R$ 42,90']] },
  relatorios: { icon: BarChart3, title: 'Relatórios da operação', copy: 'Indicadores consolidados por período para apoiar decisões.', stats: [['Faturamento mensal','R$ 48.920'],['Pedidos no mês','624'],['Ticket médio','R$ 78,40']] },
  whatsapp: { icon: MessageCircle, title: 'WhatsApp Cloud API', copy: 'Arquitetura pronta para a integração oficial da Meta e webhooks idempotentes.', stats: [['Webhook','Configurado'],['Modo do bot','Ativo'],['Conversas hoje','34']] },
  configuracoes: { icon: Settings, title: 'Configurações da loja', copy: 'Preferências gerais da operação do restaurante.', stats: [['Cadastro','Configure sua operação'],['Segurança','Dados isolados'],['Atendimento','Personalize seus canais']] },
};
export function ModulePage({ type }: { type: keyof typeof content }) { const item = content[type]; const Icon = item.icon; return <div className="module-page"><section className="module-hero"><span><Icon /></span><div><h2>{item.title}</h2><p>{item.copy}</p></div></section><div className="module-cards">{item.stats.map(([label,value]) => <article key={label}><Check /><span>{label}</span><b>{value}</b></article>)}</div><section className="panel module-info"><MapPin /><div><h3>Configuração segura e multiempresa</h3><p>Todos os registros incluem o identificador da pizzaria e são filtrados na camada de serviço. Valores comerciais nunca são aceitos do WhatsApp ou do frontend sem nova validação.</p></div></section></div>; }
