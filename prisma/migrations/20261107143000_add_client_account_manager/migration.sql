CREATE TABLE "ClientAccountManager" (
    "clientId" INTEGER NOT NULL,
    "accountManagerId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAccountManager_pkey" PRIMARY KEY ("clientId")
);

CREATE INDEX "ClientAccountManager_accountManagerId_idx"
    ON "ClientAccountManager"("accountManagerId");

ALTER TABLE "ClientAccountManager"
    ADD CONSTRAINT "ClientAccountManager_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientAccountManager"
    ADD CONSTRAINT "ClientAccountManager_accountManagerId_fkey"
    FOREIGN KEY ("accountManagerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
