import { Guild, GuildChannel, Role } from 'discord.js';
import { promises as fs } from 'fs';
import { logger } from './log.js';

// Globals
const SAVE_FILE: string = process.env.SAVE_FILE ?? './data.json';
export { SAVE_FILE };

// Interfaces
interface Calendar {
    url: string,
    // Either a role ID or 'everyone'.
    roleId: string,
    channelId: string,
}
interface GuildData {
    id: string,
    prefix: string,
    calendars: Calendar[],
}
interface SaveData {
    guilds: [string, GuildData][],
}
export { Calendar, GuildData, SaveData };

// Helper functions
/**
 * Parses a role identifier and converts it to a role ID (if it exists), or `null`.
 * @param roleIdentifier - The role identifier to parse. Can be a role mention (`<@&ROLE_ID>`),
 * numeric role id, or a role name.
 * @param guild - The guild to check for the role in.
 * @returns The role ID that corresponds to the `roleIdentifier`
 */
async function parseRole(roleIdentifier: string, guild: Guild): Promise<string | null> {
    // Check to see if the roleIdentifier is a role mention (e.g., @Moderators)
    if (roleIdentifier.startsWith('<@&')) {
        const roleId = roleIdentifier.slice(3, roleIdentifier.length - 1);
        // We perform this check to make sure that an actual role is what's referenced,
        // not just <@&random_numbers>
        const role: Role | null = await guild.roles.fetch(roleId);
        return role != null ? role.id : null;
    }

    // Checks to see if roleIdentifier is all digits, if so tries to see if it's a valid role ID.
    if (/^\d+$/.test(roleIdentifier)) {
        const role: Role | null = await guild.roles.fetch(roleIdentifier);
        if (role != null) {
            return role.id;
        }
        // If the number isn't a role ID, fallthrough and see if it's a role name.
    }

    // Assumes role identifier is the name of a role, last possible outcome other than
    // user error
    const result = guild.roles.cache.get(roleIdentifier);
    return result === undefined ? null : result.id;
}

/**
 * Parses a text channel identifier (something that uniquely identifies a specific text channel,
 * may or may not be the channel id, name, etc.) into a channel ID if the channel can be resolved
 * `null` if it can't. Currently supported are channel IDs, and `<#channel-id>` mentions, names
 * don't work because duplicate text-channel names are allowed.
 * @param channelIdentifier - A string that uniquely identifies a text channel. Can be the numeric
 * channel ID or a `<#channel-id>` mention.
 * @param guild - The guild that the given channel should be searched for in.
 */
function parseTextChannel(channelIdentifier: string, guild: Guild): string | null {
    let channelId;

    if (channelIdentifier.startsWith('<#')) {
        // This if statement represents the case where our channel identifier is a <#channel-id>
        // mention (in this discord client, this is represented as a blue highlighted channel link).
        channelId = channelIdentifier.slice(2, channelIdentifier.length - 1);
    } else {
        // This else represents the case where we're assuming the channel identifier is just the
        // channel ID.
        channelId = channelIdentifier;
    }

    const channel: GuildChannel | null = guild.channels.resolve(channelId);
    // This represents the case where the channel doesn't exist (i.e.,
    // guild.channels.resolve(...) returned null), or it exists but isn't
    // a regular text channel.
    if (channel === null || channel.type !== 'text') {
        return null;
    }
    return channel.id;
}

/**
 * Saves data out to `SAVE_FILE`, which should be given by an environment variable.
 * @param guilds - The Map from `guild id -> GuildData` that should be saved out.
 */
function saveData(guilds: Map<string, GuildData>): void {
    logger.debug('saveData.start');
    const dataToSave: SaveData = { guilds: Array.from(guilds.entries()) };
    const result: Promise<void> = fs.writeFile(SAVE_FILE, JSON.stringify(dataToSave));
    logger.debug('saveData.fin');

    result.catch((reason: any) => {
        logger.error({ ...reason }, 'saveData.error.write');
    });
}

export { parseRole, parseTextChannel, saveData };
