import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { listWalletsWithRow } from '../src/sheets.js';

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
	{ id: '1353141685504315465', label: 'MONGANG' },
	{ id: '1395161421507072033', label: 'Mad Gang' },
];

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

function getHighestPriorityRole(roleIds) {
	const found = PRIORITY_ROLES.find((r) => roleIds.has(r.id));
	return found ? found.label : null;
}

client.once('ready', async () => {
	try {
		const guild = await client.guilds.fetch(guildId);
		const items = await listWalletsWithRow();
		
		// Filter users with blank role
		const blankRoleUsers = items.filter((item) => !item.role || item.role.trim() === '');
		
		console.log(`\n=== Checking ${blankRoleUsers.length} users with blank role ===\n`);
		
		const results = [];
		const concurrencyLimit = 5;
		const queue = [...blankRoleUsers];
		
		const workers = Array.from({ length: concurrencyLimit }, async () => {
			while (queue.length > 0) {
				const item = queue.shift();
				if (!item || !item.discordId) continue;
				
				try {
					const member = await guild.members.fetch(item.discordId).catch(() => null);
					if (!member) {
						results.push({
							discordId: item.discordId,
							discordUsername: item.discordUsername,
							highestRole: 'User not in server',
							hasAnyPriority: false,
						});
						continue;
					}
					
					const roleIds = new Set(member.roles.cache.map((r) => r.id));
					const highestRole = getHighestPriorityRole(roleIds);
					
					results.push({
						discordId: item.discordId,
						discordUsername: item.discordUsername,
						highestRole: highestRole || 'No priority role',
						hasAnyPriority: !!highestRole,
					});
				} catch (err) {
					results.push({
						discordId: item.discordId,
						discordUsername: item.discordUsername,
						highestRole: `Error: ${err.message}`,
						hasAnyPriority: false,
					});
				}
			}
		});
		
		await Promise.all(workers);
		
		// Group by role
		const byRole = {};
		results.forEach((r) => {
			const role = r.highestRole;
			if (!byRole[role]) {
				byRole[role] = [];
			}
			byRole[role].push(r);
		});
		
		// Sort by priority (roles with priority first, then others)
		const sortedRoles = Object.keys(byRole).sort((a, b) => {
			const aIndex = PRIORITY_ROLES.findIndex((r) => r.label === a);
			const bIndex = PRIORITY_ROLES.findIndex((r) => r.label === b);
			if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
			if (aIndex !== -1) return -1;
			if (bIndex !== -1) return 1;
			return a.localeCompare(b);
		});
		
		console.log('=== Results by Role ===\n');
		sortedRoles.forEach((role) => {
			const users = byRole[role];
			console.log(`\n${role} (${users.length} user(s)):`);
			users.forEach((u) => {
				console.log(`  - ${u.discordUsername} (${u.discordId})`);
			});
		});
		
		// Summary
		console.log('\n\n=== Summary ===');
		console.log(`Total users with blank role: ${blankRoleUsers.length}`);
		const withPriority = results.filter((r) => r.hasAnyPriority).length;
		const withoutPriority = results.filter((r) => !r.hasAnyPriority).length;
		console.log(`Users with priority role: ${withPriority}`);
		console.log(`Users without priority role: ${withoutPriority}`);
		
		// Count by each priority role
		console.log('\n=== Breakdown by Priority Role ===');
		PRIORITY_ROLES.forEach((pr) => {
			const count = results.filter((r) => r.highestRole === pr.label).length;
			if (count > 0) {
				console.log(`${pr.label}: ${count}`);
			}
		});
		
		process.exit(0);
	} catch (err) {
		console.error('Error:', err);
		process.exit(1);
	}
});

client.login(token);

