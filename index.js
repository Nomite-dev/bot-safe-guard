// ============================================================================
// 🛡️ n0mit Safeguard v3.0 - Édition Intégrale Unifiée
// Écosystème n0mit CoreSystems
// ============================================================================

console.log("=== SAUVEGARDE DB ===", JSON.stringify(require('./database.json')));


const { 
    Client, 
    GatewayIntentBits, 
    PermissionFlagsBits, 
    ChannelType, 
    EmbedBuilder, 
    AuditLogEvent 
} = require('discord.js');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ============================================================================
// 1. SERVEUR WEB KEEP-ALIVE
// ============================================================================
http.createServer((req, res) => {
    res.write("n0mit Safeguard v3.0 - Operational 24/7");
    res.end();
}).listen(process.env.PORT || 3000);

// ============================================================================
// 1.5 PERSISTANCE DES DONNÉES (PERSISTENCE LOCALE)
// ============================================================================
const DB_FILE = path.join(__dirname, 'database.json');

function loadData() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const initialData = { guildConfigs: {}, restrictedUsers: [], devStaff: [] };
            fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
            return initialData;
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Erreur de chargement de la base de données :", e);
        return { guildConfigs: {}, restrictedUsers: [], devStaff: [] };
    }
}

function saveData() {
    try {
        const dataToSave = {
            guildConfigs: Object.fromEntries(guildConfigs),
            restrictedUsers: Array.from(restrictedUsers),
            devStaff: Array.from(devStaff)
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (e) {
        console.error("Erreur de sauvegarde de la base de données :", e);
    }
}

const db = loadData();
const guildConfigs = new Map(Object.entries(db.guildConfigs || {}));
const restrictedUsers = new Set(db.restrictedUsers || []);
const devStaff = new Set(db.devStaff || []);

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
const OWNER_ID = "1440037449546989701"; 
const RESTRICT_PASSWORD = "6280"; // Mot de passe Staff Dev Bot
const UNIFIED_CHANNEL_NAME = "📢｜n0mit-coresystems";
const SUPPORT_SERVER_LINK = "https://discord.gg/n0mit"; // Lien du serveur principal / hub

const staffActionTracker = new Map();
const spamTracker = new Map();
const serverBackups = new Map(); // Stockage mémoire des sauvegardes

client.on('shardError', error => {
    console.error('❌ Erreur de connexion WebSocket (Shard) :', error);
});

client.on('shardDisconnect', (event, id) => {
    console.warn(`⚠️ Bot déconnecté de Discord (Shard ${id}). Reconnexion...`);
});

client.on('shardReconnecting', id => {
    console.log(`🔄 Tentative de reconnexion à Discord (Shard ${id})...`);
});


function isBotDev(userId) {
    return userId === OWNER_ID || devStaff.has(userId);
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
            restrictSystem: true,
            logChannelId: null
        });
        saveData();
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
        console.error("Erreur d'envoi du log :", e);
    }
}

// ============================================================================
// 3. SYNCHRONISATION SALON UNIFIÉ (AVEC PERMISSIONS PROPRIÉTAIRE)
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
                topic: `Annonces et informations système officielles de n0mit CoreSystems. Hub : ${SUPPORT_SERVER_LINK}`,
                permissionOverwrites: [
                    {
                        // Tout le monde : lecture seule
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.SendMessages],
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
                    },
                    {
                        // Le Bot : droits d'envoi
                        id: guild.members.me.id,
                        allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels]
                    },
                    {
                        // Le Propriétaire du Serveur (Owner) : Accès et contrôle total
                        id: guild.ownerId,
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ManageMessages, 
                            PermissionFlagsBits.ManageChannels, 
                            PermissionFlagsBits.ReadMessageHistory
                        ]
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
            .setFooter({ text: `n0mit CoreSystems • ${SUPPORT_SERVER_LINK}` })
            .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => {});
    }
});

// ============================================================================
// 4. MODULES DE SÉCURITÉ AUTOMATIQUES
// ============================================================================

