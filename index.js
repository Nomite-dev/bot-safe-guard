const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } = require('discord.js');
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
// ⚠️ REMPLACE AVEC TON ID DISCORD POUR LA COMMANDE DE DIFFUSION (!broadcast)
const OWNER_ID = "1440037449546989701"; 

const UNIFIED_CHANNEL_NAME = "📢｜nomit-coresystems";

client.on('ready', () => {
    console.log(`🛡️ n0mit Safeguard connecté en tant que ${client.user.tag}`);
    client.user.setActivity('Protéger l\'établissement | !help', { type: 3 });
});

// --- FONCTION : RÉCUPÉRER OU CRÉER LE SALON UNIFIÉ ---
async function getOrCreateCoreChannel(guild) {
    try {
        // 1. Cherche si le salon existe déjà (créé par SchoolBot ou Safeguard)
        let channel = guild.channels.cache.find(ch => 
            ch.name.toLowerCase().includes("nomit-coresystems") || 
            ch.name.toLowerCase().includes("nomit-info")
        );

        // 2. Si non trouvé, on le crée proprement
        if (!channel) {
            channel = await guild.channels.create({
                name: UNIFIED_CHANNEL_NAME,
                type: ChannelType.GuildText,
                topic: "Annonces et informations système officielles de n0mit CoreSystems.",
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.SendMessages],
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
                    },
                    {
                        id: guild.members.me.id,
                        allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks]
                    }
                ]
            });
        }
        return channel;
    } catch (error) {
        console.error(`Impossible de créer/récupérer le salon sur ${guild.name}:`, error);
        return guild.systemChannel; // Fallback
    }
}

// --- ÉVÉNEMENT : ARRIVÉE SUR UN NOUVEAU SERVEUR ---
client.on('guildCreate', async (guild) => {
    console.log(`🎉 Le bot a été ajouté sur : ${guild.name} (${guild.memberCount} membres)`);

    try {
        const targetChannel = await getOrCreateCoreChannel(guild);
        if (!targetChannel) return;

        const welcomeMessage = `
🛡️ **n0mit Safeguard est désormais opérationnel !**
*Écosystème **n0mit CoreSystems***

Ce bot assure la sécurité et la modération automatique de votre établissement.

⚙️ **Protections actives :**
• Filtration des liens d'invitations externes.
• Anti-spam des mentions globales (\`@everyone\` / \`@here\`).
• Outils de modération administrative d'urgence.

📌 **Information :** Ce salon (\`#${targetChannel.name}\`) est mutualisé pour recevoir les mises à jour et annonces importantes de l'écosystème **n0mit CoreSystems**.

 Tapez \`!help\` pour afficher l'ensemble des commandes disponibles.
        `;

        await targetChannel.send(welcomeMessage);
    } catch (err) {
        console.error("Erreur lors de l'accueil :", err);
    }
});

