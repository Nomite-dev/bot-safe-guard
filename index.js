// ============================================================================
// 🛡️ n0mit Safeguard - Système de Sécurité Écosystème n0mit CoreSystems
// ============================================================================

const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } = require('discord.js');
const http = require('http');

// ============================================================================
// 1. SERVEUR WEB KEEP-ALIVE (Render Free Tier)
// ============================================================================
http.createServer((req, res) => {
    res.write("n0mit Safeguard Core System Online!");
    res.end();
}).listen(process.env.PORT || 3000);

// ============================================================================
// 2. CONFIGURATION INITIALE & CONFIGURATION EN MÉMOIRE
// ============================================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = "1440037449546989701"; 
const UNIFIED_CHANNEL_NAME = "📢｜n0mit-coresystems";

// Configuration dynamique par serveur (Stockée en mémoire)
const guildConfigs = new Map();

function getConfig(guildId) {
    if (!guildConfigs.has(guildId)) {
        guildConfigs.set(guildId, {
            antiInvite: true,      // Supprime les pubs
            antiPhishing: true,    // Supprime les liens malveillants/scams
            antiEveryone: true,    // Bloque le spam @everyone
            antiGhostPing: true,   // Détecte les pings supprimés
            antiRaid: false,       // Sécurité renforcée lors des arrivées
            logChannelId: null     // Salon de logs de sécurité
        });
    }
    return guildConfigs.get(guildId);
}

// Helper pour envoyer les logs de sécurité silencieux
async function sendSecurityLog(guild, content) {
    const cfg = getConfig(guild.id);
    if (!cfg.logChannelId) return;
    try {
        const logChannel = guild.channels.cache.get(cfg.logChannelId);
        if (logChannel) {
            await logChannel.send(`🛡️ **[LOG SÉCURITÉ]** ${content}`);
        }
    } catch (e) {
        console.error("Erreur d'envoi du log :", e);
    }
}

// ============================================================================
// 3. GESTION DU SALON UNIFIÉ (n0mit CoreSystems)
// ============================================================================
async function getOrCreateCoreChannel(guild) {
    try {
        let channel = guild.channels.cache.find(ch => 
            ch.name.toLowerCase().includes("n0mit-coresystems") || 
            ch.name.toLowerCase().includes("n0mit-info")
        );

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
        console.error(`Erreur création salon unifié sur ${guild.name}:`, error);
        return guild.systemChannel;
    }
}

// ============================================================================
// 4. ÉVÉNEMENTS DU CLIENT (Ready, GuildCreate, MemberAdd, MessageDelete)
// ============================================================================
client.on('ready', () => {
    console.log(`🛡️ n0mit Safeguard opérationnel sur ${client.guilds.cache.size} serveur(s).`);
    client.user.setActivity('Protéger l\'établissement | !help', { type: 3 });
});

client.on('guildCreate', async (guild) => {
    console.log(`🎉 Nouveau serveur : ${guild.name} (${guild.memberCount} membres)`);
    try {
        const targetChannel = await getOrCreateCoreChannel(guild);
        if (!targetChannel) return;

        const welcomeMessage = `
🛡️ **n0mit Safeguard est désormais opérationnel !**
*Écosystème **n0mit CoreSystems***

Ce bot assure la protection et la modération autonome de votre établissement.

⚙️ **Protections passives actives :**
• Filtration des liens d'invitations externes & liens frauduleux.
• Protection contre le spam de mentions globales (\`@everyone\` / \`@here\`).
• Détection des pings fantômes (Ghost-pings).
• Outils administratifs d'urgence non-intrusifs.

📌 **Information :** Ce salon (\`#${targetChannel.name}\`) est mutualisé pour recevoir les mises à jour de l'écosystème.

Tapez \`!help\` pour afficher le manuel d'utilisation.
        `;

        await targetChannel.send(welcomeMessage);
    } catch (err) {
        console.error("Erreur lors de l'accueil :", err);
    }
});

// Protection Anti-Raid à l'arrivée d'un membre
client.on('guildMemberAdd', async (member) => {
    const cfg = getConfig(member.guild.id);
    if (!cfg.antiRaid) return;

    // Si le compte a moins de 24h et que l'anti-raid est ON
    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 1) {
        try {
            await member.timeout(24 * 60 * 60 * 1000, "Anti-Raid Actif : Compte créé il y a moins de 24h.");
            await sendSecurityLog(member.guild, `🚨 **Anti-Raid** : Le compte très récent de ${member} (${member.user.tag}) a été mis en quarantaine temporaire.`);
        } catch (e) {}
    }
});

