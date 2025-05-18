abstract class DatabaseProvider {
    abstract findUser(query: any);
    abstract findSuspendedUsers();
    abstract findBannedUsers();
    abstract updateUser(query: any, data: any);
    abstract getAllUsers();
    abstract deleteUser(query: any);
    abstract getXpLogs(limit?: number): Promise<any[]>;
    abstract logXpChange(robloxId: string, amount: number, reason?: string, discordUserId?: string): Promise<any>;

}

export { DatabaseProvider };