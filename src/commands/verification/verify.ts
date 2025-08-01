import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { createUserLink, getLinkedRobloxUser } from '../../handlers/accountLinks';
import { discordClient, robloxClient } from '../../main';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createBaseEmbed } from '../../utils/embedUtils';
import { provider } from '../../database';
import { logVerificationEvent } from '../../handlers/handleLogging';

// Use global pending verifications instead of local map
declare global {
    var pendingVerifications: Map<string, {
        robloxId: string;
        robloxUsername: string;
        code: string;
        expires: number;
    }>;
}

// Initialize if not exists
if (!global.pendingVerifications) {
    global.pendingVerifications = new Map();
}

class VerifyCommand extends Command {
    constructor() {
        super({
            trigger: 'verify',
            description: 'Link your Discord account to your Roblox account',
            type: 'ChatInput',
            module: 'verification',
            args: [
                {
                    trigger: 'username',
                    description: 'Your Roblox username',
                    type: 'String',
                    required: true
                }
            ],
            enabled: true
        });
    }

    async run(ctx: CommandContext) {
        // Check if user is already verified
        const existingLink = await getLinkedRobloxUser(ctx.user.id);
        if (existingLink) {
            // Get the username they're trying to verify with
            const username = ctx.args['username'] as string;

            // Log this as a potential alt account attempt
            try {
                // Try to find the Roblox user they're attempting to verify with
                const potentialAltUsers = await robloxClient.getUsersByUsernames([username]);
                const potentialAltUser = potentialAltUsers.length > 0 ? potentialAltUsers[0] : null;

                await logVerificationEvent(
                    ctx.user,
                    'Verification Failed',
                    existingLink ? { id: existingLink.id, username: existingLink.name } : null,
                    `User attempted to verify with another account: "${username}"${potentialAltUser ? ` (ID: ${potentialAltUser.id})` : ''} while already verified as ${existingLink.name}`
                );
            } catch (logErr) {
                console.error("Failed to log potential alt account attempt:", logErr);
            }

            return ctx.reply({
                embeds: [
                    createBaseEmbed('primary')
                        .setTitle('Already Verified')
                        .setDescription(`You are already verified as [${existingLink.name}](https://www.roblox.com/users/${existingLink.id}/profile).\n\nTo change your account, use \`/unverify\` first.`)
                ],
                ephemeral: true
            });
        }

        const username = ctx.args['username'] as string;

        try {
            // Try to find the Roblox user
            const robloxUsers = await robloxClient.getUsersByUsernames([username]);
            if (robloxUsers.length === 0) {
                return ctx.reply({
                    embeds: [
                        createBaseEmbed('danger')
                            .setTitle('User Not Found')
                            .setDescription(`Could not find a Roblox user with the username "${username}".`)
                            .setColor(0xff0000)
                    ],
                    ephemeral: true
                });
            }

            const robloxUser = robloxUsers[0];

            // Generate a verification code
            const verificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();

            // Store the verification data in global map with consistent ID format
            global.pendingVerifications.set(ctx.user.id, {
                robloxId: String(robloxUser.id),
                robloxUsername: robloxUser.name,
                code: verificationCode,
                expires: Date.now() + 10 * 60 * 1000 // 10 minutes expiry
            });

            // Create verification embed
            const embed = createBaseEmbed()
                .setTitle('Verification Started')
                .setDescription(
                    `Please place this code in your Roblox profile description to verify: \n\n` +
                    `\`\`\`\n${verificationCode}\n\`\`\`\n\n` +
                    `1. Go to [your profile](https://www.roblox.com/users/${robloxUser.id}/profile)\n` +
                    `2. Click on the pencil icon next to your description\n` +
                    `3. Paste the code anywhere in your description\n` +
                    `4. Click Save\n` +
                    `5. Come back and click the "Verify" button below\n\n` +
                    `This verification will expire in 10 minutes.`
                )
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${robloxUser.id}&width=420&height=420&format=png`);

            // Create buttons
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`verify_${ctx.user.id}`)
                        .setLabel('Verify')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`cancel_verify_${ctx.user.id}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                );

            return ctx.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });
        } catch (err) {
            console.error("Error in verify command:", err);
            return ctx.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Verification Error')
                        .setDescription('An error occurred while trying to verify your account. Please try again later.')
                        .setColor(0xff0000)
                ],
                ephemeral: true
            });
        }
    }
}

