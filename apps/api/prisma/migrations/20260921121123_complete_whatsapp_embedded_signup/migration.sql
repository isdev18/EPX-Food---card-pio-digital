-- AlterTable
ALTER TABLE "WhatsAppConnection" ADD COLUMN     "businessPortfolioId" TEXT,
ADD COLUMN     "connectedAt" TIMESTAMP(3),
ADD COLUMN     "qualityRating" TEXT,
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "verifiedName" TEXT;
