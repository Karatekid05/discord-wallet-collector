import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { listWalletsWithRow, batchDeleteRows } from '../src/sheets.js';

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token || !guildId) {
	console.error('Missing DISCORD_TOKEN or GUILD_ID in environment');
	process.exit(1);
}

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
	try {
		console.log('Connecting to Discord guild...');
		const guild = await client.guilds.fetch(guildId);
		console.log(`Connected to guild: ${guild.name}`);
		
		console.log('Fetching users from Google Sheets (this may take a moment)...');
		let items;
		let retries = 3;
		while (retries > 0) {
			try {
				items = await listWalletsWithRow();
				break;
			} catch (err) {
				retries--;
				if (retries === 0) {
					throw err;
				}
				console.log(`Sheets API timeout, retrying... (${retries} attempts left)`);
				await new Promise((r) => setTimeout(r, 5000));
			}
		}
		
		console.log(`Fetched ${items.length} users from sheet`);
		console.log(`\n=== Checking ${items.length} users in sheet ===\n`);
		
		const toDelete = [];
		const concurrencyLimit = 5;
		const queue = [...items];
		
		const workers = Array.from({ length: concurrencyLimit }, async () => {
			while (queue.length > 0) {
				const item = queue.shift();
				if (!item || !item.discordId) continue;
				
				try {
					const member = await guild.members.fetch(item.discordId).catch(() => null);
					if (!member) {
						console.log(`✗ ${item.discordUsername} (${item.discordId}) - Not in server`);
						toDelete.push(item.rowNumber);
					}
				} catch (err) {
					console.log(`✗ ${item.discordUsername} (${item.discordId}) - Error: ${err.message}`);
					toDelete.push(item.rowNumber);
				}
			}
		});
		
		await Promise.all(workers);
		
		console.log(`\n=== Summary ===`);
		console.log(`Users not in server: ${toDelete.length}`);
		
		if (toDelete.length > 0) {
			console.log(`\nDeleting ${toDelete.length} row(s)...`);
			let deleted = 0;
			let retries = 3;
			while (retries > 0) {
				try {
					const result = await batchDeleteRows(toDelete);
					deleted = result.deleted;
					break;
				} catch (err) {
					retries--;
					if (retries === 0) {
						console.error(`Failed to delete after retries: ${err.message}`);
						throw err;
					}
					console.log(`Delete timeout, retrying... (${retries} attempts left)`);
					await new Promise((r) => setTimeout(r, 5000));
				}
			}
			console.log(`✓ Deleted ${deleted} row(s) from sheet\n`);
		} else {
			console.log('No users to delete.\n');
		}
		
		process.exit(0);
	} catch (err) {
		console.error('Error:', err);
		process.exit(1);
	}
});

client.login(token);

