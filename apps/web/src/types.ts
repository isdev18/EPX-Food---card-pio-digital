export type Status = 'NEW' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
export type Order = {
  id: string; number: number; customer: { name: string | null; phone: string }; total: number; subtotal: number; deliveryFee: number;
  status: Status; paymentMethod: 'PIX' | 'CARD' | 'CASH'; paymentStatus: string; createdAt: string; updatedAt?: string; estimatedAt?: string;
  address?: { street: string; number: string; neighborhood: string; city: string; reference?: string };
  items: { id: string; name: string; quantity: number; unitPrice: number; subtotal: number; configuration?: { size?: string; crust?: string; flavors?: string[]; extras?: string[] }; notes?: string }[];
};
export type Product = { id: string; name: string; description?: string | null; imageUrl?: string | null; basePrice: number; active: boolean; isPizza: boolean };
export type Category = { id: string; name: string; icon?: string | null; products: Product[] };
export type DeliveryZone = { id: string; neighborhood: string; fee: number; estimatedMinutes: number; active: boolean };
