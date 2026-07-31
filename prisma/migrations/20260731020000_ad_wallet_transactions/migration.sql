-- أمانة لدى الشركة (رصيد إعلانات العملاء) — منفصلة تمامًا عن حسابات
-- المصروفات المباشرة/صافي الربح/المحصَّل، ولا يقرأها أي كويري في reports.ts.

-- CreateEnum
CREATE TYPE "AdWalletTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'AD_WALLET_TRANSACTION';

-- CreateTable
CREATE TABLE "ad_wallet_transactions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "AdWalletTransactionType" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ad_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_wallet_transactions_clientId_idx" ON "ad_wallet_transactions"("clientId");

-- CreateIndex
CREATE INDEX "ad_wallet_transactions_occurredAt_idx" ON "ad_wallet_transactions"("occurredAt");

-- AddForeignKey
ALTER TABLE "ad_wallet_transactions" ADD CONSTRAINT "ad_wallet_transactions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_wallet_transactions" ADD CONSTRAINT "ad_wallet_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- منح صلاحية الوحدة الجديدة على قواعد بيانات مزروعة مسبقًا — seedRoles() في
-- prisma/seed.ts تتخطّى أي دور له صلاحيات مزروعة بالفعل، فلا تلتقط تحديث
-- DEFAULT_ROLE_PERMISSIONS تلقائيًا في قاعدة بيانات قائمة. يشمل هذا SUPER_ADMIN
-- نفسه: صلاحياته (كل الوحدات × كل الإجراءات) زُرعت قبل وجود ad_wallets أصلًا،
-- فلن يظهر أي شيء من هذا القسم له حتى في قاعدة بيانات كانت تعمل بالفعل.
INSERT INTO "role_permissions" ("id", "roleId", "module", "action", "scope")
SELECT gen_random_uuid()::text, r."id", 'ad_wallets', a.action, 'ALL'
FROM "roles" r,
  (VALUES
    ('view'), ('create'), ('edit'), ('delete'), ('restore'), ('purge'),
    ('assign'), ('approve'), ('export'), ('view_financial'), ('view_cost_profit'), ('manage')
  ) AS a(action)
WHERE r."key" = 'SUPER_ADMIN'
ON CONFLICT ("roleId", "module", "action") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "module", "action", "scope")
SELECT gen_random_uuid()::text, r."id", 'ad_wallets', a.action, 'ALL'
FROM "roles" r, (VALUES ('view'), ('create'), ('edit'), ('export')) AS a(action)
WHERE r."key" = 'FINANCE'
ON CONFLICT ("roleId", "module", "action") DO NOTHING;
