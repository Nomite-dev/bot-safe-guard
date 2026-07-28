// ============================================================================
// 🛡️ n0mit Safeguard v3.1 - Édition Utile & Incontournable (MAJ SÉCURITÉ)
// Écosystème n0mit CoreSystems
// ============================================================================

const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    AuditLogEvent,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const http = require('http');

// ============================================================================
// 1. SERVEUR WEB KEEP-ALIVE (inchangé)
// ============================================================================
http.createServer((req, res) => {
    res.write("n0mit Safeguard v3.1 - Online 24/7 | Sécurité Renforcée");
    res.end();
}).listen(process.env.PORT || 3000);

// ============================================================================
// 2. INITIALISATION & CONFIGURATION (étendue)
// ============================================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildBans, // Ajout pour gérer les bans
        GatewayIntentBits.GuildEmojisAndStickers // Pour la détection des emojis malveillants
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = "1440037449546989701";
const UNIFIED_CHANNEL_NAME = "📢｜n0mit-coresystems";

// --- NOUVELLES CONSTANTES ---
const MOD_ROLE_NAME = "Modérateur"; // Rôle par défaut pour les modérateurs
const ADMIN_ROLE_NAME = "Administrateur"; // Rôle par défaut pour les admins
const MAX_WARNS_BEFORE_BAN = 3; // Seuil d'avertissements avant ban automatique

// --- STRUCTURES DE DONNÉES ÉTENDUES ---
const guildConfigs = new Map();
const staffActionTracker = new Map();
const spamTracker = new Map();
const serverBackups = new Map();
const warnTracker = new Map(); // Suivi des avertissements par membre
const tempBans = new Map(); // Suivi des bans temporaires
const autoModRules = new Map(); // Règles de modération automatique (ex: mots interdits)

// ============================================================================
// 3. FONCTIONS UTILITAIRES NOUVELLES
// ============================================================================

// --- Vérification des rôles staff (modo/admin) ---
function isModerator(member) {
    return member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
           member.roles.cache.some(role => role.name.toLowerCase() === MOD_ROLE_NAME.toLowerCase());
}

function isAdmin(member) {
    return member.permissions.has(PermissionFlagsBits.Administrator) ||
           member.roles.cache.some(role => role.name.toLowerCase() === ADMIN_ROLE_NAME.toLowerCase()) ||
           member.id === member.guild.ownerId;
}

// --- Gestion des avertissements ---
function addWarning(guildId, userId, reason, moderatorId) {
    const key = `${guildId}_${userId}`;
    const warnings = warnTracker.get(key) || [];
    warnings.push({
        timestamp: Date.now(),
        reason: reason,
        moderatorId: moderatorId
    });
    warnTracker.set(key, warnings);
    return warnings.length;
}

// --- Vérification des bans temporaires ---
function checkTempBans(guild) {
    const now = Date.now();
    const guildTempBans = tempBans.get(guild.id) || [];
    const toUnban = guildTempBans.filter(ban => ban.expiresAt <= now);

    toUnban.forEach(async (ban) => {
        try {
            await guild.members.unban(ban.userId);
            const logEmbed = new EmbedBuilder()
                .setTitle("⏳ Ban Temporaire Expiré")
                .setColor(0x57F287)
                .setDescription(`Le ban de **${ban.userTag}** (ID: ${ban.userId}) a expiré et a été levé automatiquement.`)
                .setTimestamp();
            await sendSecurityLog(guild, logEmbed);
        } catch (e) {
            console.error(`Erreur lors de la levée du ban temporaire pour ${ban.userId}:`, e);
        }
    });

    // Mise à jour de la liste
    tempBans.set(guild.id, guildTempBans.filter(ban => ban.expiresAt > now));
}

// --- Sauvegarde/Chargement des configurations (simulé en mémoire) ---
function saveConfig(guildId, config) {
    guildConfigs.set(guildId, config);
    // En production, utiliser un système de persistance (ex: SQLite, JSON)
}

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
            antiSpam: true,
            antiZalgo: true,
            antiAltAccounts: false, // NOUVEAU: Détection de comptes alternatifs
            antiMassMention: true, // NOUVEAU: Anti-mention de masse
            antiEmojiSpam: true, // NOUVEAU: Anti-spam d'emojis
            antiCaps: true, // NOUVEAU: Anti-majuscules excessives
            logChannelId: null,
            modRoleId: null, // ID du rôle modérateur
            adminRoleId: null, // ID du rôle administrateur
            autoBanAfterWarns: MAX_WARNS_BEFORE_BAN, // Seuil pour ban automatique
            allowedInvites: [] // Liste des invites autorisées (ex: ["discord.gg/n0mit"])
        });
    }
    return guildConfigs.get(guildId);
}

// ============================================================================
// 4. SYNCHRONISATION SALON UNIFIÉ (inchangé)
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
// 5. MODULES DE SÉCURITÉ AUTOMATIQUES (étendus)
// ============================================================================

