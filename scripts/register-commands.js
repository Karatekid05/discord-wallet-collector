import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
	console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID');
	process.exit(1);
}

const commands = [
	{
		name: 'submit-wallet-setup',
		description: 'Post the wallet submission message in this channel',
	},
	{
		name: 'refresh-wallet-roles',
		description: 'Refresh stored roles for submitted wallets',
	},
	{
		name: 'fill-monad-airdrop-role',
		description: 'Fill blank roles with Monad Airdrop if user has that role',
	},
	{
		name: 'prune-no-priority-roles',
		description: 'Remove sheet entries for users without any priority role',
	},
	{
		name: 'debug-user-roles',
		description: 'List all roles of a user (for finding role IDs)',
		options: [
			{
				name: 'user',
				description: 'The user to check',
				type: 6, // USER type
				required: true,
			},
		],
	},
];

const rest = new REST({ version: '10' }).setToken(token);

async function main() {
	try {
		if (guildId) {
			await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
			console.log('Registered guild commands.');
		} else {
			await rest.put(Routes.applicationCommands(clientId), { body: commands });
			console.log('Registered global commands.');
		}
	} catch (err) {
		console.error(err);
		process.exit(1);
	}
}

main();


