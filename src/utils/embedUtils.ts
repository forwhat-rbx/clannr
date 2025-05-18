import { EmbedBuilder } from 'discord.js';

// Change the footer text as desired.
const GLOBAL_FOOTER_TEXT = "SOH Bot v2";

export function createBaseEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setFooter({ text: GLOBAL_FOOTER_TEXT })
        .setTimestamp()
        .setColor('#6699ff')
}