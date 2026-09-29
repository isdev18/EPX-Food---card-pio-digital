CREATE TYPE "WhatsAppProviderType" AS ENUM ('QR_SESSION', 'META_CLOUD');
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM (
  'DISCONNECTED',
  'INITIALIZING',
  'QR_REQUIRED',
  'CONNECTING',
  'CONNECTED',
  'RECONNECTING',
  'AUTH_FAILURE',
  'DISCONNECTED_BY_USER',
  'ERROR'
);

ALTER TABLE "WhatsAppConnection"
  ADD COLUMN "provider" "WhatsAppProviderType" NOT NULL DEFAULT 'META_CLOUD',
  ADD COLUMN "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  ADD COLUMN "phoneNumber" TEXT,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "disconnectedAt" TIMESTAMP(3),
  ADD COLUMN "lastActivityAt" TIMESTAMP(3),
  ALTER COLUMN "phoneNumberId" DROP NOT NULL;

UPDATE "WhatsAppConnection"
SET
  "status" = CASE
    WHEN "accessTokenEncrypted" IS NOT NULL THEN 'CONNECTED'::"WhatsAppConnectionStatus"
    ELSE 'DISCONNECTED'::"WhatsAppConnectionStatus"
  END,
  "phoneNumber" = "displayPhone",
  "displayName" = "verifiedName";

CREATE UNIQUE INDEX "WhatsAppConnection_restaurantId_provider_key"
  ON "WhatsAppConnection"("restaurantId", "provider");
CREATE INDEX "WhatsAppConnection_restaurantId_status_idx"
  ON "WhatsAppConnection"("restaurantId", "status");