// --- ÉVÉNEMENT : GESTION DES MESSAGES ET COMMANDES ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // ==========================================
    // 🛡️ PROTECTIONS AUTOMATIQUES
    // ==========================================

    // 1. Anti-Invite Discord
    const discordInviteRegex = /(discord\.(gg|me|com)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i;
    if (discordInviteRegex.test(message.content)) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            await message.delete().catch(() => {});
            return message.channel.send(`⚠️ ${message.author}, les liens d'invitation externe sont interdits.`);
        }
    }

    // 2. Anti-Spam @everyone / @here
    if (message.mentions.everyone && !message.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
        await message.delete().catch(() => {});
        try {
            await message.member.timeout(5 * 60 * 1000, "Spam de mention globale");
        } catch (e) {}
        return message.channel.send(`🚨 ${message.author}, abus de mention globale détecté (Exclusion temporaire 5 min).`);
    }

    // ==========================================
    // ⚙️ COMMANDES DE MODÉRATION & SÉCURITÉ
    // ==========================================

    // Commande !help
    if (message.content === '!help' || message.content === '.help') {
        const helpText = `
🛡️ **--- MANUEL DE SÉCURITÉ n0mit Safeguard ---** 🛡️
*n0mit CoreSystems*

**🛠️ Modération & Sanctions :**
• \`!warn @membre [raison]\` : Émet un avertissement officiel.
• \`!mute @membre [minutes] [raison]\` : Rend un membre muet temporairement.
• \`!unmute @membre\` : Rétablit la parole d'un membre.
• \`!kick @membre [raison]\` : Expulse un membre de l'établissement.
• \`!ban @membre [raison]\` : Bannit définitivement un utilisateur.
• \`!unban [ID_utilisateur]\` : Révoque le bannissement d'un utilisateur.

**🚨 Gestion de Crise & Salons :**
• \`!lockdown on/off\` : Verrouille ou déverrouille le salon actuel.
• \`!slowmode [secondes]\` : Active un délai d'attente entre les messages (0 pour désactiver).
• \`!clear [1-100]\` : Purge un nombre précis de messages.
• \`!nuke\` : Recommence le salon à neuf en cas de raid extrême (Admins).

**📊 Utilitaires :**
• \`!serverinfo\` : Rapport de sécurité et statistiques du serveur.
        `;
        return message.reply(helpText);
    }

    // Commande !warn
    if (message.content.startsWith('!warn')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply("❌ Permission insuffisante.");
        }
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!warn @membre [raison]`");
        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison spécifiée";
        
        return message.channel.send(`⚠️ **AVERTISSEMENT** : ${member} a reçu un avertissement officiel.\n📌 **Raison** : *${reason}*`);
    }

    // Commande !slowmode
    if (message.content.startsWith('!slowmode')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply("❌ Permission insuffisante.");
        }
        const args = message.content.split(' ');
        const seconds = parseInt(args[1]);

        if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
            return message.reply("⚠️ Utilisation : `!slowmode [secondes]` (0 à 21600).");
        }

        try {
            await message.channel.setRateLimitPerUser(seconds);
            return message.channel.send(`⏱️ Mode lent réglé à **${seconds} seconde(s)** sur ce salon.`);
        } catch (e) {
            return message.reply("❌ Erreur lors du réglage du mode lent.");
        }
    }

    // Commande !lockdown
    if (message.content.startsWith('!lockdown')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("❌ Réservé aux administrateurs.");
        }
        const state = message.content.split(' ')[1];

        if (state === 'on') {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            return message.channel.send("🚨 **SALON VERROUILLÉ.** Les envois de messages sont suspendus.");
        } else if (state === 'off') {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            return message.channel.send("✅ **SALON DÉVERROUILLÉ.** L'accès au salon est rétabli.");
        } else {
            return message.reply("Utilisation : `!lockdown on` ou `!lockdown off`");
        }
    }

    // Commande !mute
    if (message.content.startsWith('!mute')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply("❌ Permission insuffisante.");
        }
        const args = message.content.split(' ');
        const member = message.mentions.members.first();
        const duration = parseInt(args[2]);

        if (!member || isNaN(duration)) {
            return message.reply("⚠️ Utilisation : `!mute @membre [minutes] [raison]`");
        }

        const reason = args.slice(3).join(' ') || "Aucune raison spécifiée";
        try {
            await member.timeout(duration * 60 * 1000, reason);
            return message.channel.send(`🔇 **${member.user.tag}** a été réduit au silence pendant ${duration} minute(s).`);
        } catch (e) {
            return message.reply("❌ Impossible de rendre ce membre muet (vérifiez la hiérarchie des rôles).");
        }
    }

    // Commande !unmute
    if (message.content.startsWith('!unmute')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply("❌ Permission insuffisante.");
        }
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!unmute @membre`");

        try {
            await member.timeout(null);
            return message.channel.send(`🔊 Le silence appliqué à **${member.user.tag}** a été levé.`);
        } catch (e) {
            return message.reply("❌ Erreur lors de la levée du silence.");
        }
    }

    // Commande !kick
    if (message.content.startsWith('!kick')) {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return message.reply("❌ Permission insuffisante.");
        }
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!kick @membre [raison]`");
        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison spécifiée";

        try {
            await member.kick(reason);
            return message.channel.send(`👢 **${member.user.tag}** a été expulsé. Raison : *${reason}*`);
        } catch (e) {
            return message.reply("❌ Échec de l'expulsion.");
        }
    }

    // Commande !ban
    if (message.content.startsWith('!ban')) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply("❌ Permission insuffisante.");
        }
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!ban @membre [raison]`");
        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison spécifiée";

        try {
            await member.ban({ reason });
            return message.channel.send(`🔨 **${member.user.tag}** a été banni. Raison : *${reason}*`);
        } catch (e) {
            return message.reply("❌ Échec du bannissement.");
        }
    }

    // Commande !unban
    if (message.content.startsWith('!unban')) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply("❌ Permission insuffisante.");
        }
        const userId = message.content.split(' ')[1];
        if (!userId) return message.reply("⚠️ Utilisation : `!unban [ID_utilisateur]`");

        try {
            await message.guild.members.unban(userId);
            return message.channel.send(`✅ L'utilisateur avec l'ID \`${userId}\` a été débanni.`);
        } catch (e) {
            return message.reply("❌ Impossible de trouver ou débannir cet ID.");
        }
    }

    // Commande !clear
    if (message.content.startsWith('!clear')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply("❌ Permission insuffisante.");
        }
        const count = parseInt(message.content.split(' ')[1]);

        if (isNaN(count) || count < 1 || count > 100) {
            return message.reply("⚠️ Utilisation : `!clear [1-100]`");
        }

        try {
            await message.delete().catch(() => {});
            const deleted = await message.channel.bulkDelete(count, true);
            const msg = await message.channel.send(`🧹 **${deleted.size}** messages supprimés.`);
            setTimeout(() => msg.delete().catch(() => {}), 3000);
        } catch (e) {
            return message.reply("❌ Erreur (les messages de plus de 14 jours ne peuvent pas être supprimés en masse).");
        }
    }

    // Commande !nuke (Copie & Supprime le salon)
    if (message.content === '!nuke') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("❌ Réservé aux administrateurs.");
        }
        try {
            const position = message.channel.position;
            const newChannel = await message.channel.clone();
            await message.channel.delete();
            await newChannel.setPosition(position);
            return newChannel.send("💥 **SALON REINITIALISÉ.** Ce salon a été entièrement réinitialisé par un administrateur.");
        } catch (e) {
            return message.reply("❌ Échec du nuke.");
        }
    }

    // Commande !serverinfo
    if (message.content === '!serverinfo') {
        const guild = message.guild;
        const infoMsg = `
📊 **Rapport de Sécurité : ${guild.name}**
• 👑 ID Propriétaire : \`${guild.ownerId}\`
• 👥 Membres inscrits : \`${guild.memberCount}\`
• 📅 Création de l'instance : \`${guild.createdAt.toLocaleDateString()}\`
• 🔒 Niveau de sécurité Discord : \`${guild.verificationLevel}\`
        `;
        return message.reply(infoMsg);
    }

    // ==========================================
    // 📢 COMMANDE PROPRIÉTAIRE : DIFFUSION NATIONALE/ACADÉMIQUE
    // ==========================================
    if (message.content.startsWith('!broadcast')) {
        if (message.author.id !== OWNER_ID) {
            return message.reply("❌ Seul le développeur n0mit CoreSystems peut exécuter une diffusion globale.");
        }

        const announcement = message.content.split(' ').slice(1).join(' ');
        if (!announcement) {
            return message.reply("⚠️ Utilisation : `!broadcast [texte du message]`");
        }

        let successCount = 0;
        message.reply("🔄 Diffusion du message sur l'ensemble des établissements...");

        for (const guild of client.guilds.cache.values()) {
            try {
                const targetChannel = await getOrCreateCoreChannel(guild);
                if (targetChannel) {
                    await targetChannel.send(`📢 **COMMUNIQUÉ OFFICIEL n0mit CoreSystems**\n\n${announcement}`);
                    successCount++;
                }
            } catch (err) {
                console.error(`Erreur de diffusion sur ${guild.name}:`, err);
            }
        }

        return message.channel.send(`✅ Message diffusé avec succès sur **${successCount}** serveur(s).`);
    }
});

client.login(TOKEN);
