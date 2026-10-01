ALTER TABLE "Customer"
  ADD COLUMN "asaasCustomerId" TEXT;

CREATE UNIQUE INDEX "Customer_asaasCustomerId_key"
  ON "Customer"("asaasCustomerId");

CREATE UNIQUE INDEX "Payment_provider_providerId_key"
  ON "Payment"("provider", "providerId");

CREATE TABLE "AsaasWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "paymentId" TEXT,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AsaasWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AsaasWebhookEvent_paymentId_processedAt_idx"
  ON "AsaasWebhookEvent"("paymentId", "processedAt");
