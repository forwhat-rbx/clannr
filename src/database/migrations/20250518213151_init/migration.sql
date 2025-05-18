-- CreateTable
CREATE TABLE "UserLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordId" TEXT NOT NULL,
    "robloxId" TEXT NOT NULL,
    "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RoleBind" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "robloxRankId" INTEGER NOT NULL,
    "robloxRankName" TEXT
);

-- CreateTable
CREATE TABLE "GuildConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "nicknameFormat" TEXT NOT NULL DEFAULT '{robloxUsername}',
    "verifiedRoleId" TEXT,
    "autoUpdateEnabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateIndex
CREATE UNIQUE INDEX "UserLink_discordId_key" ON "UserLink"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleBind_guildId_discordRoleId_key" ON "RoleBind"("guildId", "discordRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleBind_guildId_robloxRankId_key" ON "RoleBind"("guildId", "robloxRankId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildConfig_guildId_key" ON "GuildConfig"("guildId");