// A. Anti-Bot Tiers & Anti-Raid Comptes Récents
client.on('guildMemberAdd', async (member) => {
    const cfg = getConfig(member.guild.id);

    if (member.user.bot && cfg.antiUnauthorizedBot) {
        try {
            const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd });
            const entry = logs.entries.first();
            if (entry && entry.executor.id !== member.guild.ownerId) {
                await member.kick("Bot non autorisé par le propriétaire.");
                const embed = new EmbedBuilder()
                    .setTitle("🚨 BOT NON AUTORISÉ EXPULSÉ")
                    .setColor(0xED4245)
                    .setDescription(`Le bot **${member.user.tag}** ajouté par <@${entry.executor.id}> a été expulsé immédiatement.`)
                    .setTimestamp();
                await sendSecurityLog(member.guild, embed);
            }
        } catch (e) {}
    }

    if (!member.user.bot && cfg.antiRaid) {
        const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
        if (accountAgeDays < 1) {
            try {
                await member.timeout(24 * 60 * 60 * 1000, "Anti-Raid : Compte récent");
                const embed = new EmbedBuilder()
                    .setTitle("🛡️ Anti-Raid : Quarantaine")
                    .setColor(0xFEE75C)
                    .setDescription(`Le compte récent **${member.user.tag}** (< 24h) a été placé en isolement temporaire.`);
                await sendSecurityLog(member.guild, embed);
            } catch (e) {}
        }
    }
});

// B. Anti-Nuke Staff (Protection contre la destruction par un Admin)
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
                    .setTitle("💥 TENTATIVE DE NUKE INTERCEPTÉE")
                    .setColor(0xED4245)
                    .setDescription(`L'administrateur **${executor.tag}** a supprimé plusieurs salons consécutifs.\n🔒 **Droits administratifs révoqués en urgence.**`)
                    .setTimestamp();

                await sendSecurityLog(channel.guild, nukeEmbed);
                const owner = await channel.guild.fetchOwner();
                await owner.send({ embeds: [nukeEmbed] }).catch(() => {});
            }
        }
    } catch (e) {}
});

// C. Ghost-Ping Detection
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
                { name: "Contenu", value: message.content || "*Masqué*" }
            )
            .setTimestamp();
        await sendSecurityLog(message.guild, ghostEmbed);
    }
});

// ============================================================================
// 5. READY ET ÉVÉNEMENTS
// ============================================================================
client.on('ready', () => {
    console.log(`🛡️ n0mit Safeguard v3.0 actif pour ${client.guilds.cache.size} serveurs.`);
    // Statut mis à jour avec la marque n0mit CoreSystems
    client.user.setActivity('n0mit CoreSystems | !help', { type: 3 });
});

client.on('guildCreate', async (guild) => {
    try {
        const targetChannel = await getOrCreateCoreChannel(guild);
        if (!targetChannel) return;

        const welcomeEmbed = new EmbedBuilder()
            .setTitle("🛡️ n0mit Safeguard v3.0 | Protection Maximale")
            .setColor(0x57F287)
            .setDescription("Ce serveur est sécurisé par l'écosystème **n0mit CoreSystems**.")
            .addFields(
                { name: "🛡️ Anti-Nuke Staff", value: "Neutralise les modérateurs malveillants.", inline: true },
                { name: "⚡ Anti-Spam & Zalgo", value: "Filtre les caractères toxiques et le spam.", inline: true },
                { name: "📦 Structure & Config", value: "Commandes `!backup` et `!config` à disposition.", inline: true }
            )
            .setFooter({ text: `n0mit CoreSystems • Hub : ${SUPPORT_SERVER_LINK} • Tapez !help` });

        await targetChannel.send({ embeds: [welcomeEmbed] });
    } catch (err) {}
});

