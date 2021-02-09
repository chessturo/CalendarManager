import { NodeICalAsync } from 'node-ical';
import { Client as DiscordClient, Guild, Message } from 'discord.js';
import { promises as fs } from 'fs';
import { config as dotenvConfig } from 'dotenv';

// Set up dotenv
dotenvConfig();

// Interfaces
interface Calendar {
    url: string,
    // Either a role ID or 'everyone'.
    roleId: string,
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
// Makes sure that the empty save data gets updated if the SaveData type is changed
const EMPTY_SAVE_DATA_VALUE: SaveData = { guilds: [] };
const EMPTY_SAVE_DATA: string = JSON.stringify(EMPTY_SAVE_DATA_VALUE);

async function saveData(): Promise<void> {
    const output: SaveData = { guilds: Array.from(guilds.entries()) };
    return fs.writeFile(SAVE_FILE, JSON.stringify(output));
}

async function startUp(): Promise<void> {
    const login: Promise<string> = discordClient.login(DISCORD_SECRET);

    let file: string;
    try {
        file = await fs.readFile(SAVE_FILE, { encoding: 'utf-8' });
    } catch (err) {
        file = EMPTY_SAVE_DATA;
        if (err.code === 'ENOENT') {
            await fs.writeFile(SAVE_FILE, EMPTY_SAVE_DATA, 'utf-8');
        } else {
            throw err;
        }
    }
    const savedData: SaveData = JSON.parse(file);
    guilds = new Map(savedData.guilds);
    guilds.forEach((guild: GuildData) => {
        guildIdToPrefix.set(guild.id, guild.prefix);
    });

    await login;
    discordClient.guilds.cache.forEach((guild: Guild, id: string) => {
        if (!guildIdToPrefix.has(id)) {
            guildIdToPrefix.set(id, DEFAULT_PREFIX);
            guilds.set(id, { id, prefix: DEFAULT_PREFIX, calendars: [] });
        }
    });
    saveData();
}

function handleCommand(commandTokens: string[], msg: Message): void {
    switch (commandTokens[0].toLowerCase()) {
        case 'ping':
            msg.reply('pong!');
            break;
        case 'prefix':
            if (msg.guild !== null) {
                if (commandTokens.length === 1) {
                    msg.reply(`the current prefix is \`${guildIdToPrefix.get(msg.guild.id)}\``);
                } else if (commandTokens.length === 2) {
                    msg.reply(`the current prefix is \`${guildIdToPrefix.get(msg.guild.id)}\`. Did you mean \`${guildIdToPrefix.get(msg.guild.id)}setprefix\`?`);
                } else {
                    msg.reply(`Invalid usage of \`${guildIdToPrefix.get(msg.guild.id)}prefix\``);
                }
            } else {
                msg.reply('This command can only be used within a server.');
            }
            break;
        case 'setprefix':
            if (msg.guild !== null) {
                if (commandTokens.length === 2) {
                    const newPrefix = commandTokens[1];
                    const msgGuildData: GuildData | undefined = guilds.get((msg.guild as Guild).id);
                    if (msgGuildData !== undefined) {
                        msgGuildData.prefix = newPrefix;
                        guildIdToPrefix.set(msgGuildData.id, newPrefix);
                        saveData();
                        msg.reply(`done! New prefix is \`${newPrefix}\`.`);
                    }
                } else {
                    msg.reply('This command needs the new prefix to use.');
                }
            } else {
                msg.reply('This command can only be used within a server.');
            }
            break;
        default:
            msg.reply('invalid command!');
    }
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
        guilds.set(guild.id, { id: guild.id, prefix: DEFAULT_PREFIX, calendars: [] });
        saveData();
    });
}

startUp();
setUpListeners();