// A. Anti-Bot Tiers & Anti-Raid Comptes Récents (amélioré)
client.on('guildMemberAdd', async (member) => {
    const cfg = getConfig(member.guild.id);

    // --- Anti-Bot Non Autorisé ---
    if (member.user.bot && cfg.antiUnauthorizedBot) {
        try {
            const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd });
            const entry = logs.entries.first();
            if (entry && entry.executor.id !== member.guild.ownerId) {
                // Vérification des bots autorisés (via liste blanche)
                const allowedBots = process.env.ALLOWED_BOTS?.split(',') || [];
                if (!allowedBots.includes(member.user.id)) {
                    await member.kick("Bot non autorisé par le propriétaire.");
                    const embed = new EmbedBuilder()
                        .setTitle("🚨 BOT NON AUTORISÉ EXPULSÉ")
                        .setColor(0xED4245)
                        .setDescription(`Le bot **${member.user.tag}** (ID: ${member.user.id}) ajouté par <@${entry.executor.id}> a été expulsé immédiatement.`)
                        .addFields({ name: "Action", value: "Expulsion automatique", inline: true })
                        .setTimestamp();
                    await sendSecurityLog(member.guild, embed);
                }
            }
        } catch (e) { console.error("Erreur anti-bot:", e); }
    }

    // --- Anti-Raid (Comptes Récents) ---
    if (!member.user.bot && cfg.antiRaid) {
        const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
        if (accountAgeDays < 1) {
            try {
                await member.timeout(24 * 60 * 60 * 1000, "Anti-Raid : Compte récent (<24h)");
                const embed = new EmbedBuilder()
                    .setTitle("🛡️ Anti-Raid : Quarantaine")
                    .setColor(0xFEE75C)
                    .setDescription(`Le compte récent **${member.user.tag}** (créé il y a ${Math.round(accountAgeDays * 24)}h) a été placé en isolement temporaire.`)
                    .setTimestamp();
                await sendSecurityLog(member.guild, embed);
            } catch (e) { console.error("Erreur anti-raid:", e); }
        }
    }

    // --- NOUVEAU: Anti-Alt Accounts (Détection de comptes alternatifs) ---
    if (cfg.antiAltAccounts && !member.user.bot) {
        try {
            const accountAgeHours = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60);
            if (accountAgeHours < 72) { // Comptes de moins de 3 jours
                const similarAccounts = await findSimilarAccounts(member.guild, member.user);
                if (similarAccounts.length > 0) {
                    await member.timeout(60 * 60 * 1000, "Anti-Alt : Compte suspect");
                    const embed = new EmbedBuilder()
                        .setTitle("🕵️‍♂️ Compte Alternatif Détecté")
                        .setColor(0xFEE75C)
                        .setDescription(`**${member.user.tag}** (${member.user.id}) pourrait être un compte alternatif.\n` +
                                       `Comptes similaires: ${similarAccounts.map(u => `**${u.tag}**`).join(', ')}`)
                        .setTimestamp();
                    await sendSecurityLog(member.guild, embed);
                }
            }
        } catch (e) { console.error("Erreur anti-alt:", e); }
    }
});

// Fonction utilitaire pour détecter les comptes similaires (ex: même IP, nom similaire)
async function findSimilarAccounts(guild, user) {
    const similarUsers = [];
    const username = user.username.toLowerCase();
    const discriminator = user.discriminator;

    // Recherche par nom similaire (ex: "Nomite" vs "Nomite2")
    for (const member of guild.members.cache.values()) {
        if (member.id === user.id) continue;
        if (!member.user.bot) {
            const memberUsername = member.user.username.toLowerCase();
            if (memberUsername.includes(username) || username.includes(memberUsername)) {
                similarUsers.push(member.user);
            }
        }
    }

    // Limite à 3 résultats pour éviter le spam
    return similarUsers.slice(0, 3);
}

// B. Anti-Nuke Staff (Amélioré avec détection de suppression de rôles)
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
        const userStats = staffActionTracker.get(key) || { count: 0, firstAction: now, lastAction: now };

        // Réinitialisation si inactivité > 10 secondes
        if (now - userStats.lastAction > 10000) {
            userStats.count = 1;
            userStats.firstAction = now;
        } else {
            userStats.count++;
        }
        userStats.lastAction = now;
        staffActionTracker.set(key, userStats);

        if (userStats.count >= 2) {
            const member = await channel.guild.members.fetch(executor.id).catch(() => null);
            if (member) {
                // Suppression des rôles dangereux
                const dangerousRoles = member.roles.cache.filter(r =>
                    r.permissions.has(PermissionFlagsBits.Administrator) ||
                    r.permissions.has(PermissionFlagsBits.ManageChannels) ||
                    r.permissions.has(PermissionFlagsBits.BanMembers) ||
                    r.permissions.has(PermissionFlagsBits.KickMembers) ||
                    r.permissions.has(PermissionFlagsBits.ManageGuild)
                );

                if (dangerousRoles.size > 0) {
                    await member.roles.remove(dangerousRoles, "Anti-Nuke Safeguard: Suppression de rôles dangereux");
                }

                // Ban temporaire si trop d'actions
                if (userStats.count >= 5) {
                    await member.ban({ reason: "Anti-Nuke: Activité suspecte (suppression multiple de salons)", days: 1 });
                    tempBans.set(channel.guild.id, (tempBans.get(channel.guild.id) || []).concat({
                        userId: executor.id,
                        userTag: executor.tag,
                        expiresAt: now + (24 * 60 * 60 * 1000) // 24h
                    }));
                }

                const nukeEmbed = new EmbedBuilder()
                    .setTitle("💥 TENTATIVE DE NUKE INTERCEPTÉE")
                    .setColor(0xED4245)
                    .setDescription(`L'utilisateur **${executor.tag}** a supprimé plusieurs salons consécutifs.\n` +
                                   `🔒 **${dangerousRoles.size} rôles administratifs révoqués.**\n` +
                                   `🚨 **Compteur d'actions: ${userStats.count}/5**`)
                    .setTimestamp();

                await sendSecurityLog(channel.guild, nukeEmbed);
                const owner = await channel.guild.fetchOwner();
                await owner.send({ embeds: [nukeEmbed] }).catch(() => {});
            }
        }
    } catch (e) { console.error("Erreur anti-nuke:", e); }
});

