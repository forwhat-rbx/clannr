![Marketing Banner](https://i.imgur.com/khUiElc.png)

<p align="center">
  <a href="https://github.com/forwhat-rbx/clannr/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/forwhat-roblox/clannr?color=E76F51"></a>
  <a href="https://discord.com/invite/zxVBjbBcXF"><img alt="Discord" src="https://img.shields.io/badge/chat-on%20discord-E9C46A"></a>
  <a href="https://github.com/forwhat-rbx/clannr/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/forwhat-roblox/clannr?color=2A9D8F"></a>
  <a href="https://github.com/forwhat-rbx/clannr/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/forwhat-roblox/clannr?color=264653"></a>
</p>

This project started life as [LengoLabs’ Qbot](https://docs.lengolabs.com) (MIT-licensed). All original copyright remains with LengoLabs; this fork is independently maintained. A big thank you to them for still having their documents open and readily available for use. I will be heavily relying on them to be able to show you how to install this bot for yourself.

## Installation

You can follow the [environment setup](https://docs.lengolabs.com/docs/environment-setup) from the original creators of the bot.

You can also follow the [basic installation](https://docs.lengolabs.com/docs/basic-install).

Once you have your environment setup completed, you can run these commands.

> `git clone https://github.com/forwhat-rbx/clannr`

> `npm install -D`

> `npx prisma migrate dev --schema ./src/database/schema.prisma --name init`

Set up the bot configuration (src/config.ts) before starting the bot.

> `pm2 start npm --name "clannr" -- start`

Clannr runs on any host supporting Node.js v16+, and it’s optimized to stay in the same IP region as the account that handles your `.ROBLOSECURITY` cookie.

If you have any troubles, join our [community Discord server](https://discord.com/invite/zxVBjbBcXF), we have amazing volunteers that will help you at every step of the way.

## License

This project is released under the MIT License for maximum freedom and contributor peace of mind.

> Read the full text here: https://github.com/forwhat-roblox/clannr/blob/main/LICENSE

## Note on Discord API

Bots must follow Discord’s developer terms. Review them here before deploying Clannr:  
https://discord.com/developers/docs/legal

> “You will comply with all applicable privacy laws… You will provide and adhere to a privacy policy… that clearly and accurately describes to users what information you collect and how you use and share such information.” ([jump to section](https://discord.com/developers/docs/legal#a-implement-good-privacy-practices))

You’re responsible for creating a privacy policy—this can be a simple document stating “We don’t collect personal data” with a contact link for questions. If anything’s unclear, the [Discord Developers server](https://discord.gg/discord-developers) is a good place to ask.

## Feedback & Suggestions

We love hearing from you! Share ideas or report issues via:

- GitHub Issues: https://github.com/forwhat-roblox/clannr/issues
- Discord Feedback Channel: https://discord.com/invite/zxVBjbBcXF

## Contributing

Thanks for considering a contribution! Our workflow:

1. Fork the repo.
2. Create a branch: `git checkout -b feature/awesome`
3. Commit your changes: `git commit -m "Add awesome feature"`
4. Push: `git push origin feature/awesome`
5. Open a PR against `main`.

Once merged, you’ll be added to the contributors list and earn a special role in our Discord!

## Extra Notes

- Clannr is not affiliated with Discord, Inc.
- Clannr is not affiliated with Roblox Corporation.
