import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { getLinkedRobloxUser, removeUserLink } from '../../handlers/accountLinks';
import { createBaseEmbed } from '../../utils/embedUtils';
import { logVerificationEvent } from '../../handlers/handleLogging';

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
                        createBaseEmbed('danger')
                            .setTitle('Não verificado')
                            .setDescription('Você não tem uma conta Roblox vinculada à sua conta Discord.')
                    ],
                    ephemeral: true
                });
            }

            // Store the linked user information before removing it for logging
            const robloxInfo = {
                id: linkedUser.id,
                username: linkedUser.name
            };

            await removeUserLink(ctx.user.id);

            // Log the unverify action
            await logVerificationEvent(
                ctx.user,
                'Account Unlinked',
                robloxInfo,
                `User manually unlinked their Roblox account`
            );

            return ctx.reply({
                embeds: [
                    createBaseEmbed('accountUnlinked')
                        .setTitle('Não verificado com sucesso')
                        .setDescription(`Sua conta do Discord foi desvinculada de [${linkedUser.name}](https://www.roblox.com/users/${linkedUser.id}/profile).`)
                ],
                ephemeral: true
            });
        } catch (err) {
            console.error("Error in unverify command:", err);

            // Try to log the error
            try {
                const linkedUser = await getLinkedRobloxUser(ctx.user.id).catch(() => null);
                await logVerificationEvent(
                    ctx.user,
                    'Account Unlinked',
                    linkedUser ? { id: linkedUser.id, username: linkedUser.name } : null,
                    `Error during account unlinking: ${err.message}`
                );
            } catch (logErr) {
                console.error("Failed to log unverify error:", logErr);
            }

            return ctx.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Erro')
                        .setDescription('Ocorreu um erro ao tentar cancelar a verificação de sua conta. Tente novamente mais tarde.')
                ],
                ephemeral: true
            });
        }
    }
}

export default UnverifyCommand;