// Détection des Ghost-Pings (Mentions supprimées)
client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;
    const cfg = getConfig(message.guild.id);
    if (!cfg.antiGhostPing) return;

    if (message.mentions.members.size > 0 || message.mentions.roles.size > 0) {
        await sendSecurityLog(message.guild, `👻 **Ghost Ping détecté** dans <#${message.channel.id}> par **${message.author.tag}**.`);
    }
});


// ============================================================================
// 5. GESTION DES MESSAGES & FILTRES DE SÉCURITÉ PASSIFS
// ============================================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const cfg = getConfig(message.guild.id);
    const isStaff = message.member.permissions.has(PermissionFlagsBits.ManageMessages);

    // ------------------------------------------------------------------------
    // FILTRE 1 : Anti-Invite Discord
    // ------------------------------------------------------------------------
    if (cfg.antiInvite && !isStaff) {
        const inviteRegex = /(discord\.(gg|me|com)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i;
        if (inviteRegex.test(message.content)) {
            await message.delete().catch(() => {});
            await sendSecurityLog(message.guild, `🚫 Invitation supprimée de **${message.author.tag}** dans <#${message.channel.id}>.`);
            return message.channel.send(`⚠️ ${message.author}, les invitations externes ne sont pas autorisées ici.`);
        }
    }

    // ------------------------------------------------------------------------
    // FILTRE 2 : Anti-Phishing & Liens Malveillants
    // ------------------------------------------------------------------------
    if (cfg.antiPhishing && !isStaff) {
        const scamRegex = /(steamcommun|discord-gift|free-nitro|steam-promo|airdrop-gift|grabify|iplogger)/i;
        if (scamRegex.test(message.content)) {
            await message.delete().catch(() => {});
            try {
                await message.member.timeout(15 * 60 * 1000, "Lien frauduleux/Phishing détecté");
            } catch(e) {}
            await sendSecurityLog(message.guild, `🚨 **Lien Suspect/Phishing** supprimé de **${message.author.tag}** (Membre muté 15 min).`);
            return message.channel.send(`🚨 ${message.author}, tentative d'envoi de lien malveillant détectée.`);
        }
    }

    // ------------------------------------------------------------------------
    // FILTRE 3 : Anti-Spam Mention Global (@everyone / @here)
    // ------------------------------------------------------------------------
    if (cfg.antiEveryone && message.mentions.everyone && !message.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
        await message.delete().catch(() => {});
        try {
            await message.member.timeout(10 * 60 * 1000, "Spam de mention globale");
        } catch (e) {}
        await sendSecurityLog(message.guild, `🚨 **Abus Mention Globale** par **${message.author.tag}** dans <#${message.channel.id}>.`);
        return message.channel.send(`🚨 ${message.author}, abus de mention globale interdit (Exclusion temporaire 10 min).`);
    }

    // ============================================================================
    // 6. COMMANDES DU BOT (!)
    // ============================================================================

    // --- COMMANDE : !help ---
    if (message.content === '!help' || message.content === '.help') {
        const helpText = `
🛡️ **--- MANUEL DE SÉCURITÉ n0mit Safeguard ---** 🛡️
*n0mit CoreSystems*

**🛠️ Modération & Sanctions :**
• \`!warn @membre [raison]\` : Émet un avertissement officiel.
• \`!mute @membre [minutes] [raison]\` : Met un membre en sourdine.
• \`!unmute @membre\` : Rétablit la parole d'un membre.
• \`!kick @membre [raison]\` : Expulse un membre.
• \`!ban @membre [raison]\` : Bannit définitivement un utilisateur.
• \`!unban [ID_utilisateur]\` : Débannit un utilisateur.

**🚨 Gestion de Crise & Salons :**
• \`!lockdown on/off\` : Verrouille ou déverrouille le salon actuel.
• \`!slowmode [secondes]\` : Configure le mode lent.
• \`!clear [1-100]\` : Nettoie un nombre précis de messages.
• \`!purgeuser @membre [1-100]\` : Supprime les messages récents d'un membre ciblé.
• \`!nuke\` : Recommence le salon à neuf en cas de raid extrême.

**⚙️ Configuration & Sécurité :**
• \`!config\` : Affiche et modifie l'état des modules de sécurité.
• \`!antiraid on/off\` : Active/Désactive le verrouillage des comptes récents.
• \`!setlog #salon\` : Définit le salon des logs de sécurité silencieux.
• \`!serverinfo\` : Rapport global de sécurité du serveur.
        `;
        return message.reply(helpText);
    }

    // --- COMMANDE : !config ---
    if (message.content.startsWith('!config')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const args = message.content.split(' ');
        const option = args[1]?.toLowerCase();
        const state = args[2]?.toLowerCase();

        if (!option) {
            return message.reply(`
⚙️ **Configuration des modules pour ce serveur :**
• \`anti-invite\` : ${cfg.antiInvite ? '✅ Activé' : '❌ Désactivé'}
• \`anti-phishing\` : ${cfg.antiPhishing ? '✅ Activé' : '❌ Désactivé'}
• \`anti-everyone\` : ${cfg.antiEveryone ? '✅ Activé' : '❌ Désactivé'}
• \`anti-ghostping\` : ${cfg.antiGhostPing ? '✅ Activé' : '❌ Désactivé'}
• \`anti-raid\` : ${cfg.antiRaid ? '🚨 Activé' : '⚪ Désactivé'}
• \`salon-log\` : ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'Aucun'}

*Exemple pour modifier : \`!config anti-invite off\`*
            `);
        }

        if (state !== 'on' && state !== 'off') {
            return message.reply("⚠️ Spécifiez `on` ou `off`. Exemple : `!config anti-invite off`");
        }

        const isTrue = state === 'on';
        if (option === 'anti-invite') cfg.antiInvite = isTrue;
        else if (option === 'anti-phishing') cfg.antiPhishing = isTrue;
        else if (option === 'anti-everyone') cfg.antiEveryone = isTrue;
        else if (option === 'anti-ghostping') cfg.antiGhostPing = isTrue;
        else return message.reply("⚠️ Module inconnu.");

        return message.reply(`✅ Module **${option}** réglé sur : **${state.toUpperCase()}**.`);
    }

    // --- COMMANDE : !antiraid ---
    if (message.content.startsWith('!antiraid')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("❌ Réservé aux administrateurs.");
        }
        const state = message.content.split(' ')[1]?.toLowerCase();

        if (state === 'on') {
            cfg.antiRaid = true;
            await sendSecurityLog(message.guild, `🚨 **Mode Anti-Raid ACTIVÉ** par ${message.author}.`);
            return message.channel.send("🚨 **MODE ANTI-RAID ACTIVÉ.** Les comptes de moins de 24h seront automatiquement mis en quarantaine.");
        } else if (state === 'off') {
            cfg.antiRaid = false;
            await sendSecurityLog(message.guild, `⚪ **Mode Anti-Raid DÉSACTIVÉ** par ${message.author}.`);
            return message.channel.send("✅ **MODE ANTI-RAID DÉSACTIVÉ.** Le flux d'arrivée normal est rétabli.");
        } else {
            return message.reply("Utilisation : `!antiraid on` ou `!antiraid off`");
        }
    }

    // --- COMMANDE : !setlog ---
    if (message.content.startsWith('!setlog')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("⚠️ Mentionnez un salon. Exemple : `!setlog #logs-sécurité`");

        cfg.logChannelId = channel.id;
        return message.reply(`✅ Salon des logs de sécurité défini sur : ${channel}`);
    }

    // --- COMMANDE : !purgeuser ---
    if (message.content.startsWith('!purgeuser')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const targetMember = message.mentions.members.first();
        const args = message.content.split(' ');
        const limit = parseInt(args[2]) || 50;

        if (!targetMember) return message.reply("⚠️ Utilisation : `!purgeuser @membre [limite 1-100]`");

        try {
            await message.delete().catch(() => {});
            const messages = await message.channel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(m => m.author.id === targetMember.id).first(limit);

            await message.channel.bulkDelete(userMessages, true);
            const confirmation = await message.channel.send(`🧹 Supprimé **${userMessages.length}** messages récents de ${targetMember}.`);
            setTimeout(() => confirmation.delete().catch(() => {}), 3000);
        } catch (e) {
            return message.reply("❌ Erreur lors du nettoyage ciblé.");
        }
    }

    // --- COMMANDE : !warn ---
    if (message.content.startsWith('!warn')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!warn @membre [raison]`");
        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison spécifiée";
        
        await sendSecurityLog(message.guild, `⚠️ **Avertissement** émis contre **${member.user.tag}** par **${message.author.tag}**. Raison : *${reason}*`);
        return message.channel.send(`⚠️ **AVERTISSEMENT** : ${member} a reçu un avertissement officiel.\n📌 **Raison** : *${reason}*`);
    }

    // --- COMMANDE : !slowmode ---
    if (message.content.startsWith('!slowmode')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply("❌ Permission insuffisante.");
        const seconds = parseInt(message.content.split(' ')[1]);

        if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
            return message.reply("⚠️ Utilisation : `!slowmode [secondes]` (0 pour désactiver).");
        }

        try {
            await message.channel.setRateLimitPerUser(seconds);
            return message.channel.send(`⏱️ Mode lent réglé à **${seconds}s** sur ce salon.`);
        } catch (e) {
            return message.reply("❌ Erreur de réglage du mode lent.");
        }
    }

    // --- COMMANDE : !lockdown ---
    if (message.content.startsWith('!lockdown')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Réservé aux administrateurs.");
        const state = message.content.split(' ')[1]?.toLowerCase();

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

    // --- COMMANDE : !mute ---
    if (message.content.startsWith('!mute')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply("❌ Permission insuffisante.");
        const args = message.content.split(' ');
        const member = message.mentions.members.first();
        const duration = parseInt(args[2]);

        if (!member || isNaN(duration)) {
            return message.reply("⚠️ Utilisation : `!mute @membre [minutes] [raison]`");
        }

        const reason = args.slice(3).join(' ') || "Aucune raison spécifiée";
        try {
            await member.timeout(duration * 60 * 1000, reason);
            await sendSecurityLog(message.guild, `🔇 **Mute** : **${member.user.tag}** par **${message.author.tag}** (${duration} min). Raison : *${reason}*`);
            return message.channel.send(`🔇 **${member.user.tag}** a été réduit au silence pendant ${duration} minute(s).`);
        } catch (e) {
            return message.reply("❌ Impossible de rendre ce membre muet.");
        }
    }

    // --- COMMANDE : !unmute ---
    if (message.content.startsWith('!unmute')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!unmute @membre`");

        try {
            await member.timeout(null);
            await sendSecurityLog(message.guild, `🔊 **Unmute** : **${member.user.tag}** par **${message.author.tag}**.`);
            return message.channel.send(`🔊 Le silence appliqué à **${member.user.tag}** a été levé.`);
        } catch (e) {
            return message.reply("❌ Erreur lors de la levée du silence.");
        }
    }

    // --- COMMANDE : !kick ---
    if (message.content.startsWith('!kick')) {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!kick @membre [raison]`");
        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison spécifiée";

        try {
            await member.kick(reason);
            await sendSecurityLog(message.guild, `👢 **Expulsion** : **${member.user.tag}** par **${message.author.tag}**. Raison : *${reason}*`);
            return message.channel.send(`👢 **${member.user.tag}** a été expulsé.`);
        } catch (e) {
            return message.reply("❌ Échec de l'expulsion.");
        }
    }

    // --- COMMANDE : !ban ---
    if (message.content.startsWith('!ban')) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!ban @membre [raison]`");
        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison spécifiée";

        try {
            await member.ban({ reason });
            await sendSecurityLog(message.guild, `🔨 **Bannissement** : **${member.user.tag}** par **${message.author.tag}**. Raison : *${reason}*`);
            return message.channel.send(`🔨 **${member.user.tag}** a été banni.`);
        } catch (e) {
            return message.reply("❌ Échec du bannissement.");
        }
    }

    // --- COMMANDE : !unban ---
    if (message.content.startsWith('!unban')) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply("❌ Permission insuffisante.");
        const userId = message.content.split(' ')[1];
        if (!userId) return message.reply("⚠️ Utilisation : `!unban [ID_utilisateur]`");

        try {
            await message.guild.members.unban(userId);
            await sendSecurityLog(message.guild, `✅ **Débannissement** de l'ID \`${userId}\` par **${message.author.tag}**.`);
            return message.channel.send(`✅ L'utilisateur avec l'ID \`${userId}\` a été débanni.`);
        } catch (e) {
            return message.reply("❌ Impossible de trouver ou débannir cet ID.");
        }
    }

    // --- COMMANDE : !clear ---
    if (message.content.startsWith('!clear')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
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

    // --- COMMANDE : !nuke ---
    if (message.content === '!nuke') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Réservé aux administrateurs.");
        try {
            const position = message.channel.position;
            const newChannel = await message.channel.clone();
            await message.channel.delete();
            await newChannel.setPosition(position);
            return newChannel.send("💥 **SALON RÉINITIALISÉ.** Ce salon a été purgé à 100 % suite à une procédure d'urgence.");
        } catch (e) {
            return message.reply("❌ Échec du nuke.");
        }
    }

    // --- COMMANDE : !serverinfo ---
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

    // ============================================================================
    // 7. COMMANDE PROPRIÉTAIRE : DIFFUSION NATIONALE / ACADÉMIQUE
    // ============================================================================
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