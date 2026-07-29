// ============================================================================
// 🛡️ n0mit Safeguard v3.0 - Édition Utile & Incontournable
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
const fs = require('fs');
const path = require('path');

// ============================================================================
// 1. SERVEUR WEB KEEP-ALIVE
// ============================================================================
http.createServer((req, res) => {
    res.write("n0mit Safeguard v3.0 - Online 24/7");
    res.end();
}).listen(process.env.PORT || 3000);

// ============================================================================
// 1.5 PERSISTANCE DES DONNÉES (RENDER RESTARTS FIX)
// ============================================================================
const DB_FILE = path.join(__dirname, 'database.json');

function loadData() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const initialData = { guildConfigs: {}, restrictedUsers: [] };
            fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
            return initialData;
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Erreur de chargement de la base de données :", e);
        return { guildConfigs: {}, restrictedUsers: [] };
    }
}

function saveData() {
    try {
        const dataToSave = {
            guildConfigs: Object.fromEntries(guildConfigs),
            restrictedUsers: Array.from(restrictedUsers)
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (e) {
        console.error("Erreur de sauvegarde de la base de données :", e);
    }
}

const db = loadData();
const guildConfigs = new Map(Object.entries(db.guildConfigs || {}));
const restrictedUsers = new Set(db.restrictedUsers || []);

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
const RESTRICT_PASSWORD = "6280";
const UNIFIED_CHANNEL_NAME = "📢｜n0mit-coresystems";

const staffActionTracker = new Map();
const spamTracker = new Map();
const serverBackups = new Map(); // Stockage mémoire des sauvegardes

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
// 3. SYNCHRONISATION SALON UNIFIÉ
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
    client.user.setActivity('Protéger le serveur | !help', { type: 3 });
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
                { name: "📦 Sauvegarde Express", value: "`!backup` pour sécuriser vos salons.", inline: true }
            )
            .setFooter({ text: "Tapez !help pour consulter la liste des commandes." });

        await targetChannel.send({ embeds: [welcomeEmbed] });
    } catch (err) {}
});

