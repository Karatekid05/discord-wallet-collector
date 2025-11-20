import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { listWalletsWithRow, batchDeleteRows } from '../src/sheets.js';

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token || !guildId) {
	console.error('Missing DISCORD_TOKEN or GUILD_ID in environment');
	process.exit(1);
}

// Role priority (highest to lowest) - same as bot.js
const PRIORITY_ROLES = [
	{ id: '1338964285585621094', label: 'Admin' },
	{ id: '1339293248308641883', label: 'Mongang Team' },
	{ id: '1338993206112817283', label: 'Community Team' },
	{ id: '1379870976212467772', label: 'Alpha Boss' },
	{ id: '1353403238241669132', label: 'BOSS 💎' },
	{ id: '1353017567345901589', label: 'Mongang friends' },
	{ id: '1399886358096379964', label: 'Alpha' },
	{ id: '1416902471124652204', label: 'Free Mint Pass' },
	{ id: '1353403039200972830', label: 'Mafia 💣' },
	{ id: '1353402893532659732', label: 'Capo 🧨' },
	{ id: '1427682447369437284', label: 'Monad eligible' },
	{ id: '1353402683247165561', label: 'Fast Shooter 🔫' },
	{ id: '1385211569872310324', label: 'Mongang Lover' },
	{ id: '1353141685504315465', label: 'MONGANG' },
	{ id: '1395161421507072033', label: 'Mad Gang' },
	{ id: '1441026531479781508', label: 'SOM OG' },
	{ id: '1440822890697199658', label: 'CULT DC' },
	{ id: '1440388757588152330', label: 'Cult Relic Holder' },
];

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
				delay = Math.min(delay * 1.5, 30000);
			}
		}
		
		console.log(`Fetched ${items.length} users from sheet`);
		console.log(`\n=== Checking ${items.length} users for priority roles ===\n`);
		
		const toDelete = [];
		const concurrencyLimit = 20; // Increased for faster checking
		const queue = [...items];
		let checked = 0;
		const total = items.length;
		const progressInterval = setInterval(() => {
			process.stdout.write(`\rChecked: ${checked}/${total} (${Math.round(checked/total*100)}%) - Found: ${toDelete.length} without priority roles`);
		}, 1000);
		
		const workers = Array.from({ length: concurrencyLimit }, async () => {
			while (queue.length > 0) {
				const item = queue.shift();
				if (!item || !item.discordId) {
					checked++;
					continue;
				}
				
				try {
					const member = await guild.members.fetch(item.discordId).catch(() => null);
					if (!member) {
						// User not in server - add to delete list
						toDelete.push(item.rowNumber);
					} else {
						// Check if user has any priority role
						const roleIds = new Set(member.roles.cache.map((r) => r.id));
						const hasAnyPriority = PRIORITY_ROLES.some((r) => roleIds.has(r.id));
						if (!hasAnyPriority) {
							toDelete.push(item.rowNumber);
						}
					}
				} catch (err) {
					// On error, assume no priority role
					toDelete.push(item.rowNumber);
				}
				checked++;
			}
		});
		
		await Promise.all(workers);
		clearInterval(progressInterval);
		process.stdout.write(`\rChecked: ${checked}/${total} (100%) - Found: ${toDelete.length} without priority roles\n\n`);
		
		console.log(`\n=== Summary ===`);
		console.log(`Users without priority roles: ${toDelete.length}`);
		
		if (toDelete.length > 0) {
			console.log(`\nDeleting ${toDelete.length} row(s)...`);
			// Wait a bit before delete attempt
			await new Promise((r) => setTimeout(r, 2000));
			
			let deleted = 0;
			let retries = 5;
			let delay = 5000;
			while (retries > 0) {
				try {
					const result = await batchDeleteRows(toDelete);
					deleted = result.deleted;
					break;
				} catch (err) {
					retries--;
					if (retries === 0) {
						console.error(`\nFailed to delete after all retries.`);
						console.error(`Error: ${err.code || err.message}`);
						throw err;
					}
					console.log(`Delete timeout, waiting ${delay/1000}s before retry... (${retries} attempts left)`);
					await new Promise((r) => setTimeout(r, delay));
					delay = Math.min(delay * 1.5, 30000);
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

