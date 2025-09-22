import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, EmbedBuilder } from 'discord.js';
import { upsertWallet, getWallet, ensureSheetSetup } from './sheets.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
	console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in environment');
	process.exit(1);
}

// Role priority (highest to lowest)
const PRIORITY_ROLES = [
    { id: '1416902471124652204', label: 'Free Mint pass' },
    { id: '1353403039200972830', label: 'Mafia' },
    { id: '1353402893532659732', label: 'Capo' },
    { id: '1413980753053745263', label: '(Collab)' },
    { id: '1353402683247165561', label: 'Fast Shooter' },
];

async function getMemberRoleIds(interaction) {
    if (!interaction.guild) return new Set();
    const member = interaction.member;
    // Try to read roles from the interaction payload
    if (member && member.roles) {
        // Cached GuildMember
        if ('cache' in member.roles) {
            try {
                return new Set(member.roles.cache.map((r) => r.id));
            } catch {}
        }
        // Raw roles array from API payload
        if (Array.isArray(member.roles)) {
            return new Set(member.roles);
        }
    }
    // Fallback: fetch full member (requires GuildMembers intent)
    try {
        const fullMember = await interaction.guild.members.fetch(interaction.user.id);
        return new Set(fullMember.roles.cache.map((r) => r.id));
    } catch {
        return new Set();
    }
}

async function getHighestPriorityRoleLabel(interaction) {
    try {
        const roleIds = await getMemberRoleIds(interaction);
        const found = PRIORITY_ROLES.find((r) => roleIds.has(r.id));
        return found ? found.label : '';
    } catch {
        return '';
    }
}

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
	],
	partials: [Partials.Channel],
});

client.once('ready', () => {
	console.log(`Logged in as ${client.user.tag}`);
});

// No sticky reposting; deletion is governed by Discord permissions (Manage Messages)

// Register commands on startup (guild-scoped if GUILD_ID provided, otherwise global)
async function registerCommands() {
	const commands = [
		{
			name: 'submit-wallet-setup',
			description: 'Post the wallet submission message in this channel',
		},
	];
	const rest = new REST({ version: '10' }).setToken(token);
	try {
		if (process.env.GUILD_ID) {
			await rest.put(
				Routes.applicationGuildCommands(clientId, process.env.GUILD_ID),
				{ body: commands },
			);
			console.log('Guild commands registered.');
		} else {
			await rest.put(Routes.applicationCommands(clientId), { body: commands });
			console.log('Global commands registered (may take up to 1 hour to appear).');
		}
	} catch (err) {
		console.error('Failed to register commands:', err);
	}
}

client.on('interactionCreate', async (interaction) => {
	try {
		if (interaction.isChatInputCommand()) {
			if (interaction.commandName === 'submit-wallet-setup') {
				const submitButton = new ButtonBuilder()
					.setCustomId('submit_wallet')
					.setLabel('Submit Wallet')
					.setStyle(ButtonStyle.Success);

				const statusButton = new ButtonBuilder()
					.setCustomId('check_status')
					.setLabel('Check Status')
					.setStyle(ButtonStyle.Primary);

				const row = new ActionRowBuilder().addComponents(submitButton, statusButton);

				const embed = new EmbedBuilder()
					.setDescription('Submit your wallet')
					.setColor(0x2b2d31);

				await interaction.reply({
					embeds: [embed],
					components: [row],
					allowedMentions: { parse: [] },
				});
			}
		}

		if (interaction.isButton()) {
			if (interaction.customId === 'submit_wallet') {
				const modal = new ModalBuilder()
					.setCustomId('wallet_modal')
					.setTitle('Submit your EVM wallet');

				const walletInput = new TextInputBuilder()
					.setCustomId('wallet_address')
					.setLabel('EVM wallet address (0x...)')
					.setStyle(TextInputStyle.Short)
					.setPlaceholder('0x...')
					.setRequired(true)
					.setMaxLength(100);

				const row = new ActionRowBuilder().addComponents(walletInput);
				modal.addComponents(row);
				await interaction.showModal(modal);
			}

			if (interaction.customId === 'check_status') {
				await interaction.deferReply({ ephemeral: true });
				const record = await getWallet(interaction.user.id);
				if (!record) {
					await interaction.editReply('You have not submitted a wallet yet.');
					return;
				}
				const embed = new EmbedBuilder()
					.setTitle('Wallet Submission')
					.addFields(
						{ name: 'Discord Username', value: record.discordUsername || 'Unknown', inline: true },
						{ name: 'Discord ID', value: record.discordId, inline: true },
						{ name: 'EVM Wallet', value: record.wallet || 'N/A' },
						{ name: 'Role', value: record.role || 'N/A', inline: true },
					)
					.setColor(0x2ecc71);
				await interaction.editReply({ embeds: [embed] });
			}
		}

		if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'wallet_modal') {
			// Defer immediately to avoid interaction timeout on first use
            await interaction.deferReply({ ephemeral: true });

			const wallet = interaction.fields.getTextInputValue('wallet_address').trim();
			// very basic 0x address check; no checksum validation
			const isLikelyEvm = /^0x[a-fA-F0-9]{40}$/.test(wallet);
			if (!isLikelyEvm) {
				await interaction.editReply('Invalid EVM address. Please submit a 0x... address.');
				return;
			}
			const discordId = interaction.user.id;
			const discordUsername = `${interaction.user.username}#${interaction.user.discriminator ?? ''}`.replace(/#$/,'');
			const role = await getHighestPriorityRoleLabel(interaction);
			const result = await upsertWallet({ discordId, discordUsername, wallet, role });
			await interaction.editReply(`Wallet ${result.action === 'updated' ? 'updated' : 'saved'} successfully.`);
		}
	} catch (err) {
		console.error('Interaction error:', err);
		try {
			if ('deferred' in interaction && interaction.deferred) {
				await interaction.editReply('There was an error. Please try again.');
			} else if ('replied' in interaction && interaction.replied) {
				await interaction.followUp({ content: 'There was an error. Please try again.', ephemeral: true });
			} else if (interaction.isRepliable()) {
				await interaction.reply({ content: 'There was an error. Please try again.', ephemeral: true });
			}
		} catch {}
	}
});

// Warm up Sheets (creates sheet and headers if needed) and register commands
await ensureSheetSetup().catch((err) => {
	console.error('Sheets warm-up failed:', err);
});
await registerCommands();
client.login(token);