// ============================================================================
// 6. GESTION DES MESSAGES & COMMANDES
// ============================================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // --- VÉRIFICATION RESTRICTION ---
    if (restrictedUsers.has(message.author.id)) {
        await message.delete().catch(() => {});
        return message.channel.send(`🚫 ${message.author}, vous êtes actuellement restreint. Vos actions sont bloquées.`)
            .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
    }

    const cfg = getConfig(message.guild.id);
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
    // COMMANDES COMPLÈTES (!HELP)
    // ============================================================================

    // 🔒 RESTRICTION D'UN MEMBRE
    if (message.content.startsWith('!restrict')) {
        const args = message.content.split(' ');
        const target = message.mentions.members.first();
        const pass = args[2];

        if (!target) return message.reply("⚠️ Utilisation : `!restrict @membre [mot_de_passe]`");

        if (message.author.id !== OWNER_ID && pass !== RESTRICT_PASSWORD) {
            return message.reply("❌ Permission insuffisante ou mot de passe incorrect.");
        }

        restrictedUsers.add(target.id);
        saveData();

        return message.channel.send(`🚫 **${target.user.tag}** a été ajouté à la liste des utilisateurs restreints.`);
    }

    // 🔓 LEVÉE DE LA RESTRICTION
    if (message.content.startsWith('!unrestrict')) {
        const args = message.content.split(' ');
        const target = message.mentions.members.first();
        const pass = args[2];

        if (!target) return message.reply("⚠️ Utilisation : `!unrestrict @membre [mot_de_passe]`");

        if (message.author.id !== OWNER_ID && pass !== RESTRICT_PASSWORD) {
            return message.reply("❌ Permission insuffisante ou mot de passe incorrect.");
        }

        restrictedUsers.delete(target.id);
        saveData();

        return message.channel.send(`✅ **${target.user.tag}** n'est plus restreint.`);
    }

    // 📜 MENU AIDE
    if (message.content === '!help' || message.content === '.help') {
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
                        "`!unban [ID_utilisateur]` • *Révoque un bannissement*\n" +
                        "`!restrict @membre [code]` • *Bloque complètement un membre*\n" +
                        "`!unrestrict @membre [code]` • *Débloque un membre*"
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
                        "`!backup` • *Sauvegarde la structure des salons du serveur*\n" +
                        "`!report @membre [raison]` • *Signale un membre aux modérateurs*\n" +
                        "`!setlog #salon` • *Définit le salon de réception des alertes*\n" +
                        "`!serverinfo` • *Affiche les informations générales du serveur*"
                }
            )
            .setFooter({ text: "Écosystème n0mit CoreSystems • Protection Haute Disponibilité" })
            .setTimestamp();

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
            recommendations.push("⚠️ Configurez un salon de logs (`!setlog #salon`).");
        }

        const color = score >= 80 ? 0x57F287 : 0xED4245;
        const scoreEmbed = new EmbedBuilder()
            .setTitle(`📊 Audit de Sécurité : ${message.guild.name}`)
            .setColor(color)
            .setDescription(`**Score de Sécurité : ${score}/100**\n\n` + (recommendations.length ? recommendations.join("\n") : "✅ Instance parfaitement sécurisée !"));

        return message.reply({ embeds: [scoreEmbed] });
    }

    // SAUVEGARDE DU SERVEUR
    if (message.content === '!backup') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Réservé aux administrateurs.");

        const channelsData = message.guild.channels.cache.map(c => ({ name: c.name, type: c.type }));
        serverBackups.set(message.guild.id, { timestamp: new Date(), channels: channelsData });

        const backupEmbed = new EmbedBuilder()
            .setTitle("📦 Sauvegarde Effectuée")
            .setColor(0x57F287)
            .setDescription(`La structure actuelle de **${channelsData.length} salons** a été sauvegardée avec succès.`);

        return message.reply({ embeds: [backupEmbed] });
    }

    // SIGNALEMENT MEMBRE
    if (message.content.startsWith('!report')) {
        const member = message.mentions.members.first();
        const reason = message.content.split(' ').slice(2).join(' ');
        if (!member || !reason) return message.reply("⚠️ Utilisation : `!report @membre [raison]`");

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
    if (message.content.startsWith('!config')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const args = message.content.split(' ');
        const option = args[1]?.toLowerCase();
        const state = args[2]?.toLowerCase();

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
                    { name: "anti-bot", value: cfg.antiUnauthorizedBot ? '🛡️ Actif' : '🔴 Inactif', inline: true }
                )
                .setFooter({ text: "Exemple : !config anti-spam off" });
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
        else return message.reply("⚠️ Module inconnu.");

        saveData();
        return message.reply(`✅ Module **${option}** passé sur **${state.toUpperCase()}**.`);
    }

    // ANTI-RAID
    if (message.content.startsWith('!antiraid')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Réservé aux administrateurs.");
        const state = message.content.split(' ')[1]?.toLowerCase();

        if (state === 'on') {
            cfg.antiRaid = true;
            saveData();
            return message.channel.send("🚨 **ANTI-RAID ACTIVÉ.** Les comptes de moins de 24h seront mis en quarantaine.");
        } else if (state === 'off') {
            cfg.antiRaid = false;
            saveData();
            return message.channel.send("✅ **ANTI-RAID DÉSACTIVÉ.** Arrivées normales rétablies.");
        } else {
            return message.reply("Utilisation : `!antiraid on` ou `!antiraid off`");
        }
    }

    // LOG CHANNEL
    if (message.content.startsWith('!setlog')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("⚠️ Mentionnez un salon. Exemple : `!setlog #logs-sécurité` shadow");
        cfg.logChannelId = channel.id;
        saveData();
        return message.reply(`✅ Salon des rapports connecté avec succès à ${channel}`);
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
            const msg = await message.channel.send(`🧹 **${userMessages.length}** messages de ${targetMember} nettoyés.`);
            setTimeout(() => msg.delete().catch(() => {}), 3000);
        } catch (e) {
            return message.reply("❌ Erreur lors du nettoyage.");
        }
    }

    // MODÉRATION CLASSIQUE
    if (message.content.startsWith('!warn')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!warn @membre [raison]`");
        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison";
        return message.channel.send(`⚠️ **AVERTISSEMENT** : ${member} a reçu un avertissement. Raison : *${reason}*`);
    }

    if (message.content.startsWith('!slowmode')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply("❌ Permission insuffisante.");
        const seconds = parseInt(message.content.split(' ')[1]);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) return message.reply("⚠️ Utilisation : `!slowmode [secondes]`");
        await message.channel.setRateLimitPerUser(seconds);
        return message.channel.send(`⏱️ Mode lent ajusté à **${seconds}s**.`);
    }

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

    if (message.content.startsWith('!mute')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply("❌ Permission insuffisante.");
        const args = message.content.split(' ');
        const member = message.mentions.members.first();
        const duration = parseInt(args[2]);
        if (!member || isNaN(duration)) return message.reply("⚠️ Utilisation : `!mute @membre [minutes] [raison]`");
        await member.timeout(duration * 60 * 1000, args.slice(3).join(' ') || "Aucune raison");
        return message.channel.send(`🔇 **${member.user.tag}** est muet pendant ${duration} min.`);
    }

    if (message.content.startsWith('!unmute')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!unmute @membre`");
        await member.timeout(null);
        return message.channel.send(`🔊 La sanction de **${member.user.tag}** a été levée.`);
    }

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

    if (message.content.startsWith('!clear')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const count = parseInt(message.content.split(' ')[1]);
        if (isNaN(count) || count < 1 || count > 100) return message.reply("⚠️ Utilisation : `!clear [1-100]`");
        await message.delete().catch(() => {});
        const deleted = await message.channel.bulkDelete(count, true);
        const msg = await message.channel.send(`🧹 **${deleted.size}** messages nettoyés.`);
        setTimeout(() => msg.delete().catch(() => {}), 3000);
    }

    if (message.content === '!nuke') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Réservé aux administrateurs.");
        const pos = message.channel.position;
        const newChannel = await message.channel.clone();
        await message.channel.delete();
        await newChannel.setPosition(pos);
        return newChannel.send("💥 **SALON RÉINITIALISÉ.**");
    }

    if (message.content === '!serverinfo') {
        return message.reply(`📊 **${message.guild.name}**\n• Propriétaire : <@${message.guild.ownerId}>\n• Membres : \`${message.guild.memberCount}\`\n• Créé le : \`${message.guild.createdAt.toLocaleDateString()}\``);
    }

    // COMMANDE CACHÉE DÉVELOPPEUR (DISCRÈTE - NE FIGURE PAS DANS !HELP)
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
