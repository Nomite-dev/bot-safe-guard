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
    client.user.setActivity('Protéger le serveur | !help', { type: 3 });
});

// --- ÉVÉNEMENT : ARRIVÉE SUR UN NOUVEAU SERVEUR ---
client.on('guildCreate', async (guild) => {
    console.log(`🎉 Le bot a été ajouté sur un nouveau serveur : ${guild.name} (${guild.memberCount} membres)`);

    try {
        const targetChannel = guild.systemChannel || guild.channels.cache.find(ch => ch.isTextBased() && ch.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages));

        if (!targetChannel) return;

        const welcomeMessage = `
🛡️ **Merci d'avoir invité n0mit Safeguard !**
*Développé par **n0mit CoreSystems** (créateurs de n0mit SchoolBot)*

Je suis un bot de sécurité et de modération autonome, conçu pour protéger votre communauté contre les raids, les spams et les liens malveillants.

---

### ⚙️ **Comment ça fonctionne ?**
• **Protections automatiques :** Je filtre instantanément les liens d'invitation Discord et je bloque les abus de mentions \`@everyone\` (avec sanction automatique).
• **Commandes de modération :** Vos modérateurs disposent d'outils rapides pour gérer les urgences en un clin d'œil.

---

### 📜 **Liste des commandes (\`!\`) :**

**🛠️ Modération & Urgence :**
• \`!lockdown on/off\` : Verrouille ou déverrouille instantanément le salon textuel.
• \`!kick @membre [raison]\` : Expulse un membre du serveur.
• \`!ban @membre [raison]\` : Bannit définitivement un utilisateur.
• \`!mute @membre [minutes] [raison]\` : Met un membre en sourdine (timeout).
• \`!clear [1-100]\` : Supprime un lot de messages récents.

**📊 Utilitaires :**
• \`!serverinfo\` : Affiche les informations de sécurité du serveur.
• \`!help\` : Affiche ce menu d'aide à tout moment.

---
*Assurez-vous que mon rôle est bien placé en haut de la liste des rôles pour que les modérations fonctionnent correctement !*
        `;

        await targetChannel.send(welcomeMessage);
    } catch (err) {
        console.error("Erreur lors de l'envoi du message d'accueil :", err);
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
            return message.channel.send(`⚠️ ${message.author}, les liens d'invitation vers d'autres serveurs sont interdits ici !`);
        }
    }

    // 2. Anti-Spam @everyone / @here
    if (message.mentions.everyone && !message.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
        await message.delete().catch(() => {});
        try {
            await message.member.timeout(5 * 60 * 1000, "Spam de mention @everyone / @here");
        } catch (e) {}
        return message.channel.send(`🚨 ${message.author}, tentative de spam de mention détectée (Utilisateur muté 5 min).`);
    }

    // ==========================================
    // ⚙️ COMMANDES DE MODÉRATION & UTILITAIRES
    // ==========================================

    // 3. Commande !help
    if (message.content === '!help' || message.content === '.help') {
        const helpText = `
🛡️ **--- MENU D'AIDE DU BOT DE SÉCURITÉ ---** 🛡️
*Par **n0mit CoreSystems***

**🛠️ Commandes de Modération :**
• \`!lockdown on/off\` : Verrouille ou déverrouille le salon actuel.
• \`!kick @membre [raison]\` : Expulse un membre du serveur.
• \`!ban @membre [raison]\` : Bannit définitivement un membre.
• \`!mute @membre [minutes] [raison]\` : Rend un membre muet temporairement.
• \`!clear [1-100]\` : Supprime un nombre précis de messages.

**📊 Utilitaires & Infos :**
• \`!serverinfo\` : Affiche les informations de sécurité du serveur.

**🔒 Protections Actives en Fond :**
• Anti-Invitations Discord automatiques.
• Anti-Spam de mentions \`@everyone\` (avec auto-timeout).
        `;
        return message.reply(helpText);
    }

    // 4. Commande !lockdown
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

    // 5. Commande !kick
    if (message.content.startsWith('!kick')) {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return message.reply("❌ Tu n'as pas la permission d'expulser des membres.");
        }

        const memberToKick = message.mentions.members.first();
        if (!memberToKick) {
            return message.reply("⚠️ Utilisation : `!kick @utilisateur [raison]`");
        }

        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison spécifiée";

        try {
            await memberToKick.kick(reason);
            return message.channel.send(`👢 **${memberToKick.user.tag}** a été expulsé. Raison : *${reason}*`);
        } catch (error) {
            return message.reply("❌ Je n'ai pas réussi à expulser ce membre (vérifie mes permissions).");
        }
    }

    // 6. Commande !ban
    if (message.content.startsWith('!ban')) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply("❌ Tu n'as pas la permission de bannir des membres.");
        }

        const memberToBan = message.mentions.members.first();
        if (!memberToBan) {
            return message.reply("⚠️ Utilisation : `!ban @utilisateur [raison]`");
        }

        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison spécifiée";

        try {
            await memberToBan.ban({ reason: reason });
            return message.channel.send(`🔨 **${memberToBan.user.tag}** a été banni du serveur. Raison : *${reason}*`);
        } catch (error) {
            return message.reply("❌ Je n'ai pas réussi à bannir ce membre.");
        }
    }

    // 7. Commande !mute
    if (message.content.startsWith('!mute')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply("❌ Tu n'as pas la permission de rendre des membres muets.");
        }

        const args = message.content.split(' ');
        const memberToMute = message.mentions.members.first();
        const durationMinutes = parseInt(args[2]);

        if (!memberToMute || isNaN(durationMinutes)) {
            return message.reply("⚠️ Utilisation : `!mute @utilisateur [durée_en_minutes] [raison]`");
        }

        const reason = args.slice(3).join(' ') || "Aucune raison spécifiée";
        const durationMs = durationMinutes * 60 * 1000;

        try {
            await memberToMute.timeout(durationMs, reason);
            return message.channel.send(`🔇 **${memberToMute.user.tag}** a été réduit au silence pendant ${durationMinutes} minute(s). Raison : *${reason}*`);
        } catch (error) {
            return message.reply("❌ Erreur lors du mute (vérifie que mon rôle est bien au-dessus du sien).");
        }
    }

    // 8. Commande !clear
    if (message.content.startsWith('!clear')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply("❌ Tu n'as pas la permission de gérer les messages.");
        }

        const args = message.content.split(' ');
        const count = parseInt(args[1]);

        if (isNaN(count) || count < 1 || count > 100) {
            return message.reply("⚠️ Utilisation : `!clear [nombre entre 1 et 100]`");
        }

        try {
            await message.delete().catch(() => {});
            const deleted = await message.channel.bulkDelete(count, true);
            const confirmation = await message.channel.send(`🧹 ${deleted.size} messages ont été supprimés avec succès !`);
            setTimeout(() => confirmation.delete().catch(() => {}), 3000);
        } catch (error) {
            return message.reply("❌ Erreur (je ne peux pas supprimer des messages de plus de 14 jours).");
        }
    }

    // 9. Commande !serverinfo
    if (message.content === '!serverinfo') {
        const guild = message.guild;
        const infoMsg = `
📊 **Informations de sécurité du serveur : ${guild.name}**
• 👑 Propriétaire ID : \`${guild.ownerId}\`
• 👥 Nombre de membres : \`${guild.memberCount}\`
• 📅 Date de création : \`${guild.createdAt.toLocaleDateString()}\`
• 🔒 Niveau de vérification Discord : \`${guild.verificationLevel}\`
        `;
        return message.reply(infoMsg);
    }
});

client.login(TOKEN);
