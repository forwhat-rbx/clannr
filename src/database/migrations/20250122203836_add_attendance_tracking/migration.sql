-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "robloxId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "raids" INTEGER NOT NULL DEFAULT 0,
    "defenses" INTEGER NOT NULL DEFAULT 0,
    "scrims" INTEGER NOT NULL DEFAULT 0,
    "trainings" INTEGER NOT NULL DEFAULT 0,
    "suspendedUntil" DATETIME,
    "unsuspendRank" INTEGER,
    "isBanned" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("id", "isBanned", "robloxId", "suspendedUntil", "unsuspendRank", "xp") SELECT "id", "isBanned", "robloxId", "suspendedUntil", "unsuspendRank", "xp" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_robloxId_key" ON "User"("robloxId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
