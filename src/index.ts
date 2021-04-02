import { CalendarResponse, fromURL as icalFromUrl } from 'node-ical';
import { Client as DiscordClient, Guild, Message } from 'discord.js';
import { promises as fs } from 'fs';
import { config as dotenvConfig } from 'dotenv';
import {
    createLogger,
    transports,
    format,
    config as winstonConfig,
} from 'winston';

// Set up dotenv
dotenvConfig();

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

// Globals
let guilds: Map<string, GuildData>;
const discordClient: DiscordClient = new DiscordClient();
const guildIdToPrefix: Map<string, string> = new Map<string, string>();
const throwExpr = (msg: any): never => { // Hack because `throw` isn't an expression
    throw new Error(msg);
};
const SAVE_FILE: string = process.env.SAVE_FILE ?? './data.json';
const DEFAULT_PREFIX: string = process.env.DEFAULT_PREFIX ?? '~';
const DISCORD_SECRET: string = process.env.DISCORD_SECRET ?? throwExpr('A DISCORD_SECRET must be provided in `./.env`!');
const defaultGuildData = (id: string): GuildData => ({ id, prefix: DEFAULT_PREFIX, calendars: [] });
// Makes sure that the empty save data gets updated if the SaveData type is changed
const EMPTY_SAVE_DATA_VALUE: SaveData = { guilds: [] };
const EMPTY_SAVE_DATA: string = JSON.stringify(EMPTY_SAVE_DATA_VALUE);
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';
const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
        format.printf((info) => {
            let output = `${info.timestamp} [${info.level}]: ${info.message}`;
            // If log level >= debug
            if (winstonConfig.npm.levels[LOG_LEVEL] >= winstonConfig.npm.levels.debug
                // and there was metadata given
                && Object.keys(info.metadata).length !== 0) {
                // then print that metadata along with the log message.
                output = `${output}\n\t${JSON.stringify(info.metadata)}`;
            }
            return output;
        }),
    ),
    transports: [
        new transports.Console({
            level: LOG_LEVEL,
        }),
    ],
});

function saveData(): void {
    logger.debug('saveData.start');
    const dataToSave: SaveData = { guilds: Array.from(guilds.entries()) };
    const result: Promise<void> = fs.writeFile(SAVE_FILE, JSON.stringify(dataToSave));
    logger.debug('saveData.fin');

    result.catch((reason: any) => {
        logger.error('saveData.error.write', { reason });
    });
}

async function startUp(): Promise<void> {
    logger.debug('startUp.start');
    const login: Promise<string> = discordClient.login(DISCORD_SECRET);

    logger.silly('startUp.readSave.start');
    let file: string;
    try {
        file = await fs.readFile(SAVE_FILE, { encoding: 'utf-8' });
        logger.silly('startUp.readSave.success', { file });
    } catch (err) {
        file = EMPTY_SAVE_DATA;
        if (err.code === 'ENOENT') {
            logger.warn('startUp.readSave.notFound');
            await fs.writeFile(SAVE_FILE, EMPTY_SAVE_DATA, 'utf-8');
        } else {
            logger.error('startUp.readSave.error');
            throw err;
        }
    }
    logger.silly('startUp.readSave.fin');

    logger.silly('startUp.parseSave.start');
    const savedData: SaveData = JSON.parse(file);
    guilds = new Map(savedData.guilds);
    guilds.forEach((guild: GuildData) => {
        guildIdToPrefix.set(guild.id, guild.prefix);
    });
    logger.silly('startUp.parseSave.fin');

    await login;

    logger.silly('startUp.readGuilds.start');
    discordClient.guilds.cache.forEach((_guild: Guild, id: string) => {
        if (!guildIdToPrefix.has(id)) {
            guildIdToPrefix.set(id, DEFAULT_PREFIX);
            guilds.set(id, { id, prefix: DEFAULT_PREFIX, calendars: [] });
        }
    });
    logger.silly('startUp.readGuilds.fin');

    saveData();
    logger.debug('startUp.fin');
}

