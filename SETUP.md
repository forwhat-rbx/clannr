# Clannr Setup Guide

## Prerequisites

- Node.js 16+ installed
- A Discord bot token
- A Roblox account with group management permissions
- Basic knowledge of Discord and Roblox

## Quick Start

1. **Clone and Install**

   ```bash
   git clone https://github.com/yourusername/clannr
   cd clannr
   npm install
   ```

2. **Environment Setup**
   Copy `.env.example` to `.env` and fill in your details:

   ```
   DISCORD_TOKEN=your_discord_bot_token
   ROBLOX_COOKIE=your_roblox_cookie
   API_KEY=your_secure_api_key
   ```

3. **Database Setup**

   ```bash
   npx prisma migrate dev --schema ./src/database/schema.prisma --name init
   ```

4. **Configure the Bot**
   Edit `src/config.ts` with your specific settings:

   - Replace `groupId` with your Roblox group ID
   - Add Discord user IDs to permission arrays
   - Set up logging channel IDs
   - Configure XP system ranks

5. **Start the Bot**
   ```bash
   npm start
   ```

## Detailed Configuration

### Required Settings

You need to look through config.ts and make sure everything is set up correctly there.
Everything you need is right there, just take your time and look through it. If you need any support,
join the discord server: discord.gg/zxVBjbBcXF
