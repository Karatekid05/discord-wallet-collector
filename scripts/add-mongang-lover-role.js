import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { listWalletsWithRow, batchUpdateRoles } from '../src/sheets.js';

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token || !guildId) {
	console.error('Missing DISCORD_TOKEN or GUILD_ID in environment');
	process.exit(1);
}

const MONGANG_LOVER_ROLE_ID = '1385211569872310324'; // Mongang lover 💜
const ROLE_LABEL = 'Mongang Lover';

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
	try {
		console.log('Connecting to Discord guild...');
		const guild = await client.guilds.fetch(guildId);
		console.log(`Connected to guild: ${guild.name}`);
		
		console.log('Fetching users from Google Sheets (this may take a moment)...');
		// Wait a bit before first attempt to let network stabilize
		await new Promise((r) => setTimeout(r, 2000));
		
		let items;
		let retries = 5;
		let delay = 5000;
		while (retries > 0) {
			try {
				items = await listWalletsWithRow();
				break;
			} catch (err) {
				retries--;
				if (retries === 0) {
					console.error(`\nFailed to fetch from Sheets after all retries.`);
					console.error(`Error: ${err.code || err.message}`);
					throw err;
				}
				console.log(`Sheets API timeout, waiting ${delay/1000}s before retry... (${retries} attempts left)`);
				await new Promise((r) => setTimeout(r, delay));
				delay = Math.min(delay * 1.5, 30000); // Increase delay, max 30s
			}
		}
		
		console.log(`Fetched ${items.length} users from sheet`);
		
		// Filter users with blank role
		const blankRoleUsers = items.filter((item) => !item.role || item.role.trim() === '');
		
		console.log(`\n=== Checking ${blankRoleUsers.length} users with blank role ===\n`);
		
		const updates = [];
		const concurrencyLimit = 5;
		const queue = [...blankRoleUsers];
		
		const workers = Array.from({ length: concurrencyLimit }, async () => {
			while (queue.length > 0) {
				const item = queue.shift();
				if (!item || !item.discordId) continue;
				
				try {
					const member = await guild.members.fetch(item.discordId).catch(() => null);
					if (!member) {
						continue;
					}
					
					const hasMongangLover = member.roles.cache.has(MONGANG_LOVER_ROLE_ID);
					if (hasMongangLover) {
						console.log(`✓ ${item.discordUsername} (${item.discordId}) - Has Mongang lover 💜`);
						updates.push({ rowNumber: item.rowNumber, role: ROLE_LABEL });
					}
				} catch (err) {
					// Skip errors
				}
			}
		});
		
		await Promise.all(workers);
		
		console.log(`\n=== Summary ===`);
		console.log(`Users with blank role checked: ${blankRoleUsers.length}`);
		console.log(`Users with Mongang lover 💜 role found: ${updates.length}`);
		
		if (updates.length > 0) {
			console.log(`\nUpdating ${updates.length} row(s) with "${ROLE_LABEL}"...`);
			// Wait a bit before update attempt
			await new Promise((r) => setTimeout(r, 2000));
			
			let updated = 0;
			let retries = 5;
			let delay = 5000;
			while (retries > 0) {
				try {
					const result = await batchUpdateRoles(updates);
					updated = result.updated;
					break;
				} catch (err) {
					retries--;
					if (retries === 0) {
						console.error(`\nFailed to update after all retries.`);
						console.error(`Error: ${err.code || err.message}`);
						throw err;
					}
					console.log(`Update timeout, waiting ${delay/1000}s before retry... (${retries} attempts left)`);
					await new Promise((r) => setTimeout(r, delay));
					delay = Math.min(delay * 1.5, 30000); // Increase delay, max 30s
				}
			}
			console.log(`✓ Updated ${updated} row(s) in sheet\n`);
		} else {
			console.log('No users to update.\n');
		}
		
		process.exit(0);
	} catch (err) {
		console.error('Error:', err);
		process.exit(1);
	}
});

client.login(token);

