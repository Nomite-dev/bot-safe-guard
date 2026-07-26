// ============================================================================
// 🛡️ n0mit Safeguard v2.1 - Le Bot de Sécurité Ultime
// Écosystème n0mit CoreSystems
// ============================================================================

const { 
    Client, 
    GatewayIntentBits, 
    PermissionFlagsBits, 
    ChannelType, 
    EmbedBuilder, 
    AuditLogEvent 
} = require('discord.js');
const http = require('http');

// ============================================================================
// 1. SERVEUR WEB KEEP-ALIVE (Render)
// ============================================================================
http.createServer((req, res) => {
    res.write("n0mit Safeguard - Online 24/7");
    res.end();
}).listen(process.env.PORT || 3000);

// ============================================================================
// 2. INITIALISATION & CONFIGURATION
// ============================================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = "1440037449546989701"; // TON ID
const UNIFIED_CHANNEL_NAME = "📢｜n0mit-coresystems";

const guildConfigs = new Map();
const staffActionTracker = new Map();

function getConfig(guildId) {
    if (!guildConfigs.has(guildId)) {
        guildConfigs.set(guildId, {
            antiInvite: true,
            antiPhishing: true,
            antiEveryone: true,
            antiGhostPing: true,
            antiNukeStaff: true,
            antiUnauthorizedBot: true,
            antiRaid: false,
            logChannelId: null
        });
    }
    return guildConfigs.get(guildId);
}

async function sendSecurityLog(guild, embed) {
    const cfg = getConfig(guild.id);
    if (!cfg.logChannelId) return;
    try {
        const logChannel = guild.channels.cache.get(cfg.logChannelId);
        if (logChannel) await logChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error("Erreur log :", e);
    }
}

// ============================================================================
// 3. SYNCHRONISATION SALON UNIFIÉ (SchoolBot & Safeguard)
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
        return guild.systemChannel;
    }
}

// Détection synchro quand SchoolBot fait son /setup
client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    if (channel.name.toLowerCase().includes("n0mit-coresystems")) {
        const embed = new EmbedBuilder()
            .setTitle("🔗 n0mit CoreSystems Sync")
            .setColor(0x2B2D31)
            .setDescription("Liaison réussie entre **n0mit Safeguard** et le salon système.")
            .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => {});
    }
});

// ============================================================================
// 4. PROTECTIONS ACTIVES (Anti-Bot, Anti-Nuke, Anti-Raid)
// ============================================================================
client.on('guildMemberAdd', async (member) => {
    const cfg = getConfig(member.guild.id);

    // 1. Protection Anti-Bot Tiers
    if (member.user.bot && cfg.antiUnauthorizedBot) {
        try {
            const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd });
            const entry = logs.entries.first();
            if (entry && entry.executor.id !== member.guild.ownerId) {
                await member.kick("Bot non autorisé par le propriétaire.");
                const embed = new EmbedBuilder()
                    .setTitle("🚨 BOT NON AUTORISÉ EXPULSÉ")
                    .setColor(0xED4245)
                    .setDescription(`Le bot **${member.user.tag}** ajouté par <@${entry.executor.id}> a été expulsé.`)
                    .setTimestamp();
                await sendSecurityLog(member.guild, embed);
            }
        } catch (e) {}
    }

    // 2. Protection Anti-Raid Comptes Récents
    if (!member.user.bot && cfg.antiRaid) {
        const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
        if (accountAgeDays < 1) {
            try {
                await member.timeout(24 * 60 * 60 * 1000, "Anti-Raid : Compte créé il y a moins de 24h.");
                const embed = new EmbedBuilder()
                    .setTitle("🛡️ Anti-Raid : Quarantaine")
                    .setColor(0xFEE75C)
                    .setDescription(`Le compte récent **${member.user.tag}** (< 24h) a été mis en isolement 24h.`);
                await sendSecurityLog(member.guild, embed);
            } catch (e) {}
        }
    }
});

