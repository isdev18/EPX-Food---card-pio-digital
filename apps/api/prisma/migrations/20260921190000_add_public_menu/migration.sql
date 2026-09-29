ALTER TABLE "Restaurant"
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "bannerUrl" TEXT,
  ADD COLUMN "primaryColor" TEXT NOT NULL DEFAULT '#E94F37',
  ADD COLUMN "secondaryColor" TEXT NOT NULL DEFAULT '#17352D',
  ADD COLUMN "address" JSONB,
  ADD COLUMN "openingHours" JSONB,
  ADD COLUMN "deliveryEstimateMin" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "deliveryEstimateMax" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "minimumOrder" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "acceptScheduledOrders" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "halfPizzaPricing" TEXT NOT NULL DEFAULT 'HIGHEST';

ALTER TABLE "Cart" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "Cart"
  ADD COLUMN "menuSessionId" TEXT,
  ADD COLUMN "couponCode" TEXT,
  ADD COLUMN "cartAbandonedAt" TIMESTAMP(3),
  ADD COLUMN "checkedOutAt" TIMESTAMP(3);

ALTER TABLE "Order"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "trackingTokenHash" TEXT,
  ADD COLUMN "menuSessionId" TEXT,
  ADD COLUMN "conversationId" TEXT;

CREATE TABLE "MenuSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "customerId" TEXT,
  "conversationId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MenuSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsEvent" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "menuSessionId" TEXT,
  "name" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuSession_tokenHash_key" ON "MenuSession"("tokenHash");
CREATE INDEX "MenuSession_restaurantId_expiresAt_idx" ON "MenuSession"("restaurantId", "expiresAt");
CREATE INDEX "AnalyticsEvent_restaurantId_name_createdAt_idx" ON "AnalyticsEvent"("restaurantId", "name", "createdAt");
CREATE UNIQUE INDEX "Cart_menuSessionId_key" ON "Cart"("menuSessionId");
CREATE UNIQUE INDEX "Order_trackingTokenHash_key" ON "Order"("trackingTokenHash");
CREATE UNIQUE INDEX "Order_menuSessionId_key" ON "Order"("menuSessionId");
CREATE UNIQUE INDEX "Order_restaurantId_idempotencyKey_key" ON "Order"("restaurantId", "idempotencyKey");

ALTER TABLE "MenuSession" ADD CONSTRAINT "MenuSession_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuSession" ADD CONSTRAINT "MenuSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MenuSession" ADD CONSTRAINT "MenuSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_menuSessionId_fkey" FOREIGN KEY ("menuSessionId") REFERENCES "MenuSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_menuSessionId_fkey" FOREIGN KEY ("menuSessionId") REFERENCES "MenuSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