async function handleCommand(commandTokens: string[], msg: Message): Promise<void> {
    const logInfo = {
        guildId: msg.guild?.id ?? `DM ${msg.author.id}`,
        msg: {
            channelId: msg.channel.id,
            content: msg.content,
            createdTimestamp: msg.createdTimestamp,
            authorId: msg.author.id,
        },
    };
    logger.silly('handleCommand.start', logInfo);
    switch (commandTokens[0].toLowerCase()) {
        case 'ping':
            logger.silly('handleCommand.ping.start', logInfo);
            msg.reply('pong!');
            logger.silly('handleCommand.ping.fin', logInfo);
            break;
        case 'prefix':
            logger.silly('handleCommand.prefix.start', logInfo);
            if (msg.guild !== null) {
                if (commandTokens.length === 1) {
                    msg.reply(`the current prefix is \`${guildIdToPrefix.get(msg.guild.id)}\``);
                    logger.silly('handleCommand.prefix.success', logInfo);
                } else if (commandTokens.length === 2) {
                    msg.reply(`the current prefix is \`${guildIdToPrefix.get(msg.guild.id)}\`. Did you mean \`${guildIdToPrefix.get(msg.guild.id)}setprefix\`?`);
                    logger.silly('handleCommand.prefix.error.oneExtraArg', logInfo);
                } else {
                    msg.reply(`Invalid usage of \`${guildIdToPrefix.get(msg.guild.id)}prefix\``);
                    logger.silly('handleCommand.prefix.error.extraArgs', logInfo);
                }
            } else {
                msg.reply('This command can only be used within a server.');
                logger.silly('handleCommand.prefix.error.guild', logInfo);
            }
            logger.silly('handleCommand.prefix.fin', logInfo);
            break;
        case 'setprefix':
            logger.silly('handleCommand.setprefix.start', logInfo);
            if (msg.guild !== null) {
                if (commandTokens.length === 2) {
                    const newPrefix = commandTokens[1];
                    const msgGuildData: GuildData | undefined = guilds.get(msg.guild.id);
                    if (msgGuildData !== undefined) {
                        msgGuildData.prefix = newPrefix;
                        guildIdToPrefix.set(msgGuildData.id, newPrefix);
                        saveData();
                        msg.reply(`done! New prefix is \`${newPrefix}\`.`);
                    } else {
                        msg.reply('internal error.');
                        logger.error('handleCommand.setPrefix.error.internal', logInfo);
                    }
                    logger.silly('handleCommand.setprefix.success', { newPrefix }, logInfo);
                } else {
                    msg.reply(`the usage of this command is \`${guildIdToPrefix.get(msg.guild.id)}setprefix <new prefix>\``);
                    logger.silly('handleCommand.setprefix.error.usage', logInfo);
                }
            } else {
                msg.reply('This command can only be used within a server.');
                logger.silly('handleCommand.setprefix.error.guild', logInfo);
            }
            logger.silly('handleCommand.setprefix.fin', logInfo);
            break;
        case 'calendars':
            logger.silly('handleCommand.calendars.start', logInfo);
            if (msg.guild !== null) {
                if (commandTokens.length === 1) {
                    const calendars: Calendar[] | undefined = guilds.get(msg.guild.id)?.calendars;
                    if (calendars !== undefined) {
                        if (calendars.length !== 0) {
                            const replyString: string = calendars.reduce<string>((accumulator: string, current: Calendar): string => `${accumulator}${current.url}\n`, '');
                            msg.reply(`The calendars currently registered in this guild are:\n${replyString}`);
                            logger.silly('handleCommand.calendars.success', { replyString: replyString.replace(/\n/g, '\\n') }, logInfo);
                        } else {
                            msg.reply('this server doesn\'t have any calendars registered yet.');
                            logger.silly('handleCommand.calendars.error.noCalendars', logInfo);
                        }
                    } else {
                        msg.reply('there was an internal error executing your command.');
                        logger.warn('handleCommand.calendars.error.internal', logInfo);
                    }
                } else {
                    msg.reply(`the usage of this comand is \`${guildIdToPrefix.get(msg.guild.id)}calendars\``);
                    logger.silly('handleCommand.calendars.error.usage', logInfo);
                }
            } else {
                msg.reply('This command can only be used within a server.');
                logger.silly('handleCommand.calendars.error.guild', logInfo);
            }
            logger.silly('handleCommand.calendars.fin', logInfo);
            break;
        default:
            msg.reply('invalid command!');
            logger.silly('handleCommand.error.invalid', logInfo);
    }
    logger.silly('handleCommand.fin');
}

async function setUpListeners(): Promise<void> {
    discordClient.on('message', (msg: Message) => {
        const prefix: string = msg.guild === null ? '' : guildIdToPrefix.get(msg.guild.id) as string;
        const startsWithPrefix: boolean = msg.content.startsWith(prefix);
        const startsWithMention: boolean = msg.content.startsWith(`<@${discordClient.user?.id}> `) || msg.content.startsWith(`<@!${discordClient.user?.id}> `);
        if (msg.author.id !== discordClient.user?.id && (startsWithPrefix || startsWithMention)) {
            const tokens: string[] = msg.content.split(' ');
            if (startsWithPrefix) {
                // Removes the guild-specific prefix from the command
                tokens[0] = tokens[0].slice(prefix.length);
            } else {
                // Removes the first token (i.e., the @Bot mention)
                tokens.shift();
            }
            handleCommand(tokens, msg);
        }
    });

    discordClient.on('guildCreate', (guild: Guild) => {
        const logInfo = {
            guildId: guild.id,
        };
        logger.debug('guildCreate.start', logInfo);

        const newMapEntry: GuildData = defaultGuildData(guild.id);
        guilds.set(guild.id, newMapEntry);
        logger.silly('guildCreate.updateGuildMap', { newMapEntry }, logInfo);

        guildIdToPrefix.set(guild.id, DEFAULT_PREFIX);
        logger.silly('guildCreate.updatePrefixMap', logInfo);

        saveData();
        logger.debug('guildCreate.fin', logInfo);
    });
}

startUp().then(() => {
    setUpListeners();
}).catch((reason: any) => {
    logger.error(`Failed to start up: ${reason}`);
});
