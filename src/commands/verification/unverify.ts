import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { getLinkedRobloxUser, removeUserLink } from '../../handlers/accountLinks';
import { createBaseEmbed } from '../../utils/embedUtils';

class UnverifyCommand extends Command {
    constructor() {
        super({
            trigger: 'unverify',
            description: 'Unlink your Discord account from your Roblox account',
            type: 'ChatInput',
            module: 'verification',
            enabled: true
        });
    }

    async run(ctx: CommandContext) {
        try {
            const linkedUser = await getLinkedRobloxUser(ctx.user.id);

            if (!linkedUser) {
                return ctx.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Not Verified')
                            .setDescription('You do not have a Roblox account linked to your Discord account.')
                            .setColor(0xff0000)
                    ],
                    ephemeral: true
                });
            }

            await removeUserLink(ctx.user.id);

            return ctx.reply({
                embeds: [
                    createBaseEmbed()
                        .setTitle('Unverified Successfully')
                        .setDescription(`Your Discord account has been unlinked from [${linkedUser.name}](https://www.roblox.com/users/${linkedUser.id}/profile).`)
                ],
                ephemeral: true
            });
        } catch (err) {
            console.error("Error in unverify command:", err);
            return ctx.reply({
                embeds: [
                    createBaseEmbed()
                        .setTitle('Error')
                        .setDescription('An error occurred while trying to unverify your account. Please try again later.')
                        .setColor(0xff0000)
                ],
                ephemeral: true
            });
        }
    }
}

export default UnverifyCommand;