// Helper function to check verification - export this for button handlers
export async function checkVerification(userId: string) {
    const verification = global.pendingVerifications.get(userId);
    if (!verification || verification.expires < Date.now()) {
        // Try to get the Discord user object for logging
        let discordUser;
        try {
            discordUser = await discordClient.users.fetch(userId);
        } catch (e) {
            console.error(`Failed to fetch user ${userId} for verification logging:`, e);
            // Continue with available data if we can't get the user
        }

        if (discordUser) {
            await logVerificationEvent(
                discordUser,
                'Verification Failed',
                null,
                'Verification not found or expired'
            );
        }

        return { success: false, message: 'Verification not found or expired. Please start verification again.' };
    }

    try {
        // Ensure Roblox ID is always a string
        const robloxIdString = String(verification.robloxId);

        // Get the user's Roblox profile
        const robloxUser = await robloxClient.getUser(Number(robloxIdString));
        console.log(`[VERIFY DEBUG] Verifying user: ${robloxUser.name} (${robloxIdString})`);

        // Fetch the user's profile description directly
        let description = '';
        try {
            // Fix the getUserById call to match the expected type
            const userInfo = await robloxClient.apis.usersAPI.getUserById({ userId: robloxUser.id });
            description = userInfo.description || '';
            console.log(`[VERIFY DEBUG] Profile description: "${description.substring(0, 50)}${description.length > 50 ? '...' : ''}"`);
        } catch (err) {
            console.error('Error fetching profile description:', err);

            // Try to get the Discord user object for logging
            const discordUser = await discordClient.users.fetch(userId).catch(() => null);
            if (discordUser) {
                await logVerificationEvent(
                    discordUser,
                    'Verification Failed',
                    { id: robloxUser.id, username: robloxUser.name },
                    `Failed to fetch profile description: ${err.message}`
                );
            }

            return { success: false, message: 'Failed to fetch your Roblox profile description.' };
        }

        // Get Discord user for logging
        const discordUser = await discordClient.users.fetch(userId).catch(() => null);

        // Check if the verification code is in their description
        if (description.includes(verification.code)) {
            console.log(`[VERIFY DEBUG] Verification successful for Discord ID: ${userId}, Roblox ID: ${robloxIdString}`);

            try {
                // Create the link in DB with string ID
                await createUserLink(userId, robloxIdString);
                console.log(`[VERIFY DEBUG] UserLink created in database`);

                // Initialize user in the XP database if they don't exist
                const existingUser = await provider.findUser(robloxIdString);
                if (!existingUser) {
                    console.log(`[VERIFY DEBUG] Creating new user record with 0 XP`);
                    await provider.updateUser(robloxIdString, {
                        xp: 0,
                        lastActivity: new Date()
                    });
                } else {
                    console.log(`[VERIFY DEBUG] User already exists in database with XP: ${existingUser.xp || 0}`);
                }

                // Remove from pending verification
                global.pendingVerifications.delete(userId);

                // Log successful verification
                if (discordUser) {
                    await logVerificationEvent(
                        discordUser,
                        'Verification Success',
                        { id: robloxUser.id, username: robloxUser.name },
                        `Successfully verified Discord user with Roblox account`
                    );
                }

                return {
                    success: true,
                    robloxUsername: verification.robloxUsername,
                    robloxId: robloxIdString
                };
            } catch (dbErr) {
                console.error("Database error in verification:", dbErr);

                // Log additional details for troubleshooting
                console.error(`User ID: ${userId}, Roblox ID: ${robloxIdString}`);

                // Log verification but note the DB error
                if (discordUser) {
                    await logVerificationEvent(
                        discordUser,
                        'Verification Success',
                        { id: robloxUser.id, username: robloxUser.name },
                        `Verification successful but database error occurred: ${dbErr.message}`
                    );
                }

                // Still return success but log the DB error
                // This lets users verify even if DB writes fail temporarily
                return {
                    success: true,
                    robloxUsername: verification.robloxUsername,
                    robloxId: robloxIdString,
                    dbError: true // Add flag to indicate DB error occurred
                };
            }
        } else {
            console.log(`[VERIFY DEBUG] Verification code not found in profile for Discord ID: ${userId}`);

            // Log failed verification - code not found
            if (discordUser) {
                await logVerificationEvent(
                    discordUser,
                    'Verification Failed',
                    { id: robloxUser.id, username: robloxUser.name },
                    `Verification code not found in profile description`
                );
            }

            return { success: false, message: 'Verification code not found in your profile description.' };
        }
    } catch (err) {
        console.error("Error checking verification:", err);

        // Try to get the Discord user object for logging
        try {
            const discordUser = await discordClient.users.fetch(userId);
            await logVerificationEvent(
                discordUser,
                'Verification Failed',
                null,
                `Error during verification check: ${err.message}`
            );
        } catch (e) {
            console.error(`Failed to log verification error:`, e);
        }

        return { success: false, message: 'An error occurred while checking your verification.' };
    }
}

export default VerifyCommand;