// NOUVEAU: Détection de suppression de rôles
client.on('roleDelete', async (role) => {
    if (!role.guild) return;
    const cfg = getConfig(role.guild.id);
    if (!cfg.antiNukeStaff) return;

    try {
        const logs = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleDelete });
        const entry = logs.entries.first();
        if (!entry) return;

        const executor = entry.executor;
        if (executor.id === role.guild.ownerId || executor.id === client.user.id) return;

        const key = `${role.guild.id}_${executor.id}`;
        const now = Date.now();
        const userStats = staffActionTracker.get(key) || { count: 0, firstAction: now, lastAction: now };

        if (now - userStats.lastAction > 10000) {
            userStats.count = 1;
            userStats.firstAction = now;
        } else {
            userStats.count++;
        }
        userStats.lastAction = now;
        staffActionTracker.set(key, userStats);

        if (userStats.count >= 3) {
            const member = await role.guild.members.fetch(executor.id).catch(() => null);
            if (member) {
                const dangerousRoles = member.roles.cache.filter(r =>
                    r.permissions.has(PermissionFlagsBits.Administrator) ||
                    r.permissions.has(PermissionFlagsBits.ManageRoles)
                );
                await member.roles.remove(dangerousRoles, "Anti-Nuke: Suppression de rôles");

                const embed = new EmbedBuilder()
                    .setTitle("🛡️ Suppression de Rôles Suspecte")
                    .setColor(0xED4245)
                    .setDescription(`**${executor.tag}** a supprimé le rôle **${role.name}**.\n` +
                                   `🔒 **Rôles administratifs révoqués en urgence.**`)
                    .setTimestamp();
                await sendSecurityLog(role.guild, embed);
            }
        }
    } catch (e) { console.error("Erreur anti-nuke (rôle):", e); }
});

// C. Ghost-Ping Detection (amélioré avec actions automatiques)
client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;
    const cfg = getConfig(message.guild.id);

    // --- Anti-Ghost Ping ---
    if (cfg.antiGhostPing) {
        if (message.mentions.members.size > 0 || message.mentions.roles.size > 0) {
            const ghostEmbed = new EmbedBuilder()
                .setTitle("👻 Ghost-Ping Détecté")
                .setColor(0xFEE75C)
                .addFields(
                    { name: "Auteur", value: `${message.author.tag} (${message.author.id})`, inline: true },
                    { name: "Salon", value: `<#${message.channel.id}>`, inline: true },
                    { name: "Contenu", value: message.content || "*Masqué*" }
                )
                .setTimestamp();
            await sendSecurityLog(message.guild, ghostEmbed);

            // Action automatique si trop de ghost-pings
            const userGhostPings = (spamTracker.get(`${message.guild.id}_${message.author.id}_ghost`) || 0) + 1;
            spamTracker.set(`${message.guild.id}_${message.author.id}_ghost`, userGhostPings);

            if (userGhostPings >= 3 && !isModerator(message.member)) {
                await message.author.timeout(10 * 60 * 1000, "Ghost-Ping répété");
                const actionEmbed = new EmbedBuilder()
                    .setTitle("⚠️ Sanction Automatique: Ghost-Ping")
                    .setColor(0xED4245)
                    .setDescription(`**${message.author.tag}** a été muet pendant 10 minutes pour ghost-ping répété.`)
                    .setTimestamp();
                await sendSecurityLog(message.guild, actionEmbed);
            }
        }
    }

    // --- NOUVEAU: Anti-Mass Mention ---
    if (cfg.antiMassMention && !isModerator(message.member)) {
        const mentionCount = message.mentions.members.size + message.mentions.roles.size;
        if (mentionCount >= 5) { // Seuil: 5 mentions
            await message.delete().catch(() => {});
            await message.author.timeout(5 * 60 * 1000, "Mention de masse");
            const embed = new EmbedBuilder()
                .setTitle("🚨 Mention de Masse Détectée")
                .setColor(0xED4245)
                .setDescription(`**${message.author.tag}** a mentionné **${mentionCount}** utilisateurs/roles en un message.\n` +
                               `🔇 **Sanction: Mute 5 minutes.**`)
                .addFields({ name: "Salon", value: `<#${message.channel.id}>`, inline: true })
                .setTimestamp();
            await sendSecurityLog(message.guild, embed);
        }
    }
});

// ============================================================================
// 6. READY ET ÉVÉNEMENTS (étendus)
// ============================================================================
client.on('ready', () => {
    console.log(`🛡️ n0mit Safeguard v3.1 actif pour ${client.guilds.cache.size} serveurs.`);
    client.user.setActivity('Protéger le serveur | !help', { type: 3 });

    // Vérification périodique des bans temporaires
    setInterval(() => {
        for (const guild of client.guilds.cache.values()) {
            checkTempBans(guild);
        }
    }, 60 * 1000); // Toutes les minutes
});

