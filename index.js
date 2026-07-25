const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const http = require('http');

// --- PETIT SERVEUR WEB POUR GARDER RENDER GRATUIT ---
http.createServer((req, res) => {
    res.write("Bot de securite en ligne !");
    res.end();
}).listen(process.env.PORT || 3000);

// --- CONFIGURATION DU BOT DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;

client.on('ready', () => {
    console.log(`🛡️ Bot de sécurité connecté en tant que ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // 1. Anti-Invite
    const discordInviteRegex = /(discord\.(gg|me|com)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i;
    if (discordInviteRegex.test(message.content)) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            await message.delete().catch(() => {});
            return message.channel.send(`⚠️ ${message.author}, les liens d'invitation sont interdits ici !`);
        }
    }

    // 2. Anti-Spam @everyone
    if (message.mentions.everyone && !message.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
        await message.delete().catch(() => {});
        return message.channel.send(`🚨 ${message.author}, tentative de spam de mention détectée.`);
    }

    // 3. Commande !lockdown
    if (message.content.startsWith('!lockdown')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("❌ Tu n'as pas la permission d'utiliser cette commande d'urgence.");
        }

        const args = message.content.split(' ');
        const state = args[1];

        if (state === 'on') {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            return message.channel.send("🚨 **SALON VERROUILLÉ.** Plus personne ne peut envoyer de messages ici.");
        } else if (state === 'off') {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            return message.channel.send("✅ **SALON DÉVERROUILLÉ.** Les discussions peuvent reprendre.");
        } else {
            return message.reply("Utilisation : `!lockdown on` ou `!lockdown off`");
        }
    }
});

client.login(TOKEN);