// Anti-Nuke Staff (Protection contre la destruction par un Admin)
client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    const cfg = getConfig(channel.guild.id);
    if (!cfg.antiNukeStaff) return;

    try {
        const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete });
        const entry = logs.entries.first();
        if (!entry) return;

        const executor = entry.executor;
        if (executor.id === channel.guild.ownerId || executor.id === client.user.id) return;

        const key = `${channel.guild.id}_${executor.id}`;
        const now = Date.now();
        const userStats = staffActionTracker.get(key) || { count: 0, firstAction: now };

        if (now - userStats.firstAction > 10000) {
            userStats.count = 1;
            userStats.firstAction = now;
        } else {
            userStats.count++;
        }

        staffActionTracker.set(key, userStats);

        if (userStats.count >= 2) {
            const member = await channel.guild.members.fetch(executor.id);
            if (member) {
                const dangerousRoles = member.roles.cache.filter(r => 
                    r.permissions.has(PermissionFlagsBits.Administrator) || 
                    r.permissions.has(PermissionFlagsBits.ManageChannels) ||
                    r.permissions.has(PermissionFlagsBits.BanMembers)
                );
                await member.roles.remove(dangerousRoles, "Anti-Nuke Safeguard");

                const nukeEmbed = new EmbedBuilder()
                    .setTitle("💥 DÉTECTION TENTATIVE DE NUKE (STAFF)")
                    .setColor(0xED4245)
                    .setDescription(`L'administrateur **${executor.tag}** a supprimé plusieurs salons.\n🔒 **Droits d'administration révoqués.**`)
                    .setTimestamp();

                await sendSecurityLog(channel.guild, nukeEmbed);
                const owner = await channel.guild.fetchOwner();
                await owner.send({ embeds: [nukeEmbed] }).catch(() => {});
            }
        }
    } catch (e) {}
});

// ============================================================================
// 5. READY & ACCUEIL
// ============================================================================
client.on('ready', () => {
    console.log(`🛡️ n0mit Safeguard connecté : ${client.user.tag}`);
    client.user.setActivity('Protéger l\'établissement | !help', { type: 3 });
});

client.on('guildCreate', async (guild) => {
    try {
        const targetChannel = await getOrCreateCoreChannel(guild);
        if (!targetChannel) return;

        const welcomeEmbed = new EmbedBuilder()
            .setTitle("🛡️ n0mit Safeguard | Protection Active")
            .setColor(0x57F287)
            .setDescription("Ce serveur est sous la protection de l'écosystème **n0mit CoreSystems**.")
            .addFields(
                { name: "🛡️ Anti-Nuke Staff", value: "Neutralise les admins malveillants.", inline: true },
                { name: "🤖 Protection Bots", value: "Bloque l'ajout de bots tiers non autorisés.", inline: true },
                { name: "🔍 Filtres", value: "Anti-Invite, Phishing, GhostPing.", inline: true }
            )
            .setFooter({ text: "Tapez !help pour afficher l'ensemble des commandes." });

        await targetChannel.send({ embeds: [welcomeEmbed] });
    } catch (err) {}
});

// Ghost Ping
client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;
    const cfg = getConfig(message.guild.id);
    if (!cfg.antiGhostPing) return;

    if (message.mentions.members.size > 0 || message.mentions.roles.size > 0) {
        const ghostEmbed = new EmbedBuilder()
            .setTitle("👻 Ghost-Ping Détecté")
            .setColor(0xFEE75C)
            .addFields(
                { name: "Auteur", value: `${message.author.tag}`, inline: true },
                { name: "Salon", value: `<#${message.channel.id}>`, inline: true },
                { name: "Message", value: message.content || "*Inconnu*" }
            )
            .setTimestamp();
        await sendSecurityLog(message.guild, ghostEmbed);
    }
});

