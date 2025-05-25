import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { discordClient } from '../../main';

import { infoIconUrl } from '../../handlers/locale';
import { createBaseEmbed } from '../../utils/embedUtils';

class UptimeCommand extends Command {
    constructor() {
        super({
            trigger: "uptime",
            description: "Gets the uptime of the bot",
            type: "ChatInput",
            module: "information",
        });
    }

    convertMilliseconds(milliseconds) {
        let days = 0;
        let hours = 0;
        let minutes = 0;
        let seconds = 0;

        while (milliseconds >= 86400000) {
            days++;
            milliseconds -= 86400000;
        }

        while (milliseconds >= 3600000) {
            hours++;
            milliseconds -= 3600000;
        }

        while (milliseconds >= 60000) {
            minutes++;
            milliseconds -= 60000;
        }

        while (milliseconds >= 1000) {
            seconds++;
            milliseconds -= 1000;
        }

        return {
            days: days,
            hours: hours,
            minutes: minutes,
            seconds: seconds,
            milliseconds: milliseconds
        }
    }

    async run(ctx: CommandContext) {
        let data = this.convertMilliseconds(discordClient.uptime);
        let uptime = `The bot has been running for ${data.days} days, ${data.hours} hours, ${data.minutes} minutes, ${data.seconds} seconds, and ${data.milliseconds} milliseconds`;

        let embed = createBaseEmbed('primary')
            .setAuthor({ name: "Uptime", iconURL: infoIconUrl }) // Updated for v14
            .setDescription(uptime);

        ctx.reply({
            embeds: [embed]
        });
    }
}

export default UptimeCommand;
