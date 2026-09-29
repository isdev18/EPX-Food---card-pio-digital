import { MessageCircle } from 'lucide-react';
import { WhatsAppWebTest } from '../components/WhatsAppWebTest';

export function WhatsApp() {
  return <div className="whatsapp-page">
    <section className="whatsapp-hero">
      <div className="whatsapp-hero-icon"><MessageCircle /></div>
      <div>
        <span className="eyebrow">CONEXÃO POR QR CODE</span>
        <h2>WhatsApp</h2>
        <p>Envie o link do cardápio online e mantenha o cliente informado sobre o pedido.</p>
      </div>
    </section>
    <WhatsAppWebTest />
  </div>;
}
