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
		const guild = await client.guilds.fetch(guildId);
		const items = await listWalletsWithRow();
		
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
			const { deleted } = await batchDeleteRows(toDelete);
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