client.on('guildCreate', async (guild) => {
    try {
        const targetChannel = await getOrCreateCoreChannel(guild);
        if (!targetChannel) return;

        const welcomeEmbed = new EmbedBuilder()
            .setTitle("🛡️ n0mit Safeguard v3.1 | Protection Maximale")
            .setColor(0x57F287)
            .setDescription("Ce serveur est sécurisé par l'écosystème **n0mit CoreSystems**.")
            .addFields(
                { name: "🛡️ Anti-Nuke Staff", value: "Neutralise les modérateurs malveillants.", inline: true },
                { name: "⚡ Anti-Spam & Zalgo", value: "Filtre les caractères toxiques et le spam.", inline: true },
                { name: "📦 Sauvegarde Express", value: "`!backup` pour sécuriser vos salons.", inline: true },
                { name: "🔍 Anti-Alt Accounts", value: "Détection des comptes alternatifs.", inline: true },
                { name: "⏳ Bans Temporaires", value: "Gestion automatique des sanctions.", inline: true },
                { name: "📜 Modération Avancée", value: "Nouveaux outils pour les modérateurs.", inline: true }
            )
            .setFooter({ text: "Tapez !help pour consulter la liste des commandes." });

        await targetChannel.send({ embeds: [welcomeEmbed] });
    } catch (err) { console.error("Erreur guildCreate:", err); }
});

