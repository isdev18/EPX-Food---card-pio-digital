export type Status = 'NEW' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
export type Order = {
  id: string; number: number; customer: { name: string | null; phone: string }; total: number; subtotal: number; deliveryFee: number;
  status: Status; paymentMethod: 'PIX' | 'CARD' | 'CASH'; paymentStatus: string; createdAt: string; updatedAt?: string; estimatedAt?: string;
  address?: { street: string; number: string; neighborhood: string; city: string; reference?: string };
  items: { id: string; name: string; quantity: number; unitPrice: number; subtotal: number; configuration?: { size?: string; crust?: string; flavors?: string[]; extras?: string[] }; notes?: string }[];
};
export type Product = { id: string; name: string; description?: string | null; imageUrl?: string | null; basePrice: number; active: boolean; isPizza: boolean };
export type Category = { id: string; name: string; icon?: string | null; products: Product[] };
export type PizzaSize = { id: string; name: string; slices: number; maxFlavors: number; priceMultiplier: number; active: boolean };
export type Flavor = { id: string; name: string; description?: string | null; surcharge: number; active: boolean };

export type Coupon = {
  id: string; code: string; type: 'FIXED' | 'PERCENTAGE'; value: number; minimumOrder: number;
  expiresAt: string | null; maxUses: number | null; uses: number; active: boolean;
};

export type Promotion = {
  id: string; name: string; description: string | null; promotionalPrice: number | null;
  startsAt: string; endsAt: string | null; active: boolean;
  items: { id: string; productId: string; product: { id: string; name: string; imageUrl?: string | null } }[];
};

export type RestaurantSettings = {
  id: string; name: string; slug: string; phone: string | null; logoUrl: string | null; bannerUrl: string | null;
  pixKey: string | null; pixQrCodeUrl: string | null;
  primaryColor: string; secondaryColor: string; addressText: string; openingHoursText: string;
  deliveryEstimateMin: number; deliveryEstimateMax: number; minimumOrder: number;
  acceptScheduledOrders: boolean; halfPizzaPricing: 'HIGHEST' | 'AVERAGE';
};
export type DeliveryZone = { id: string; neighborhood: string; fee: number; estimatedMinutes: number; active: boolean };
