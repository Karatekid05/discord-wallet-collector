import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token || !guildId) {
	console.error('Missing DISCORD_TOKEN or GUILD_ID in environment');
	process.exit(1);
}

const REQUIRED_ROLES = [
	'Admin',
	'Mongang Team',
	'Community Team',
	'Alpha Boss',
	'Boss',
	"Mongang's friends",
	'Alpha',
	'Free Mint',
	'Mafia',
	'Capo',
	'Monad Eligible',
	'Fast Shooter',
	'Mongang Lover',
	'Mad Gang',
];

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
	try {
		const guild = await client.guilds.fetch(guildId);
		const roles = await guild.roles.fetch();
		
		console.log('\n=== All Roles in Server ===\n');
		const roleMap = new Map();
		roles.forEach((role) => {
			if (role.id !== guildId) { // Exclude @everyone
				roleMap.set(role.name.toLowerCase(), { id: role.id, name: role.name });
			}
		});
		
		// Sort by name for display
		const sortedRoles = Array.from(roleMap.values()).sort((a, b) => a.name.localeCompare(b.name));
		sortedRoles.forEach((r) => {
			console.log(`${r.name.padEnd(30)} ${r.id}`);
		});
		
		console.log('\n=== Finding Required Role IDs ===\n');
		const found = [];
		const missing = [];
		
		for (const requiredName of REQUIRED_ROLES) {
			const lower = requiredName.toLowerCase();
			const exact = roleMap.get(lower);
			if (exact) {
				found.push({ name: requiredName, id: exact.id, label: exact.name });
				console.log(`✓ ${requiredName.padEnd(25)} -> ${exact.id}`);
			} else {
				// Try partial match
				const partial = Array.from(roleMap.values()).find((r) => 
					r.name.toLowerCase().includes(lower) || lower.includes(r.name.toLowerCase())
				);
				if (partial) {
					found.push({ name: requiredName, id: partial.id, label: partial.name });
					console.log(`~ ${requiredName.padEnd(25)} -> ${partial.id} (matched: ${partial.name})`);
				} else {
					missing.push(requiredName);
					console.log(`✗ ${requiredName.padEnd(25)} -> NOT FOUND`);
				}
			}
		}
		
		console.log('\n=== Summary ===');
		console.log(`Found: ${found.length}/${REQUIRED_ROLES.length}`);
		if (missing.length > 0) {
			console.log(`Missing: ${missing.join(', ')}`);
		}
		
		// Build final array maintaining REQUIRED_ROLES order
		const finalArray = [];
		const foundMap = new Map(found.map((f) => [f.name, f]));
		for (const requiredName of REQUIRED_ROLES) {
			const foundItem = foundMap.get(requiredName);
			if (foundItem) {
				finalArray.push(foundItem);
			}
		}
		
		// Generate updated PRIORITY_ROLES array
		console.log('\n=== Updated PRIORITY_ROLES Array (maintaining hierarchy order) ===\n');
		const priorityArray = finalArray.map((f) => `\t{ id: '${f.id}', label: '${f.label}' },`).join('\n');
		console.log('const PRIORITY_ROLES = [');
		console.log(priorityArray);
		console.log('];\n');
		
		// Update bot.js automatically
		const fs = await import('fs');
		const path = await import('path');
		const botJsPath = path.join(process.cwd(), 'src', 'bot.js');
		let botJsContent = fs.readFileSync(botJsPath, 'utf8');
		
		// Find and replace PRIORITY_ROLES array
		const oldArrayRegex = /const PRIORITY_ROLES = \[[\s\S]*?\];/;
		const newArray = `const PRIORITY_ROLES = [\n${finalArray.map((f) => `\t{ id: '${f.id}', label: '${f.label}' },`).join('\n')}\n];`;
		
		if (oldArrayRegex.test(botJsContent)) {
			botJsContent = botJsContent.replace(oldArrayRegex, newArray);
			fs.writeFileSync(botJsPath, botJsContent, 'utf8');
			console.log('✓ Updated src/bot.js with found role IDs\n');
		} else {
			console.log('⚠ Could not find PRIORITY_ROLES array to update\n');
		}
		
		process.exit(0);
	} catch (err) {
		console.error('Error:', err);
		process.exit(1);
	}
});

client.login(token);

