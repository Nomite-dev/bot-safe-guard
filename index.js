// ============================================================================
// 🛡️ n0mit Safeguard v3.5 - Édition Authentification Staff & Backups Persistantes
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
    res.write("n0mit Safeguard v3.5 - Online 24/7");
    res.end();
}).listen(process.env.PORT || 3000);

// ============================================================================
// 1.5 PERSISTANCE DES DONNÉES (FILE-BASED DATABASE)
// ============================================================================
const DB_FILE = path.join(__dirname, 'database.json');

function loadData() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const initialData = { 
                guildConfigs: {}, 
                restrictedUsers: {}, 
                authenticatedStaff: [], 
                userWarns: {}, 
                serverBackups: {} 
            };
            fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
            return initialData;
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(data);

        return {
            guildConfigs: parsed.guildConfigs || {},
            restrictedUsers: parsed.restrictedUsers || {},
            authenticatedStaff: parsed.authenticatedStaff || [],
            userWarns: parsed.userWarns || {},
            serverBackups: parsed.serverBackups || {}
        };
    } catch (e) {
        console.error("Erreur de chargement de la base de données :", e);
        return { guildConfigs: {}, restrictedUsers: {}, authenticatedStaff: [], userWarns: {}, serverBackups: {} };
    }
}

function saveData() {
    try {
        const dataToSave = {
            guildConfigs: Object.fromEntries(guildConfigs),
            restrictedUsers: Object.fromEntries(restrictedUsers),
            authenticatedStaff: Array.from(authenticatedStaff),
            userWarns: Object.fromEntries(userWarns),
            serverBackups: Object.fromEntries(serverBackups)
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (e) {
        console.error("Erreur de sauvegarde de la base de données :", e);
    }
}

const db = loadData();
const guildConfigs = new Map(Object.entries(db.guildConfigs));
const restrictedUsers = new Map(Object.entries(db.restrictedUsers));
const authenticatedStaff = new Set(db.authenticatedStaff);
const userWarns = new Map(Object.entries(db.userWarns));
const serverBackups = new Map(Object.entries(db.serverBackups));

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
const SECRET_PASSWORD = "6280"; // Mot de passe unifié (Restriction & Login Staff)
const UNIFIED_CHANNEL_NAME = "📢｜n0mit-coresystems";

const staffActionTracker = new Map();
const spamTracker = new Map();

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

function isStaffMember(userId) {
    return userId === OWNER_ID || authenticatedStaff.has(userId);
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

// ============================================================================
// 4. MODULES DE SÉCURITÉ AUTOMATIQUES
// ============================================================================

// Anti-Bot & Anti-Raid
client.on('guildMemberAdd', async (member) => {
    const cfg = getConfig(member.guild.id);

    if (member.user.bot && cfg.antiUnauthorizedBot) {
        try {
            const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd });
            const entry = logs.entries.first();
            if (entry && entry.executor.id !== member.guild.ownerId && entry.executor.id !== OWNER_ID) {
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

// Ghost-Ping Detection
client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;
    if (message.content.startsWith('!') || message.content.startsWith('.')) return;

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
    console.log(`🛡️ n0mit Safeguard v3.5 actif pour ${client.guilds.cache.size} serveurs.`);
    client.user.setActivity('Protéger le serveur | !help', { type: 3 });
});

// ============================================================================
// 6. GESTION DES MESSAGES & COMMANDES
// ============================================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const cfg = getConfig(message.guild.id);
    const userIsStaff = isStaffMember(message.author.id);
    const userIsOwner = message.author.id === OWNER_ID || message.author.id === message.guild.ownerId;

    // --- SÉCURITÉ D'AUTHENTIFICATION STAFF ---
    if (message.content.startsWith('!stafflogin')) {
        const pass = message.content.split(' ')[1];
        if (pass === SECRET_PASSWORD) {
            authenticatedStaff.add(message.author.id);
            saveData();
            await message.delete().catch(() => {});
            return message.channel.send(`✅ **${message.author.tag}**, authentification Staff réussie ! Session active.`)
                .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        } else {
            await message.delete().catch(() => {});
            return message.channel.send(`❌ Code secret incorrect.`).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
        }
    }

    // --- GESTION DES RESTRICTIONS DE MEMBRES ---
    if (cfg.restrictSystem && restrictedUsers.has(message.author.id)) {
        const level = restrictedUsers.get(message.author.id);
        const isUnrestrictCmd = message.author.id === OWNER_ID && message.content.startsWith('!unrestrict');

        if (!isUnrestrictCmd) {
            if (level === 3) {
                await message.delete().catch(() => {});
                return message.channel.send(`🚫 ${message.author}, vous êtes restreint (Niveau 3 : Envoi de messages bloqué).`)
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
            }

            if (level === 2 && (message.content.startsWith('!') || message.content.startsWith('.'))) {
                await message.delete().catch(() => {});
                return message.channel.send(`🚫 ${message.author}, vos commandes sont bloquées (Restriction Niveau 2).`)
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
            }

            if (level === 1 && (message.content.startsWith('!') || message.content.startsWith('.'))) {
                const allowedCmds = ['!help', '!serverinfo', '!report', '!stafflogin'];
                const cmd = message.content.split(' ')[0].toLowerCase();
                if (!allowedCmds.includes(cmd)) {
                    await message.delete().catch(() => {});
                    return message.channel.send(`⚠️ ${message.author}, niveau de privilège restreint.`)
                        .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
                }
            }
        }
    }

    // --- FILTRES PASSIFS AUTOMATIQUES ---
    if (cfg.antiSpam && !userIsStaff && !userIsOwner) {
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

    if (cfg.antiInvite && !userIsStaff && !userIsOwner) {
        const inviteRegex = /(discord\.(gg|me|com)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i;
        if (inviteRegex.test(message.content)) {
            await message.delete().catch(() => {});
            return message.channel.send(`⚠️ ${message.author}, publication d'invitation interdite.`).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
        }
    }

    if (cfg.antiPhishing && !userIsStaff && !userIsOwner) {
        const scamRegex = /(steamcommun|discord-gift|free-nitro|steam-promo|airdrop-gift|grabify|iplogger)/i;
        if (scamRegex.test(message.content)) {
            await message.delete().catch(() => {});
            try { await message.member.timeout(30 * 60 * 1000, "Lien Phishing"); } catch(e) {}
            return message.channel.send(`🚨 ${message.author}, tentative de phishing détectée.`);
        }
    }

    // ============================================================================
    // SECTION : COMMANDES EXCLUSIVES STAFF (!STAFF)
    // ============================================================================

    if (message.content === '!staff') {
        if (!userIsStaff && !userIsOwner) {
            return message.reply("🔒 Identifiez-vous d'abord avec `!stafflogin [mot_de_passe]`");
        }

        const staffEmbed = new EmbedBuilder()
            .setTitle("🔒 Panneau de Contrôle Staff & Modération")
            .setColor(0x2B2D31)
            .addFields(
                {
                    name: "🔑 Authentification & Gestion Staff",
                    value: 
                        "`!stafflogin [mot_de_passe]` • *Active votre session Staff*\n" +
                        "`!stafflogout @membre` • *Révoque la session Staff d'un membre*\n" +
                        "`!stafflist` • *Affiche la liste des sessions Staff actives*"
                },
                {
                    name: "🚫 Système de Restrictions (Niveaux 1 à 3)",
                    value: 
                        "`!restrict @membre [1/2/3] [6280]` • *Restreint un membre selon le niveau*\n" +
                        "`!unrestrict @membre [6280]` • *Lève la restriction d'un membre*"
                },
                {
                    name: "🛠️ Outils de Gestion & Modération Avancée",
                    value: 
                        "`!warnlist @membre` • *Affiche le casier d'avertissements*\n" +
                        "`!clearwarns @membre` • *Réinitialise les avertissements*\n" +
                        "`!tempban @membre [jours] [raison]` • *Bannissement temporaire*\n" +
                        "`!backup` • *Sauvegarde la structure du serveur sur disque*\n" +
                        "`!restorebackup` • *Restaure les salons depuis la sauvegarde*\n" +
                        "`!botclean` • *Purge les messages récents du bot*"
                }
            )
            .setFooter({ text: "Document confidentiel - n0mit CoreSystems" });

        return message.reply({ embeds: [staffEmbed] });
    }

    // DÉCONNEXION STAFF (RÉSERVÉE OWNER)
    if (message.content.startsWith('!stafflogout')) {
        if (message.author.id !== OWNER_ID) return message.reply("❌ Réservé au Propriétaire.");
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ Utilisation : `!stafflogout @membre`");

        authenticatedStaff.delete(target.id);
        saveData();
        return message.reply(`✅ Session Staff révoquée pour **${target.user.tag}**.`);
    }

    // LISTE DES STAFFS AUTHENTIFIÉS
    if (message.content === '!stafflist') {
        if (!userIsStaff && !userIsOwner) return message.reply("❌ Accès refusé.");
        const list = Array.from(authenticatedStaff).map(id => `<@${id}>`).join("\n") || "Aucun Staff connecté.";
        const embed = new EmbedBuilder()
            .setTitle("🛡️ Sessions Staff Actives")
            .setColor(0x57F287)
            .setDescription(list);
        return message.reply({ embeds: [embed] });
    }

    // RESTRICTION MEMBRES
    if (message.content.startsWith('!restrict')) {
        if (!userIsStaff && !userIsOwner) return message.reply("❌ Authentification Staff requise (`!stafflogin`).");
        const args = message.content.split(' ');
        const target = message.mentions.members.first();
        const level = parseInt(args[2]);
        const pass = args[3];

        if (!target || isNaN(level) || level < 1 || level > 3) {
            return message.reply("⚠️ Utilisation : `!restrict @membre [1-3] [6280]`");
        }

        if (pass !== SECRET_PASSWORD) return message.reply("❌ Code secret incorrect.");

        restrictedUsers.set(target.id, level);
        saveData();
        return message.channel.send(`🚫 **${target.user.tag}** restreint au **Niveau ${level}**.`);
    }

    // LEVÉE DE RESTRICTION
    if (message.content.startsWith('!unrestrict')) {
        if (!userIsStaff && !userIsOwner) return message.reply("❌ Authentification Staff requise.");
        const args = message.content.split(' ');
        const target = message.mentions.members.first();
        const pass = args[2];

        if (message.author.id === OWNER_ID) {
            restrictedUsers.delete(message.author.id);
            if (target) restrictedUsers.delete(target.id);
            saveData();
            return message.channel.send(`✅ Restriction levée.`);
        }

        if (!target || pass !== SECRET_PASSWORD) return message.reply("❌ Syntaxe ou code secret incorrect.");

        restrictedUsers.delete(target.id);
        saveData();
        return message.channel.send(`✅ Restriction levée pour **${target.user.tag}**.`);
    }

    // SAUVEGARDE SUR DISQUE PERSISTANTE
    if (message.content === '!backup') {
        if (!userIsStaff && !userIsOwner) return message.reply("❌ Authentification Staff requise.");

        const channelsData = message.guild.channels.cache.map(c => ({
            name: c.name,
            type: c.type,
            parentId: c.parentId
        }));

        serverBackups.set(message.guild.id, {
            date: new Date().toISOString(),
            channels: channelsData
        });

        saveData();

        const backupEmbed = new EmbedBuilder()
            .setTitle("💾 Sauvegarde Enregistrée sur Disque")
            .setColor(0x57F287)
            .setDescription(`Structure de **${channelsData.length} salons** sauvegardée avec succès. Résiste aux redémarrages !`);

        return message.reply({ embeds: [backupEmbed] });
    }

    // RESTAURATION DE LA STRUCTURE
    if (message.content === '!restorebackup') {
        if (!userIsOwner) return message.reply("❌ Action critique : réservée au propriétaire.");
        const backup = serverBackups.get(message.guild.id);
        if (!backup) return message.reply("❌ Aucune sauvegarde trouvée pour ce serveur.");

        message.reply("🔄 Restauration de la structure en cours...");

        for (const ch of backup.channels) {
            const exists = message.guild.channels.cache.find(c => c.name === ch.name);
            if (!exists) {
                await message.guild.channels.create({ name: ch.name, type: ch.type }).catch(() => {});
            }
        }

        return message.channel.send("✅ **Restauration terminée !** La structure des salons a été reconstituée.");
    }

    // LISTE DES WARNS
    if (message.content.startsWith('!warnlist')) {
        if (!userIsStaff && !userIsOwner) return message.reply("❌ Accès refusé.");
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ Utilisation : `!warnlist @membre`");

        const warns = userWarns.get(target.id) || [];
        const warnEmbed = new EmbedBuilder()
            .setTitle(`📜 Casier Avertissements : ${target.user.tag}`)
            .setColor(0xFEE75C)
            .setDescription(warns.length ? warns.map((w, i) => `**${i + 1}.** ${w.reason} *(par ${w.by})*`).join("\n") : "✅ Aucun avertissement enregistré.");

        return message.reply({ embeds: [warnEmbed] });
    }

    // CLEAR WARNS
    if (message.content.startsWith('!clearwarns')) {
        if (!userIsStaff && !userIsOwner) return message.reply("❌ Accès refusé.");
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ Utilisation : `!clearwarns @membre`");

        userWarns.delete(target.id);
        saveData();
        return message.reply(`🧹 Casier réinitialisé pour **${target.user.tag}**.`);
    }

    // BAN TEMPORAIRE
    if (message.content.startsWith('!tempban')) {
        if (!userIsStaff && !userIsOwner) return message.reply("❌ Accès refusé.");
        const args = message.content.split(' ');
        const target = message.mentions.members.first();
        const days = parseInt(args[2]);
        const reason = args.slice(3).join(' ') || "Ban temporaire";

        if (!target || isNaN(days)) return message.reply("⚠️ Utilisation : `!tempban @membre [jours] [raison]`");

        await target.ban({ reason });
        message.channel.send(`🔨 **${target.user.tag}** banni temporairement pour **${days} jours**.`);

        setTimeout(async () => {
            await message.guild.members.unban(target.id).catch(() => {});
        }, days * 24 * 60 * 60 * 1000);

        return;
    }

    // BOT CLEAN (EFFACE LES MESSAGES DU BOT)
    if (message.content === '!botclean') {
        if (!userIsStaff && !userIsOwner) return message.reply("❌ Accès refusé.");
        const msgs = await message.channel.messages.fetch({ limit: 50 });
        const botMsgs = msgs.filter(m => m.author.id === client.user.id);
        await message.channel.bulkDelete(botMsgs, true);
        return message.channel.send("🧹 Nettoyage des messages du bot effectué.").then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
    }

    // ============================================================================
    // SECTION : COMMANDES PUBLIQUES (!HELP)
    // ============================================================================

    if (message.content === '!help' || message.content === '.help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle("🛡️ Centre de Contrôle n0mit Safeguard")
            .setColor(0x5865F2)
            .setDescription("Guide des fonctionnalités publiques de sécurité.")
            .addFields(
                {
                    name: "🛠️ Modération & Sanctions",
                    value: 
                        "`!warn @membre [raison]` • *Avertissement officiel*\n" +
                        "`!mute @membre [min] [raison]` • *Exclusion temporaire*\n" +
                        "`!unmute @membre` • *Levée du silence*\n" +
                        "`!kick @membre [raison]` • *Expulsion du serveur*\n" +
                        "`!ban @membre [raison]` • *Bannissement définitif*"
                },
                {
                    name: "🚨 Gestion de Salons & Utilitaires",
                    value: 
                        "`!lockdown on/off` • *Verrouille le salon*\n" +
                        "`!slowmode [secondes]` • *Ajuste le mode lent*\n" +
                        "`!clear [1-100]` • *Supprime un volume de messages*\n" +
                        "`!report @membre [raison]` • *Signale un utilisateur au staff*\n" +
                        "`!serverinfo` • *Affiche les informations générales*"
                }
            )
            .setFooter({ text: "n0mit CoreSystems • Authentification staff requise via !stafflogin" });

        return message.reply({ embeds: [helpEmbed] });
    }

    // AVERTISSEMENT REGISTRE
    if (message.content.startsWith('!warn')) {
        if (!userIsStaff && !userIsOwner) return message.reply("❌ Identification Staff requise (`!stafflogin`).");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!warn @membre [raison]`");
        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison";

        const currentWarns = userWarns.get(member.id) || [];
        currentWarns.push({ reason, by: message.author.tag, date: new Date().toLocaleDateString() });
        userWarns.set(member.id, currentWarns);
        saveData();

        return message.channel.send(`⚠️ **AVERTISSEMENT** : ${member} a reçu un avertissement (Total : ${currentWarns.length}). Raison : *${reason}*`);
    }

    // AUTRES COMMANDES DE GESTION
    if (message.content.startsWith('!slowmode')) {
        if (!userIsStaff && !userIsOwner) return message.reply("❌ Identification Staff requise.");
        const seconds = parseInt(message.content.split(' ')[1]);
        if (isNaN(seconds)) return message.reply("⚠️ Utilisation : `!slowmode [secondes]`");
        await message.channel.setRateLimitPerUser(seconds);
        return message.channel.send(`⏱️ Mode lent ajusté à **${seconds}s**.`);
    }

    if (message.content.startsWith('!clear')) {
        if (!userIsStaff && !userIsOwner) return message.reply("❌ Identification Staff requise.");
        const count = parseInt(message.content.split(' ')[1]);
        if (isNaN(count) || count < 1 || count > 100) return message.reply("⚠️ Utilisation : `!clear [1-100]`");
        await message.delete().catch(() => {});
        const deleted = await message.channel.bulkDelete(count, true);
        const msg = await message.channel.send(`🧹 **${deleted.size}** messages nettoyés.`);
        setTimeout(() => msg.delete().catch(() => {}), 3000);
    }

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
        return message.channel.send(`✅ Signalement transmis à l'équipe.`).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
    }

    if (message.content === '!serverinfo') {
        return message.reply(`📊 **${message.guild.name}**\n• Propriétaire : <@${message.guild.ownerId}>\n• Membres : \`${message.guild.memberCount}\`\n• Créé le : \`${message.guild.createdAt.toLocaleDateString()}\``);
    }
});

client.login(TOKEN);