// ============================================================================
// 6. GESTION DES MESSAGES & MANUEL COMPLET DE COMMANDES (!HELP)
// ============================================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const cfg = getConfig(message.guild.id);
    const isStaff = message.member.permissions.has(PermissionFlagsBits.ManageMessages);

    // Filtres
    if (cfg.antiInvite && !isStaff) {
        const inviteRegex = /(discord\.(gg|me|com)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i;
        if (inviteRegex.test(message.content)) {
            await message.delete().catch(() => {});
            return message.channel.send(`⚠️ ${message.author}, pub/invitation interdite.`).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
        }
    }

    if (cfg.antiPhishing && !isStaff) {
        const scamRegex = /(steamcommun|discord-gift|free-nitro|steam-promo|airdrop-gift|grabify|iplogger)/i;
        if (scamRegex.test(message.content)) {
            await message.delete().catch(() => {});
            try { await message.member.timeout(30 * 60 * 1000, "Lien Phishing"); } catch(e) {}
            return message.channel.send(`🚨 ${message.author}, tentative d'envoi de lien malveillant détectée.`);
        }
    }

    if (cfg.antiEveryone && message.mentions.everyone && !message.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
        await message.delete().catch(() => {});
        try { await message.member.timeout(10 * 60 * 1000, "Spam Mention Globale"); } catch (e) {}
        return message.channel.send(`🚨 ${message.author}, abus de mention globale interdit.`);
    }

    // ============================================================================
    // COMMANDES COMPLÈTES
    // ============================================================================

    // 📜 MANUEL EXHAUSTIF PAR CATÉGORIES (!HELP)
    if (message.content === '!help' || message.content === '.help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle("🛡️ Centre de Contrôle n0mit Safeguard")
            .setColor(0x5865F2)
            .setDescription("Manuel officiel exhaustif de toutes les commandes disponibles.")
            .addFields(
                {
                    name: "🛠️ Modération & Sanctions",
                    value: 
                        "`!warn @membre [raison]` • *Avertissement officiel*\n" +
                        "`!mute @membre [min] [raison]` • *Exclusion temporaire*\n" +
                        "`!unmute @membre` • *Levée du silence*\n" +
                        "`!kick @membre [raison]` • *Expulsion du serveur*\n" +
                        "`!ban @membre [raison]` • *Bannissement définitif*\n" +
                        "`!unban [ID_utilisateur]` • *Révoque un bannissement*"
                },
                {
                    name: "🚨 Gestion de Crise & Salons",
                    value: 
                        "`!lockdown on/off` • *Verrouille ou déverrouille le salon*\n" +
                        "`!slowmode [secondes]` • *Modifie le délai d'envoi (0 = off)*\n" +
                        "`!clear [1-100]` • *Purge un volume de messages récents*\n" +
                        "`!purgeuser @membre [1-100]` • *Supprime les messages d'un compte spécifique*\n" +
                        "`!nuke` • *Recommence le salon à neuf (Admin)*"
                },
                {
                    name: "⚙️ Configuration & Diagnostic",
                    value: 
                        "`!secscore` • *Audit et note de sécurité du serveur /100*\n" +
                        "`!config` • *Panneau des filtres (anti-invite, phishing, etc.)*\n" +
                        "`!antiraid on/off` • *Activer la quarantaine des comptes récents*\n" +
                        "`!setlog #salon` • *Définit le salon des rapports de sécurité*\n" +
                        "`!serverinfo` • *Rapport général des paramètres de l'instance*"
                }
            );

        // SI C'EST TOI LE CRÉATEUR, ON AFFICHE TA CATÉGORIE SECRÈTE
        if (message.author.id === OWNER_ID) {
            helpEmbed.addFields({
                name: "👑 Commande Créateur (Exclusif)",
                value: "`!broadcast [message]` • *Diffuser un communiqué officiel sur TOUS les serveurs*"
            });
        }

        helpEmbed.setFooter({ text: "Écosystème n0mit CoreSystems • Protection Haute Disponibilité" }).setTimestamp();
        return message.reply({ embeds: [helpEmbed] });
    }

    // AUDIT SÉCURITÉ
    if (message.content === '!secscore') {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        let score = 100;
        const recommendations = [];

        if (message.guild.roles.everyone.permissions.has(PermissionFlagsBits.MentionEveryone)) {
            score -= 25;
            recommendations.push("❌ Retirez la permission `@everyone` de mentionner tout le monde.");
        }
        if (!cfg.logChannelId) {
            score -= 15;
            recommendations.push("⚠️ Configuration manquante : Définissez un salon de logs (`!setlog #salon`).");
        }

        const color = score >= 80 ? 0x57F287 : 0xED4245;
        const scoreEmbed = new EmbedBuilder()
            .setTitle(`📊 Audit de Sécurité : ${message.guild.name}`)
            .setColor(color)
            .setDescription(`**Score de Sécurité : ${score}/100**\n\n` + (recommendations.length ? recommendations.join("\n") : "✅ Instance parfaitement sécurisée !"));

        return message.reply({ embeds: [scoreEmbed] });
    }

    // PANNEAU CONFIGURATION
    if (message.content.startsWith('!config')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const args = message.content.split(' ');
        const option = args[1]?.toLowerCase();
        const state = args[2]?.toLowerCase();

        if (!option) {
            const configEmbed = new EmbedBuilder()
                .setTitle("⚙️ Configuration des Modules Safeguard")
                .setColor(0x2B2D31)
                .addFields(
                    { name: "anti-invite", value: cfg.antiInvite ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "anti-phishing", value: cfg.antiPhishing ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "anti-everyone", value: cfg.antiEveryone ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "anti-ghostping", value: cfg.antiGhostPing ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "anti-nuke", value: cfg.antiNukeStaff ? '🛡️ Actif' : '🔴 Inactif', inline: true },
                    { name: "anti-bot", value: cfg.antiUnauthorizedBot ? '🛡️ Actif' : '🔴 Inactif', inline: true }
                )
                .setFooter({ text: "Utilisation : !config anti-invite off" });
            return message.reply({ embeds: [configEmbed] });
        }

        if (state !== 'on' && state !== 'off') return message.reply("⚠️ Spécifiez `on` ou `off`.");
        const isTrue = state === 'on';

        if (option === 'anti-invite') cfg.antiInvite = isTrue;
        else if (option === 'anti-phishing') cfg.antiPhishing = isTrue;
        else if (option === 'anti-everyone') cfg.antiEveryone = isTrue;
        else if (option === 'anti-ghostping') cfg.antiGhostPing = isTrue;
        else if (option === 'anti-nuke') cfg.antiNukeStaff = isTrue;
        else if (option === 'anti-bot') cfg.antiUnauthorizedBot = isTrue;
        else return message.reply("⚠️ Module inconnu.");

        return message.reply(`✅ Module **${option}** réglé sur **${state.toUpperCase()}**.`);
    }

    // ANTI-RAID
    if (message.content.startsWith('!antiraid')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Réservé aux administrateurs.");
        const state = message.content.split(' ')[1]?.toLowerCase();

        if (state === 'on') {
            cfg.antiRaid = true;
            return message.channel.send("🚨 **ANTI-RAID ACTIVÉ.** Les comptes de moins de 24h seront mis en quarantaine.");
        } else if (state === 'off') {
            cfg.antiRaid = false;
            return message.channel.send("✅ **ANTI-RAID DÉSACTIVÉ.** Arrivées normales autorisées.");
        } else {
            return message.reply("Utilisation : `!antiraid on` ou `!antiraid off`");
        }
    }

    // SET LOG
    if (message.content.startsWith('!setlog')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("⚠️ Mentionnez un salon. Exemple : `!setlog #logs-sécurité`");
        cfg.logChannelId = channel.id;
        return message.reply(`✅ Salon de logs connecté à ${channel}`);
    }

    // PURGE USER
    if (message.content.startsWith('!purgeuser')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const targetMember = message.mentions.members.first();
        const limit = parseInt(message.content.split(' ')[2]) || 50;
        if (!targetMember) return message.reply("⚠️ Utilisation : `!purgeuser @membre [1-100]`");

        try {
            await message.delete().catch(() => {});
            const messages = await message.channel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(m => m.author.id === targetMember.id).first(limit);
            await message.channel.bulkDelete(userMessages, true);
            const msg = await message.channel.send(`🧹 **${userMessages.length}** messages de ${targetMember} supprimés.`);
            setTimeout(() => msg.delete().catch(() => {}), 3000);
        } catch (e) {
            return message.reply("❌ Erreur lors de la suppression.");
        }
    }

    // WARN
    if (message.content.startsWith('!warn')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!warn @membre [raison]`");
        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison";
        return message.channel.send(`⚠️ **AVERTISSEMENT** : ${member} a reçu un avertissement. Raison : *${reason}*`);
    }

    // SLOWMODE
    if (message.content.startsWith('!slowmode')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply("❌ Permission insuffisante.");
        const seconds = parseInt(message.content.split(' ')[1]);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) return message.reply("⚠️ Utilisation : `!slowmode [secondes]`");
        await message.channel.setRateLimitPerUser(seconds);
        return message.channel.send(`⏱️ Mode lent réglé à **${seconds}s**.`);
    }

    // LOCKDOWN
    if (message.content.startsWith('!lockdown')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Réservé aux administrateurs.");
        const state = message.content.split(' ')[1]?.toLowerCase();
        if (state === 'on') {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            return message.channel.send("🚨 **SALON VERROUILLÉ.**");
        } else if (state === 'off') {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            return message.channel.send("✅ **SALON DÉVERROUILLÉ.**");
        } else {
            return message.reply("Utilisation : `!lockdown on` ou `!lockdown off`");
        }
    }

    // MUTE / UNMUTE
    if (message.content.startsWith('!mute')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply("❌ Permission insuffisante.");
        const args = message.content.split(' ');
        const member = message.mentions.members.first();
        const duration = parseInt(args[2]);
        if (!member || isNaN(duration)) return message.reply("⚠️ Utilisation : `!mute @membre [minutes] [raison]`");
        await member.timeout(duration * 60 * 1000, args.slice(3).join(' ') || "Aucune raison");
        return message.channel.send(`🔇 **${member.user.tag}** a été réduit au silence pendant ${duration} min.`);
    }

    if (message.content.startsWith('!unmute')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!unmute @membre`");
        await member.timeout(null);
        return message.channel.send(`🔊 Le silence de **${member.user.tag}** a été levé.`);
    }

    // KICK / BAN / UNBAN
    if (message.content.startsWith('!kick')) {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!kick @membre [raison]`");
        await member.kick(message.content.split(' ').slice(2).join(' ') || "Aucune raison");
        return message.channel.send(`👢 **${member.user.tag}** a été expulsé.`);
    }

    if (message.content.startsWith('!ban')) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!ban @membre [raison]`");
        await member.ban({ reason: message.content.split(' ').slice(2).join(' ') || "Aucune raison" });
        return message.channel.send(`🔨 **${member.user.tag}** a été banni.`);
    }

    if (message.content.startsWith('!unban')) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply("❌ Permission insuffisante.");
        const userId = message.content.split(' ')[1];
        if (!userId) return message.reply("⚠️ Utilisation : `!unban [ID_utilisateur]`");
        await message.guild.members.unban(userId);
        return message.channel.send(`✅ ID \`${userId}\` débanni.`);
    }

    // CLEAR
    if (message.content.startsWith('!clear')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const count = parseInt(message.content.split(' ')[1]);
        if (isNaN(count) || count < 1 || count > 100) return message.reply("⚠️ Utilisation : `!clear [1-100]`");
        await message.delete().catch(() => {});
        const deleted = await message.channel.bulkDelete(count, true);
        const msg = await message.channel.send(`🧹 **${deleted.size}** messages supprimés.`);
        setTimeout(() => msg.delete().catch(() => {}), 3000);
    }

    // NUKE
    if (message.content === '!nuke') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Réservé aux administrateurs.");
        const pos = message.channel.position;
        const newChannel = await message.channel.clone();
        await message.channel.delete();
        await newChannel.setPosition(pos);
        return newChannel.send("💥 **SALON RÉINITIALISÉ.**");
    }

    // SERVERINFO
    if (message.content === '!serverinfo') {
        return message.reply(`📊 **${message.guild.name}**\n• Propriétaire : <@${message.guild.ownerId}>\n• Membres : \`${message.guild.memberCount}\`\n• Création : \`${message.guild.createdAt.toLocaleDateString()}\``);
    }

    // BROADCAST (PROPRIÉTAIRE SEULEMENT)
    if (message.content.startsWith('!broadcast')) {
        if (message.author.id !== OWNER_ID) return message.reply("❌ Réservé exclusivement au créateur du bot.");
        const announcement = message.content.split(' ').slice(1).join(' ');
        if (!announcement) return message.reply("⚠️ Utilisation : `!broadcast [texte]`");

        let successCount = 0;
        const broadEmbed = new EmbedBuilder()
            .setTitle("📢 COMMUNIQUÉ OFFICIEL n0mit CoreSystems")
            .setColor(0x5865F2)
            .setDescription(announcement)
            .setTimestamp();

        for (const guild of client.guilds.cache.values()) {
            try {
                const targetChannel = await getOrCreateCoreChannel(guild);
                if (targetChannel) {
                    await targetChannel.send({ embeds: [broadEmbed] });
                    successCount++;
                }
            } catch (err) {}
        }
        return message.channel.send(`✅ Message diffusé sur **${successCount}** serveurs.`);
    }
});

client.login(TOKEN);