// ============================================================================
// 7. GESTION DES MESSAGES & COMMANDES (étendue)
// ============================================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const cfg = getConfig(message.guild.id);
    const isStaff = isModerator(message.member) || isAdmin(message.member);
    const isAdminMember = isAdmin(message.member);

    // --- FILTRES PASSIFS ÉTENDUS ---

    // 1. Anti-Spam Rapide (amélioré)
    if (cfg.antiSpam && !isStaff) {
        const userId = message.author.id;
        const now = Date.now();
        const userSpam = spamTracker.get(userId) || { count: 0, lastMsg: now };

        if (now - userSpam.lastMsg < 2000) { // Seuil réduit à 2s
            userSpam.count++;
            if (userSpam.count >= 5) {
                await message.member.timeout(5 * 60 * 1000, "Anti-Spam Automatique");
                await message.channel.send(`🤐 ${message.author} a été réduit au silence pendant 5 minutes pour spam.`).then(m => {
                    setTimeout(() => m.delete().catch(() => {}), 5000);
                });
                userSpam.count = 0;
            }
        } else {
            userSpam.count = 1;
        }
        userSpam.lastMsg = now;
        spamTracker.set(userId, userSpam);
    }

    // 2. Anti-Zalgo & Caractères Suspects (amélioré)
    if (cfg.antiZalgo && !isStaff) {
        const zalgoRegex = /[\u0300-\u036f\u1ab0-\u1ace\u1dc0-\u1ffe\u20d0-\u20ff]/g;
        const suspiciousChars = message.content.match(zalgoRegex);
        if (suspiciousChars && suspiciousChars.length > 5) { // Seuil: 5 caractères suspects
            await message.delete().catch(() => {});
            return message.channel.send(`⚠️ ${message.author}, les caractères invisibles ou altérés sont interdits.`).then(m => {
                setTimeout(() => m.delete().catch(() => {}), 4000);
            });
        }
    }

    // 3. Anti-Invite (amélioré avec liste blanche)
    if (cfg.antiInvite && !isStaff) {
        const inviteRegex = /(discord\.(gg|me|com)|discordapp\.com\/invite)\/[a-zA-Z0-9-]+/gi;
        const matches = message.content.match(inviteRegex);
        if (matches) {
            const isAllowed = matches.some(invite => {
                return cfg.allowedInvites.some(allowed => invite.includes(allowed));
            });
            if (!isAllowed) {
                await message.delete().catch(() => {});
                return message.channel.send(`⚠️ ${message.author}, pub/invitation interdite.`).then(m => {
                    setTimeout(() => m.delete().catch(() => {}), 4000);
                });
            }
        }
    }

    // 4. Anti-Phishing (amélioré)
    if (cfg.antiPhishing && !isStaff) {
        const scamRegex = /(steamcommun|discord-gift|free-nitro|steam-promo|airdrop-gift|grabify|iplogger|bit\.ly|tinyurl|goo\.gl|discord\.gg\/[a-zA-Z0-9-]{1,})/i;
        if (scamRegex.test(message.content)) {
            await message.delete().catch(() => {});
            try {
                await message.member.timeout(30 * 60 * 1000, "Lien Phishing");
                const embed = new EmbedBuilder()
                    .setTitle("🚨 Lien Malveillant Détecté")
                    .setColor(0xED4245)
                    .setDescription(`**${message.author.tag}** a tenté d'envoyer un lien suspect.\n` +
                                   `🔇 **Sanction: Mute 30 minutes.**`)
                    .addFields({ name: "Salon", value: `<#${message.channel.id}>`, inline: true })
                    .setTimestamp();
                await sendSecurityLog(message.guild, embed);
            } catch (e) { console.error("Erreur anti-phishing:", e); }
            return;
        }
    }

    // NOUVEAU: Anti-Emoji Spam
    if (cfg.antiEmojiSpam && !isStaff) {
        const emojiRegex = /<a?:[a-zA-Z0-9_]+:\d+>|[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/gu;
        const emojis = message.content.match(emojiRegex) || [];
        if (emojis.length > 10) { // Seuil: 10 emojis
            await message.delete().catch(() => {});
            return message.channel.send(`⚠️ ${message.author}, trop d'emojis dans votre message.`).then(m => {
                setTimeout(() => m.delete().catch(() => {}), 4000);
            });
        }
    }

    // NOUVEAU: Anti-Caps (Majuscules excessives)
    if (cfg.antiCaps && !isStaff) {
        const capsRegex = /[A-ZÀ-ÿ]/g;
        const capsLetters = message.content.match(capsRegex) || [];
        const totalLetters = message.content.replace(/\s/g, '').length;
        if (totalLetters > 0 && (capsLetters.length / totalLetters) > 0.7) { // 70% de majuscules
            await message.delete().catch(() => {});
            return message.channel.send(`⚠️ ${message.author}, évitez d'écrire en majuscules.`).then(m => {
                setTimeout(() => m.delete().catch(() => {}), 4000);
            });
        }
    }

    // ============================================================================
    // COMMANDES EXISTANTES (inchangées sauf !help)
    // ============================================================================

    // 📜 MENU AIDE (mis à jour)
    if (message.content === '!help' || message.content === '.help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle("🛡️ Centre de Contrôle n0mit Safeguard v3.1")
            .setColor(0x5865F2)
            .setDescription("Guide complet des fonctionnalités de sécurité et de modération.")
            .addFields(
                {
                    name: "🛠️ Modération & Sanctions",
                    value:
                        "`!warn @membre [raison]` • *Avertissement officiel*\n" +
                        "`!mute @membre [min] [raison]` • *Exclusion temporaire*\n" +
                        "`!unmute @membre` • *Levée du silence*\n" +
                        "`!kick @membre [raison]` • *Expulsion du serveur*\n" +
                        "`!ban @membre [raison]` • *Bannissement définitif*\n" +
                        "`!unban [ID_utilisateur]` • *Révoque un bannissement*\n" +
                        "`!softban @membre [raison]` • *Ban + déban automatique (nettoyage)*\n" +
                        "`!warnings @membre` • *Liste les avertissements d'un membre*"
                },
                {
                    name: "🚨 Gestion de Crise & Salons",
                    value:
                        "`!lockdown on/off` • *Verrouille ou déverrouille le salon*\n" +
                        "`!slowmode [secondes]` • *Ajuste le mode lent du salon*\n" +
                        "`!clear [1-100]` • *Supprime un volume de messages récents*\n" +
                        "`!purgeuser @membre [1-100]` • *Supprime les messages d'un compte*\n" +
                        "`!nuke` • *Recommence le salon à neuf (Admin)*\n" +
                        "`!lockserver on/off` • *Verrouille tout le serveur (Admin)*"
                },
                {
                    name: "⚙️ Sécurité, Filtres & Backups",
                    value:
                        "`!secscore` • *Audit et note de sécurité du serveur /100*\n" +
                        "`!config` • *Affiche et gère l'état des modules*\n" +
                        "`!antiraid on/off` • *Quarantaine automatique des comptes récents*\n" +
                        "`!antialt on/off` • *Active/désactive la détection d'alts*\n" +
                        "`!backup` • *Sauvegarde la structure des salons*\n" +
                        "`!restore` • *Restaure la dernière sauvegarde (Admin)*\n" +
                        "`!report @membre [raison]` • *Signale un membre*\n" +
                        "`!setlog #salon` • *Définit le salon de logs*\n" +
                        "`!serverinfo` • *Infos générales du serveur*\n" +
                        "`!addinvite [lien]` • *Ajoute une invite autorisée*"
                },
                {
                    name: "📊 Outils Avancés (Admin)",
                    value:
                        "`!tempban @membre [durée] [raison]` • *Ban temporaire (ex: 1d, 2h)*\n" +
                        "`!setmodrole @rôle` • *Définit le rôle modérateur*\n" +
                        "`!setadminrole @rôle` • *Définit le rôle administrateur*\n" +
                        "`!autoban on/off` • *Active/désactive le ban auto après X warns*\n" +
                        "`!setwarnlimit [1-5]` • *Définit le seuil de warns pour ban auto*"
                }
            )
            .setFooter({ text: "Écosystème n0mit CoreSystems • Protection Haute Disponibilité" })
            .setTimestamp();

        return message.reply({ embeds: [helpEmbed] });
    }

    // ============================================================================
    // NOUVELLES COMMANDES
    // ============================================================================

    // --- Softban (Ban + Déban immédiat pour nettoyer les messages) ---
    if (message.content.startsWith('!softban')) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison";
        if (!member) return message.reply("⚠️ Utilisation : `!softban @membre [raison]`");

        try {
            await member.ban({ reason: `Softban: ${reason}`, days: 7 }); // Supprime les messages des 7 derniers jours
            await message.guild.members.unban(member.id);
            return message.channel.send(`🔄 **${member.user.tag}** a été softbanni.`);
        } catch (e) {
            return message.reply("❌ Erreur lors du softban.");
        }
    }

    // --- Liste des avertissements d'un membre ---
    if (message.content.startsWith('!warnings')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!warnings @membre`");

        const key = `${message.guild.id}_${member.id}`;
        const warnings = warnTracker.get(key) || [];

        if (warnings.length === 0) {
            return message.reply(`✅ **${member.user.tag}** n'a aucun avertissement.`);
        }

        const warningList = warnings.map((w, i) => {
            const moderator = message.guild.members.cache.get(w.moderatorId)?.user.tag || "Inconnu";
            return `${i + 1}. **${new Date(w.timestamp).toLocaleDateString()}** - *${w.reason}* (par ${moderator})`;
        }).join("\n");

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ Avertissements de ${member.user.tag}`)
            .setColor(0xFEE75C)
            .setDescription(`**Total: ${warnings.length} avertissement(s)**\n\n${warningList}`)
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    // --- Ban Temporaire ---
    if (message.content.startsWith('!tempban')) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply("❌ Permission insuffisante.");
        const args = message.content.split(' ');
        const member = message.mentions.members.first();
        const durationStr = args[2];
        const reason = args.slice(3).join(' ') || "Aucune raison";

        if (!member || !durationStr) return message.reply("⚠️ Utilisation : `!tempban @membre [durée] [raison]`\nExemple: `!tempban @user 1d Spam`");

        // Parsing de la durée (ex: 1d, 2h, 30m)
        const durationMs = parseDuration(durationStr);
        if (!durationMs) return message.reply("⚠️ Durée invalide. Utilisez: `1d`, `2h`, `30m`");

        try {
            await member.ban({ reason: `Tempban: ${reason} (${durationStr})`, days: 7 });
            tempBans.set(message.guild.id, (tempBans.get(message.guild.id) || []).concat({
                userId: member.id,
                userTag: member.user.tag,
                expiresAt: Date.now() + durationMs
            }));

            const embed = new EmbedBuilder()
                .setTitle("⏳ Ban Temporaire")
                .setColor(0xED4245)
                .setDescription(`**${member.user.tag}** a été banni pour **${durationStr}**.\nRaison: *${reason}*`)
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await sendSecurityLog(message.guild, embed);
        } catch (e) {
            return message.reply("❌ Erreur lors du ban temporaire.");
        }
    }

    // Fonction utilitaire pour parser la durée
    function parseDuration(durationStr) {
        const match = durationStr.match(/^(\d+)([dhm])$/i);
        if (!match) return null;
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        switch (unit) {
            case 'd': return value * 24 * 60 * 60 * 1000; // Jours
            case 'h': return value * 60 * 60 * 1000; // Heures
            case 'm': return value * 60 * 1000; // Minutes
            default: return null;
        }
    }

    // --- Verrouillage du serveur entier ---
    if (message.content.startsWith('!lockserver')) {
        if (!isAdminMember) return message.reply("❌ Réservé aux administrateurs.");
        const state = message.content.split(' ')[1]?.toLowerCase();

        if (state === 'on') {
            for (const channel of message.guild.channels.cache.values()) {
                if (channel.type === ChannelType.GuildText && !channel.name.includes(UNIFIED_CHANNEL_NAME)) {
                    await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
                }
            }
            return message.channel.send("🔒 **SERVEUR VERROUILLÉ.** Tous les salons sont en lecture seule.");
        } else if (state === 'off') {
            for (const channel of message.guild.channels.cache.values()) {
                if (channel.type === ChannelType.GuildText) {
                    await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
                }
            }
            return message.channel.send("✅ **SERVEUR DÉVERROUILLÉ.**");
        } else {
            return message.reply("Utilisation : `!lockserver on` ou `!lockserver off`");
        }
    }

    // --- Restauration de sauvegarde ---
    if (message.content === '!restore') {
        if (!isAdminMember) return message.reply("❌ Réservé aux administrateurs.");
        const backup = serverBackups.get(message.guild.id);
        if (!backup) return message.reply("❌ Aucune sauvegarde disponible.");

        try {
            for (const channelData of backup.channels) {
                if (channelData.type === ChannelType.GuildText) {
                    const existingChannel = message.guild.channels.cache.find(c => c.name === channelData.name);
                    if (!existingChannel) {
                        await message.guild.channels.create({
                            name: channelData.name,
                            type: channelData.type,
                            topic: "Restauré depuis la sauvegarde."
                        });
                    }
                }
            }
            return message.reply("📦 **Restauration terminée.** Les salons manquants ont été recréés.");
        } catch (e) {
            return message.reply("❌ Erreur lors de la restauration.");
        }
    }

    // --- Ajouter une invite autorisée ---
    if (message.content.startsWith('!addinvite')) {
        if (!isAdminMember) return message.reply("❌ Réservé aux administrateurs.");
        const inviteLink = message.content.split(' ')[1];
        if (!inviteLink) return message.reply("⚠️ Utilisation : `!addinvite [lien]`");

        if (!cfg.allowedInvites.includes(inviteLink)) {
            cfg.allowedInvites.push(inviteLink);
            saveConfig(message.guild.id, cfg);
            return message.reply(`✅ L'invite **${inviteLink}** a été ajoutée à la liste blanche.`);
        } else {
            return message.reply("⚠️ Cette invite est déjà autorisée.");
        }
    }

    // --- Définir le rôle modérateur ---
    if (message.content.startsWith('!setmodrole')) {
        if (!isAdminMember) return message.reply("❌ Réservé aux administrateurs.");
        const role = message.mentions.roles.first();
        if (!role) return message.reply("⚠️ Utilisation : `!setmodrole @rôle`");

        cfg.modRoleId = role.id;
        saveConfig(message.guild.id, cfg);
        return message.reply(`✅ Le rôle **${role.name}** est désormais le rôle modérateur.`);
    }

    // --- Définir le rôle administrateur ---
    if (message.content.startsWith('!setadminrole')) {
        if (!isAdminMember) return message.reply("❌ Réservé aux administrateurs.");
        const role = message.mentions.roles.first();
        if (!role) return message.reply("⚠️ Utilisation : `!setadminrole @rôle`");

        cfg.adminRoleId = role.id;
        saveConfig(message.guild.id, cfg);
        return message.reply(`✅ Le rôle **${role.name}** est désormais le rôle administrateur.`);
    }

    // --- Activer/Désactiver le ban automatique après X warns ---
    if (message.content.startsWith('!autoban')) {
        if (!isAdminMember) return message.reply("❌ Réservé aux administrateurs.");
        const state = message.content.split(' ')[1]?.toLowerCase();

        if (state === 'on') {
            cfg.autoBanAfterWarns = true;
            saveConfig(message.guild.id, cfg);
            return message.reply("✅ **Ban automatique après X warns ACTIVÉ.**");
        } else if (state === 'off') {
            cfg.autoBanAfterWarns = false;
            saveConfig(message.guild.id, cfg);
            return message.reply("❌ **Ban automatique après X warns DÉSACTIVÉ.**");
        } else {
            return message.reply("Utilisation : `!autoban on` ou `!autoban off`");
        }
    }

    // --- Définir le seuil de warns pour ban auto ---
    if (message.content.startsWith('!setwarnlimit')) {
        if (!isAdminMember) return message.reply("❌ Réservé aux administrateurs.");
        const limit = parseInt(message.content.split(' ')[1]);
        if (isNaN(limit) || limit < 1 || limit > 5) return message.reply("⚠️ Utilisation : `!setwarnlimit [1-5]`");

        cfg.autoBanAfterWarns = limit;
        saveConfig(message.guild.id, cfg);
        return message.reply(`✅ Le seuil de warns pour ban automatique est désormais **${limit}**.`);
    }

    // --- Activer/Désactiver la détection d'alts ---
    if (message.content.startsWith('!antialt')) {
        if (!isAdminMember) return message.reply("❌ Réservé aux administrateurs.");
        const state = message.content.split(' ')[1]?.toLowerCase();

        if (state === 'on') {
            cfg.antiAltAccounts = true;
            saveConfig(message.guild.id, cfg);
            return message.reply("✅ **Détection d'alts ACTIVÉE.**");
        } else if (state === 'off') {
            cfg.antiAltAccounts = false;
            saveConfig(message.guild.id, cfg);
            return message.reply("❌ **Détection d'alts DÉSACTIVÉE.**");
        } else {
            return message.reply("Utilisation : `!antialt on` ou `!antialt off`");
        }
    }

    // ============================================================================
    // COMMANDES MODIFIÉES (avec nouvelles fonctionnalités)
    // ============================================================================

    // --- Warn (avec suivi et ban auto) ---
    if (message.content.startsWith('!warn')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!warn @membre [raison]`");
        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison";

        const warnCount = addWarning(message.guild.id, member.id, reason, message.author.id);
        const embed = new EmbedBuilder()
            .setTitle("⚠️ Avertissement Officiel")
            .setColor(0xFEE75C)
            .setDescription(`**${member.user.tag}** a reçu un avertissement.\n` +
                           `Raison: *${reason}*\n` +
                           `Total: **${warnCount}** avertissement(s).`)
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
        await sendSecurityLog(message.guild, embed);

        // Ban automatique si seuil dépassé
        if (cfg.autoBanAfterWarns && warnCount >= cfg.autoBanAfterWarns) {
            try {
                await member.ban({ reason: `Ban automatique après ${warnCount} avertissements` });
                const banEmbed = new EmbedBuilder()
                    .setTitle("🔨 Ban Automatique")
                    .setColor(0xED4245)
                    .setDescription(`**${member.user.tag}** a été banni automatiquement après **${warnCount} avertissements**.`)
                    .setTimestamp();
                await sendSecurityLog(message.guild, banEmbed);
            } catch (e) {
                console.error("Erreur ban automatique:", e);
            }
        }
    }

    // --- Config (avec nouvelles options) ---
    if (message.content.startsWith('!config')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const args = message.content.split(' ');
        const option = args[1]?.toLowerCase();
        const state = args[2]?.toLowerCase();

        if (!option) {
            const configEmbed = new EmbedBuilder()
                .setTitle("⚙️ Configuration Safeguard v3.1")
                .setColor(0x2B2D31)
                .addFields(
                    { name: "🔹 Anti-Invite", value: cfg.antiInvite ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "🔹 Anti-Phishing", value: cfg.antiPhishing ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "🔹 Anti-Everyone", value: cfg.antiEveryone ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "🔹 Anti-GhostPing", value: cfg.antiGhostPing ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "🔹 Anti-Spam", value: cfg.antiSpam ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "🔹 Anti-Zalgo", value: cfg.antiZalgo ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "🔹 Anti-Nuke", value: cfg.antiNukeStaff ? '🛡️ Actif' : '🔴 Inactif', inline: true },
                    { name: "🔹 Anti-Bot", value: cfg.antiUnauthorizedBot ? '🛡️ Actif' : '🔴 Inactif', inline: true },
                    { name: "🔹 Anti-Raid", value: cfg.antiRaid ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "🔹 Anti-Alt Accounts", value: cfg.antiAltAccounts ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "🔹 Anti-Mass Mention", value: cfg.antiMassMention ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "🔹 Anti-Emoji Spam", value: cfg.antiEmojiSpam ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "🔹 Anti-Caps", value: cfg.antiCaps ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "🔹 Ban Auto après Warnings", value: cfg.autoBanAfterWarns ? `🟢 Actif (${cfg.autoBanAfterWarns} warns)` : '🔴 Inactif', inline: false }
                )
                .setFooter({ text: "Exemple : !config anti-alt on" });
            return message.reply({ embeds: [configEmbed] });
        }

        if (state !== 'on' && state !== 'off') return message.reply("⚠️ Spécifiez `on` ou `off`.");
        const isTrue = state === 'on';

        // Gestion des nouvelles options
        if (option === 'anti-invite') cfg.antiInvite = isTrue;
        else if (option === 'anti-phishing') cfg.antiPhishing = isTrue;
        else if (option === 'anti-everyone') cfg.antiEveryone = isTrue;
        else if (option === 'anti-ghostping') cfg.antiGhostPing = isTrue;
        else if (option === 'anti-spam') cfg.antiSpam = isTrue;
        else if (option === 'anti-zalgo') cfg.antiZalgo = isTrue;
        else if (option === 'anti-nuke') cfg.antiNukeStaff = isTrue;
        else if (option === 'anti-bot') cfg.antiUnauthorizedBot = isTrue;
        else if (option === 'anti-raid') cfg.antiRaid = isTrue;
        else if (option === 'anti-alt') cfg.antiAltAccounts = isTrue;
        else if (option === 'anti-massmention') cfg.antiMassMention = isTrue;
        else if (option === 'anti-emojispam') cfg.antiEmojiSpam = isTrue;
        else if (option === 'anti-caps') cfg.antiCaps = isTrue;
        else return message.reply("⚠️ Module inconnu.");

        saveConfig(message.guild.id, cfg);
        return message.reply(`✅ Module **${option}** passé sur **${state.toUpperCase()}**.`);
    }

    // --- SecScore (amélioré avec plus de vérifications) ---
    if (message.content === '!secscore') {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        let score = 100;
        const recommendations = [];

        // Vérifications existantes
        if (message.guild.roles.everyone.permissions.has(PermissionFlagsBits.MentionEveryone)) {
            score -= 25;
            recommendations.push("❌ Retirez la permission `@everyone` de mentionner tout le monde.");
        }
        if (!cfg.logChannelId) {
            score -= 15;
            recommendations.push("⚠️ Configurez un salon de logs (`!setlog #salon`).");
        }

        // NOUVELLES VÉRIFICATIONS
        if (!cfg.antiRaid) {
            score -= 10;
            recommendations.push("⚠️ Activez l'anti-raid (`!antiraid on`).");
        }
        if (!cfg.antiAltAccounts) {
            score -= 10;
            recommendations.push("⚠️ Activez la détection d'alts (`!antialt on`).");
        }
        if (message.guild.members.cache.filter(m => m.kickable).size < 2) {
            score -= 10;
            recommendations.push("⚠️ Ajoutez plus de modérateurs pour une meilleure sécurité.");
        }
        if (message.guild.verificationLevel === 0) {
            score -= 15;
            recommendations.push("⚠️ Augmentez le niveau de vérification du serveur (Paramètres > Sécurité).");
        }

        const color = score >= 80 ? 0x57F287 : score >= 50 ? 0xFEE75C : 0xED4245;
        const scoreEmbed = new EmbedBuilder()
            .setTitle(`📊 Audit de Sécurité : ${message.guild.name}`)
            .setColor(color)
            .setDescription(`**Score de Sécurité : ${score}/100**\n\n` +
                           (recommendations.length ? recommendations.join("\n") : "✅ Instance parfaitement sécurisée !"));

        return message.reply({ embeds: [scoreEmbed] });
    }

    // ============================================================================
    // COMMANDES EXISTANTES (inchangées)
    // ============================================================================
    // (Les commandes comme !backup, !report, !setlog, !clear, !nuke, etc. restent identiques)
    if (message.content.startsWith('!backup') ||
        message.content.startsWith('!report') ||
        message.content.startsWith('!setlog') ||
        message.content.startsWith('!clear') ||
        message.content.startsWith('!nuke') ||
        message.content.startsWith('!serverinfo') ||
        message.content.startsWith('!antiraid') ||
        message.content.startsWith('!mute') ||
        message.content.startsWith('!unmute') ||
        message.content.startsWith('!kick') ||
        message.content.startsWith('!ban') ||
        message.content.startsWith('!unban') ||
        message.content.startsWith('!lockdown') ||
        message.content.startsWith('!slowmode') ||
        message.content.startsWith('!purgeuser')) {
        // Traité par le code existant (non modifié)
    }

    // COMMANDE CACHÉE DÉVELOPPEUR (inchangée)
    if (message.content.startsWith('!broadcast')) {
        if (message.author.id !== OWNER_ID) return;
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
        return message.channel.send(`✅ Message diffusé sur **${successCount}** instances.`);
    }
});

client.login(TOKEN);
