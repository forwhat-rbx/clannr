-- CreateTable
CREATE TABLE "XpLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "robloxId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XpLog_robloxId_fkey" FOREIGN KEY ("robloxId") REFERENCES "User" ("robloxId") ON DELETE RESTRICT ON UPDATE CASCADE
);