// ============================================================================
// 6. GESTION DES MESSAGES & COMMANDES
// ============================================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    let rawContent = message.content.trim();
    let usedPrefix = null;

    if (rawContent.startsWith('n!')) usedPrefix = 'n!';
    else if (rawContent.startsWith('!')) usedPrefix = '!';
    else if (rawContent.startsWith('.help')) usedPrefix = '.';

    if (!usedPrefix) return;

    const fullCmd = rawContent.slice(usedPrefix.length).trim();
    const args = fullCmd.split(/ +/);
    const command = args.shift().toLowerCase();

    const cfg = getConfig(message.guild.id);

    // --- SÉCURITÉ RESTRICTION (SI ACTIVÉ DANS LA CONFIG) ---
    if (cfg.restrictSystem && restrictedUsers.has(message.author.id)) {
        if (message.author.id === OWNER_ID && command === 'unrestrict') {
            // Permet au propriétaire de lever la restriction
        } else {
            await message.delete().catch(() => {});
            return message.channel.send(`🚫 ${message.author}, vous êtes actuellement restreint. Vos actions sont bloquées.`)
                .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
        }
    }

    const isStaff = message.member.permissions.has(PermissionFlagsBits.ManageMessages);

    // --- FILTRES PASSIFS ---

    // 1. Anti-Spam Rapide
    if (cfg.antiSpam && !isStaff) {
        const userId = message.author.id;
        const now = Date.now();
        const userSpam = spamTracker.get(userId) || { count: 0, lastMsg: now };

        if (now - userSpam.lastMsg < 3000) {
            userSpam.count++;
            if (userSpam.count >= 5) {
                await message.member.timeout(5 * 60 * 1000, "Anti-Spam Automatique");
                await message.channel.send(`🤐 ${message.author} a été réduit au silence pendant 5 minutes pour spam.`);
                userSpam.count = 0;
            }
        } else {
            userSpam.count = 1;
        }
        userSpam.lastMsg = now;
        spamTracker.set(userId, userSpam);
    }

    // 2. Anti-Zalgo & Caractères Suspects
    if (cfg.antiZalgo && !isStaff) {
        const zalgoRegex = /[\u0300-\u036f\u1ab0-\u1ace\u1dc0-\u1ffe\u20d0-\u20ff]/g;
        if (zalgoRegex.test(message.content)) {
            await message.delete().catch(() => {});
            return message.channel.send(`⚠️ ${message.author}, les caractères invisibles ou altérés sont interdits.`).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
        }
    }

    // 3. Anti-Invite
    if (cfg.antiInvite && !isStaff) {
        const inviteRegex = /(discord\.(gg|me|com)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i;
        if (inviteRegex.test(message.content)) {
            await message.delete().catch(() => {});
            return message.channel.send(`⚠️ ${message.author}, pub/invitation interdite.`).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
        }
    }

    // 4. Anti-Phishing
    if (cfg.antiPhishing && !isStaff) {
        const scamRegex = /(steamcommun|discord-gift|free-nitro|steam-promo|airdrop-gift|grabify|iplogger)/i;
        if (scamRegex.test(message.content)) {
            await message.delete().catch(() => {});
            try { await message.member.timeout(30 * 60 * 1000, "Lien Phishing"); } catch(e) {}
            return message.channel.send(`🚨 ${message.author}, tentative d'envoi de lien malveillant détectée.`);
        }
    }

    // ============================================================================
    // COMMANDES CACHÉES / SÉCURISÉES DÉVELOPPEUR BOT
    // ============================================================================

    // 🔒 ACCÈS STAFF BOT (ACCEPTE LE MDP)
    if (command === 'staff') {
        const inputPassword = args[0];

        if (!inputPassword || inputPassword !== RESTRICT_PASSWORD) {
            await message.delete().catch(() => {});
            // SÉCURITÉ : Le mot de passe n'est plus révélé dans l'exemple !
            return message.channel.send(`🔒 **Accès Développeur Bot** : Veuillez fournir le mot de passe secret.\nExemple : \`${usedPrefix}staff [code_secret]\``)
                .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }

        devStaff.add(message.author.id);
        saveData();
        await message.delete().catch(() => {});

        const devEmbed = new EmbedBuilder()
            .setTitle("⚙️ Panneau d'Administration Dev - n0mit Safeguard")
            .setColor(0xED4245)
            .setDescription(`Bienvenue **${message.author.tag}**. Authentification réussie.`)
            .addFields(
                { name: "🚫 Modération Bot Global", value: `\`${usedPrefix}restrict @membre [code]\` • *Restreindre un membre*\n\`${usedPrefix}unrestrict @membre [code]\` • *Enlever la restriction*` },
                { name: "📢 Diffusions & Debug", value: `\`${usedPrefix}broadcast [message]\` • *Annonce globale (Owner uniquement)*` }
            )
            .setFooter({ text: `Session Staff Bot Active • Hub : ${SUPPORT_SERVER_LINK}` });

        return message.channel.send({ embeds: [devEmbed] });
    }

    // 🔒 RESTRICTION D'UN MEMBRE
    if (command === 'restrict') {
        if (!cfg.restrictSystem) return message.reply("❌ Le système de restriction est désactivé sur ce serveur.");
        
        const target = message.mentions.members.first();
        const pass = args[1];

        if (!target) return message.reply(`⚠️ Utilisation : \`${usedPrefix}restrict @membre [mot_de_passe]\``);

        if (pass !== RESTRICT_PASSWORD) {
            return message.reply("❌ Mot de passe de restriction incorrect.");
        }

        restrictedUsers.add(target.id);
        saveData();

        return message.channel.send(`🚫 **${target.user.tag}** a été restreint.`);
    }

    // 🔓 LEVÉE DE LA RESTRICTION
    if (command === 'unrestrict') {
        if (!cfg.restrictSystem) return message.reply("❌ Le système de restriction est désactivé sur ce serveur.");

        const target = message.mentions.members.first();
        const pass = args[1];

        if (message.author.id === OWNER_ID) {
            restrictedUsers.delete(message.author.id);
            if (target) restrictedUsers.delete(target.id);
            saveData();
            return message.channel.send(`✅ Restriction levée.`);
        }

        if (!target) return message.reply(`⚠️ Utilisation : \`${usedPrefix}unrestrict @membre [mot_de_passe]\``);

        if (pass !== RESTRICT_PASSWORD) {
            return message.reply("❌ Mot de passe incorrect.");
        }

        restrictedUsers.delete(target.id);
        saveData();

        return message.channel.send(`✅ **${target.user.tag}** n'est plus restreint.`);
    }

    // 📢 COMMANDE DIFFUSION (STRICTEMENT RÉSERVÉE À L'OWNER DU BOT)
    if (command === 'broadcast') {
        if (message.author.id !== OWNER_ID) {
            return message.reply("❌ Seul le propriétaire principal du bot (Owner) peut exécuter cette commande.");
        }
        
        const announcement = args.join(' ');
        if (!announcement) return message.reply(`⚠️ Utilisation : \`${usedPrefix}broadcast [texte]\``);

        let successCount = 0;
        const broadEmbed = new EmbedBuilder()
            .setTitle("📢 COMMUNIQUÉ OFFICIEL n0mit CoreSystems")
            .setColor(0x5865F2)
            .setDescription(announcement)
            .setFooter({ text: `n0mit CoreSystems • ${SUPPORT_SERVER_LINK}` })
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

    // ============================================================================
    // COMMANDES COMPLÈTES (!HELP)
    // ============================================================================

    // 📜 MENU AIDE
    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle("🛡️ Centre de Contrôle n0mit Safeguard")
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
                        "`!unban [ID_utilisateur]` • *Révoque un bannissement*"
                },
                {
                    name: "🚨 Gestion de Crise & Salons",
                    value: 
                        "`!lockdown on/off` • *Verrouille ou déverrouille le salon*\n" +
                        "`!slowmode [secondes]` • *Ajuste le mode lent du salon*\n" +
                        "`!clear [1-100]` • *Supprime un volume de messages récents*\n" +
                        "`!purgeuser @membre [1-100]` • *Supprime les messages d'un compte spécifique*\n" +
                        "`!nuke` • *Recommence le salon à neuf (Admin)*"
                },
                {
                    name: "⚙️ Sécurité, Filtres & Backups",
                    value: 
                        "`!secscore` • *Audit et note de sécurité du serveur /100*\n" +
                        "`!config` • *Affiche et gère l'état de tous les modules*\n" +
                        "`!antiraid on/off` • *Quarantaine automatique des comptes récents*\n" +
                        "`!backup` • *Sauvegarde la structure actuelle des salons*\n" +
                        "`!report @membre [raison]` • *Signale un membre aux modérateurs*\n" +
                        "`!setlog #salon` • *Définit le salon de réception des alertes*\n" +
                        "`!serverinfo` • *Affiche les informations générales du serveur*"
                }
            )
            .setFooter({ text: `Écosystème n0mit CoreSystems • Support : ${SUPPORT_SERVER_LINK}` })
            .setTimestamp();

        return message.reply({ embeds: [helpEmbed] });
    }

    // AUDIT SÉCURITÉ
    if (command === 'secscore') {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        let score = 100;
        const recommendations = [];

        if (message.guild.roles.everyone.permissions.has(PermissionFlagsBits.MentionEveryone)) {
            score -= 25;
            recommendations.push("❌ Retirez la permission `@everyone` de mentionner tout le monde.");
        }
        if (!cfg.logChannelId) {
            score -= 15;
            recommendations.push("⚠️ Configurez un salon de logs (`!setlog #salon`).");
        }

        const color = score >= 80 ? 0x57F287 : 0xED4245;
        const scoreEmbed = new EmbedBuilder()
            .setTitle(`📊 Audit de Sécurité : ${message.guild.name}`)
            .setColor(color)
            .setDescription(`**Score de Sécurité : ${score}/100**\n\n` + (recommendations.length ? recommendations.join("\n") : "✅ Instance parfaitement sécurisée !"))
            .setFooter({ text: `n0mit CoreSystems • ${SUPPORT_SERVER_LINK}` });

        return message.reply({ embeds: [scoreEmbed] });
    }

    // SAUVEGARDE DU SERVEUR (Enregistrement de la structure des salons)
    if (command === 'backup') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Réservé aux administrateurs.");

        const channelsData = message.guild.channels.cache.map(c => ({ name: c.name, type: c.type }));
        serverBackups.set(message.guild.id, { timestamp: new Date(), channels: channelsData });

        const backupEmbed = new EmbedBuilder()
            .setTitle("📦 Sauvegarde Effectuée")
            .setColor(0x57F287)
            .setDescription(`La structure actuelle de **${channelsData.length} salons** a été enregistrée en mémoire.`);

        return message.reply({ embeds: [backupEmbed] });
    }

    // SIGNALEMENT MEMBRE
    if (command === 'report') {
        const member = message.mentions.members.first();
        const reason = args.slice(1).join(' ');
        if (!member || !reason) return message.reply(`⚠️ Utilisation : \`${usedPrefix}report @membre [raison]\``);

        await message.delete().catch(() => {});

        const reportEmbed = new EmbedBuilder()
            .setTitle("📩 Nouveau Signalement")
            .setColor(0xED4245)
            .addFields(
                { name: "Membre signalé", value: `${member} (${member.id})`, inline: true },
                { name: "Auteur du signalement", value: `${message.author}`, inline: true },
                { name: "Raison", value: reason }
            )
            .setTimestamp();

        await sendSecurityLog(message.guild, reportEmbed);
        return message.channel.send(`✅ Merci ${message.author}, votre signalement a été transmis à l'équipe de modération.`).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
    }

    // CONFIGURATION MODULES
    if (command === 'config') {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const option = args[0]?.toLowerCase();
        const state = args[1]?.toLowerCase();

        if (!option) {
            const configEmbed = new EmbedBuilder()
                .setTitle("⚙️ Configuration Safeguard v3.0")
                .setColor(0x2B2D31)
                .addFields(
                    { name: "anti-invite", value: cfg.antiInvite ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "anti-phishing", value: cfg.antiPhishing ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "anti-everyone", value: cfg.antiEveryone ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "anti-ghostping", value: cfg.antiGhostPing ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "anti-spam", value: cfg.antiSpam ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "anti-zalgo", value: cfg.antiZalgo ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "anti-nuke", value: cfg.antiNukeStaff ? '🛡️ Actif' : '🔴 Inactif', inline: true },
                    { name: "anti-bot", value: cfg.antiUnauthorizedBot ? '🛡️ Actif' : '🔴 Inactif', inline: true },
                    { name: "restriction", value: cfg.restrictSystem ? '🛡️ Actif' : '🔴 Inactif', inline: true }
                )
                .setFooter({ text: "Exemple : !config restriction off" });
            return message.reply({ embeds: [configEmbed] });
        }

        if (state !== 'on' && state !== 'off') return message.reply("⚠️ Spécifiez `on` ou `off`.");
        const isTrue = state === 'on';

        if (option === 'anti-invite') cfg.antiInvite = isTrue;
        else if (option === 'anti-phishing') cfg.antiPhishing = isTrue;
        else if (option === 'anti-everyone') cfg.antiEveryone = isTrue;
        else if (option === 'anti-ghostping') cfg.antiGhostPing = isTrue;
        else if (option === 'anti-spam') cfg.antiSpam = isTrue;
        else if (option === 'anti-zalgo') cfg.antiZalgo = isTrue;
        else if (option === 'anti-nuke') cfg.antiNukeStaff = isTrue;
        else if (option === 'anti-bot') cfg.antiUnauthorizedBot = isTrue;
        else if (option === 'restriction') cfg.restrictSystem = isTrue;
        else return message.reply("⚠️ Module inconnu.");

        saveData();
        return message.reply(`✅ Module **${option}** passé sur **${state.toUpperCase()}**.`);
    }

    // ANTI-RAID
    if (command === 'antiraid') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Réservé aux administrateurs.");
        const state = args[0]?.toLowerCase();

        if (state === 'on') {
            cfg.antiRaid = true;
            saveData();
            return message.channel.send("🚨 **ANTI-RAID ACTIVÉ.** Les comptes de moins de 24h seront mis en quarantaine.");
        } else if (state === 'off') {
            cfg.antiRaid = false;
            saveData();
            return message.channel.send("✅ **ANTI-RAID DÉSACTIVÉ.** Arrivées normales rétablies.");
        } else {
            return message.reply(`Utilisation : \`${usedPrefix}antiraid on\` ou \`${usedPrefix}antiraid off\``);
        }
    }

    // LOG CHANNEL
    if (command === 'setlog') {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply(`⚠️ Mentionnez un salon. Exemple : \`${usedPrefix}setlog #logs-sécurité\``);
        cfg.logChannelId = channel.id;
        saveData();
        return message.reply(`✅ Salon des rapports connecté avec succès à ${channel}`);
    }

    // PURGE USER
    if (command === 'purgeuser') {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const targetMember = message.mentions.members.first();
        const limit = parseInt(args[1]) || 50;
        if (!targetMember) return message.reply(`⚠️ Utilisation : \`${usedPrefix}purgeuser @membre [1-100]\``);

        try {
            await message.delete().catch(() => {});
            const messages = await message.channel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(m => m.author.id === targetMember.id).first(limit);
            await message.channel.bulkDelete(userMessages, true);
            const msg = await message.channel.send(`🧹 **${userMessages.length}** messages de ${targetMember} nettoyés.`);
            setTimeout(() => msg.delete().catch(() => {}), 3000);
        } catch (e) {
            return message.reply("❌ Erreur lors du nettoyage.");
        }
    }

    // MODÉRATION CLASSIQUE
    if (command === 'warn') {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply(`⚠️ Utilisation : \`${usedPrefix}warn @membre [raison]\``);
        const reason = args.slice(1).join(' ') || "Aucune raison";
        return message.channel.send(`⚠️ **AVERTISSEMENT** : ${member} a reçu un avertissement. Raison : *${reason}*`);
    }

    if (command === 'slowmode') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply("❌ Permission insuffisante.");
        const seconds = parseInt(args[0]);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) return message.reply(`⚠️ Utilisation : \`${usedPrefix}slowmode [secondes]\``);
        await message.channel.setRateLimitPerUser(seconds);
        return message.channel.send(`⏱️ Mode lent ajusté à **${seconds}s**.`);
    }

    if (command === 'lockdown') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Réservé aux administrateurs.");
        const state = args[0]?.toLowerCase();
        if (state === 'on') {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            return message.channel.send("🚨 **SALON VERROUILLÉ.**");
        } else if (state === 'off') {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            return message.channel.send("✅ **SALON DÉVERROUILLÉ.**");
        } else {
            return message.reply(`Utilisation : \`${usedPrefix}lockdown on\` ou \`${usedPrefix}lockdown off\``);
        }
    }

    if (command === 'mute') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        const duration = parseInt(args[1]);
        if (!member || isNaN(duration)) return message.reply(`⚠️ Utilisation : \`${usedPrefix}mute @membre [minutes] [raison]\``);
        await member.timeout(duration * 60 * 1000, args.slice(2).join(' ') || "Aucune raison");
        return message.channel.send(`🔇 **${member.user.tag}** est muet pendant ${duration} min.`);
    }

    if (command === 'unmute') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply(`⚠️ Utilisation : \`${usedPrefix}unmute @membre\``);
        await member.timeout(null);
        return message.channel.send(`🔊 La sanction de **${member.user.tag}** a été levée.`);
    }

    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply(`⚠️ Utilisation : \`${usedPrefix}kick @membre [raison]\``);
        await member.kick(args.slice(1).join(' ') || "Aucune raison");
        return message.channel.send(`👢 **${member.user.tag}** a été expulsé.`);
    }

    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply(`⚠️ Utilisation : \`${usedPrefix}ban @membre [raison]\``);
        await member.ban({ reason: args.slice(1).join(' ') || "Aucune raison" });
        return message.channel.send(`🔨 **${member.user.tag}** a été banni.`);
    }

    if (command === 'unban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply("❌ Permission insuffisante.");
        const userId = args[0];
        if (!userId) return message.reply(`⚠️ Utilisation : \`${usedPrefix}unban [ID_utilisateur]\``);
        await message.guild.members.unban(userId);
        return message.channel.send(`✅ ID \`${userId}\` débanni.`);
    }

    if (command === 'clear') {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const count = parseInt(args[0]);
        if (isNaN(count) || count < 1 || count > 100) return message.reply(`⚠️ Utilisation : \`${usedPrefix}clear [1-100]\``);
        await message.delete().catch(() => {});
        const deleted = await message.channel.bulkDelete(count, true);
        const msg = await message.channel.send(`🧹 **${deleted.size}** messages nettoyés.`);
        setTimeout(() => msg.delete().catch(() => {}), 3000);
    }

    if (command === 'nuke') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Réservé aux administrateurs.");
        const pos = message.channel.position;
        const newChannel = await message.channel.clone();
        await message.channel.delete();
        await newChannel.setPosition(pos);
        return newChannel.send("💥 **SALON RÉINITIALISÉ.**");
    }

    if (command === 'serverinfo') {
        return message.reply(`📊 **${message.guild.name}**\n• Propriétaire : <@${message.guild.ownerId}>\n• Membres : \`${message.guild.memberCount}\`\n• Créé le : \`${message.guild.createdAt.toLocaleDateString()}\`\n• Écosystème : n0mit CoreSystems`);
    }
});

console.log("🔄 Tentative d'initialisation de la session Discord...");

client.login(TOKEN).catch(error => {
    console.error("❌ ERREUR CRITIQUE AU LOGIN DISCORD :", error);
});
