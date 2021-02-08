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
    guilds: GuildData[],
}

// Globals
let guilds: GuildData[];
const discordClient: DiscordClient = new DiscordClient();
const guildIdToPrefix: Map<string, string> = new Map<string, string>();
const throwExpr = (msg: any): never => { // Hack because `throw` isn't an expression
    throw new Error(msg);
};
const SAVE_FILE: string = process.env.SAVE_FILE ?? './data.json';
const DEFAULT_PREFIX: string = process.env.DEFAULT_PREFIX ?? '~';
const DISCORD_SECRET: string = process.env.DISCORD_SECRET ?? throwExpr('A DISCORD_SECRET must be provided in `./.env`!');
const EMPTY_SAVE_DATA: string = JSON.stringify({ guilds: [] });

async function saveData(): Promise<void> {
    const output: SaveData = { guilds };
    return fs.writeFile(SAVE_FILE, JSON.stringify(output));
}

async function startUp(): Promise<void> {
    let file: string;
    try {
        file = await fs.readFile(SAVE_FILE, { encoding: 'utf-8' });
    } catch (err) {
        file = EMPTY_SAVE_DATA;
        if (err.code === 'ENOENT') {
            fs.writeFile(SAVE_FILE, EMPTY_SAVE_DATA, 'utf-8');
        } else {
            throw err;
        }
    }
    const savedData: SaveData = JSON.parse(file);

    guilds = savedData.guilds;
    savedData.guilds.forEach((guild: GuildData) => {
        guildIdToPrefix.set(guild.id, guild.prefix);
    });

    await discordClient.login(DISCORD_SECRET);
    discordClient.guilds.cache.forEach((guild: Guild, id: string) => {
        if (!guildIdToPrefix.has(id)) {
            guildIdToPrefix.set(id, DEFAULT_PREFIX);
            guilds.push({ id, prefix: DEFAULT_PREFIX, calendars: [] });
        }
    });
    saveData();

}

async function setUpListeners(): Promise<void> {
    discordClient.on('message', (msg: Message) => {
        const prefix: string = msg.guild === null ? '' : guildIdToPrefix.get(msg.guild.id) as string;

        if (msg.content.startsWith(prefix)) {
            const tokens: string[] = msg.content.split(' ');
            // Removes the guild-specific prefix from the command
            tokens[0] = tokens[0].slice(prefix.length);
            switch (tokens[0]) {
                case 'ping':
                    msg.reply('pong!');
                    break;
                default:
                    msg.reply('invalid command!');
            }
        }
    });

    discordClient.on('guildCreate', (guild: Guild) => {
        guilds.push({ id: guild.id, prefix: DEFAULT_PREFIX, calendars: [] });
        saveData();
    });
}

setUpListeners();
startUp();
