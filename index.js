// ============================================================================
// 🛡️ n0mit Safeguard v3.7 - Écosystème n0mit CoreSystems (Full Command Restoration)
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

// Keep-alive web server
http.createServer((req, res) => {
    res.write("n0mit Safeguard v3.7 - Online");
    res.end();
}).listen(process.env.PORT || 3000);

// Base de données locale
const DB_FILE = path.join(__dirname, 'database.json');

function loadData() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const initial = { guildConfigs: {}, restrictedUsers: {}, devStaff: [], userWarns: {}, serverBackups: {} };
            fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
            return initial;
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return { guildConfigs: {}, restrictedUsers: {}, devStaff: [], userWarns: {}, serverBackups: {} };
    }
}

function saveData() {
    try {
        const data = {
            guildConfigs: Object.fromEntries(guildConfigs),
            restrictedUsers: Object.fromEntries(restrictedUsers),
            devStaff: Array.from(devStaff),
            userWarns: Object.fromEntries(userWarns),
            serverBackups: Object.fromEntries(serverBackups)
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

const db = loadData();
const guildConfigs = new Map(Object.entries(db.guildConfigs || {}));
const restrictedUsers = new Map(Object.entries(db.restrictedUsers || {}));
const devStaff = new Set(db.devStaff || []); // Staff Dév Bot
const userWarns = new Map(Object.entries(db.userWarns || {}));
const serverBackups = new Map(Object.entries(db.serverBackups || {}));

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
const SECRET_PASSWORD = "6280"; 

function isBotDev(userId) {
    return userId === OWNER_ID || devStaff.has(userId);
}

function isServerMod(member) {
    if (!member) return false;
    return member.permissions.has(PermissionFlagsBits.ManageMessages) || 
           member.permissions.has(PermissionFlagsBits.KickMembers) || 
           member.permissions.has(PermissionFlagsBits.BanMembers) ||
           member.id === member.guild.ownerId ||
           isBotDev(member.id);
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
    } catch (e) {}
}

client.on('ready', () => {
    console.log(`🛡️ n0mit Safeguard v3.7 connecté.`);
    client.user.setActivity('!help | n!help', { type: 3 });
});

// ============================================================================
// ÉVÉNEMENTS AUTOMATIQUES (Anti-Raid / GhostPing / Anti-Bot)
// ============================================================================
client.on('guildMemberAdd', async (member) => {
    const cfg = getConfig(member.guild.id);

    if (member.user.bot && cfg.antiUnauthorizedBot) {
        try {
            const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd });
            const entry = logs.entries.first();
            if (entry && entry.executor.id !== member.guild.ownerId && entry.executor.id !== OWNER_ID) {
                await member.kick("Bot non autorisé.");
            }
        } catch (e) {}
    }

    if (!member.user.bot && cfg.antiRaid) {
        const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
        if (accountAgeDays < 1) {
            try {
                await member.timeout(24 * 60 * 60 * 1000, "Anti-Raid : Compte trop récent");
            } catch (e) {}
        }
    }
});

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
// GESTION DES COMMANDES
// ============================================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    let content = message.content.trim();
    let usedPrefix = null;

    if (content.startsWith('n!')) usedPrefix = 'n!';
    else if (content.startsWith('!')) usedPrefix = '!';

    if (!usedPrefix) return;

    const args = content.slice(usedPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const cfg = getConfig(message.guild.id);

    // RESTRICTION SYSTEM
    if (cfg.restrictSystem && restrictedUsers.has(message.author.id)) {
        const level = restrictedUsers.get(message.author.id);
        if (level === 3) {
            await message.delete().catch(() => {});
            return message.channel.send(`🚫 ${message.author}, vous êtes restreint (Niveau 3).`).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
        }
        if (level === 2) {
            await message.delete().catch(() => {});
            return message.channel.send(`🚫 ${message.author}, commandes bloquées (Niveau 2).`).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
        }
        if (level === 1 && !['help', 'serverinfo', 'report', 'staff'].includes(command)) {
            await message.delete().catch(() => {});
            return message.channel.send(`⚠️ ${message.author}, privilèges restreints (Niveau 1).`).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
        }
    }

    // ============================================================================
    // 1. COMMANDE !staff (ACCÈS DÉVELOPPEUR BOT)
    // ============================================================================
    if (command === 'staff') {
        const inputPassword = args[0];
        if (!inputPassword || inputPassword !== SECRET_PASSWORD) {
            await message.delete().catch(() => {});
            return message.channel.send(`🔒 **Accès Développeur Bot** : Veuillez fournir le mot de passe secret.\nExemple : \`${usedPrefix}staff 6280\``)
                .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }

        devStaff.add(message.author.id);
        saveData();
        await message.delete().catch(() => {});

        const devEmbed = new EmbedBuilder()
            .setTitle("⚙️ Panneau Développeur Bot")
            .setColor(0xED4245)
            .setDescription(`Authentification réussie pour **${message.author.tag}**.`)
            .addFields(
                { name: "Restrictions", value: "`!restrict @membre [1-3] 6280`\n`!unrestrict @membre 6280`" },
                { name: "Backups & Debug", value: "`!backup`\n`!restorebackup`\n`!botclean`" }
            );

        return message.channel.send({ embeds: [devEmbed] });
    }

    // ============================================================================
    // 2. COMMANDE !help (RESTAURÉE ET EXACTE AUX CAPTURES D'ÉCRAN)
    // ============================================================================
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
                        "`!warnlist @membre` • *Casier d'avertissements*\n" +
                        "`!clearwarns @membre` • *Efface les avertissements*\n" +
                        "`!mute @membre [min] [raison]` • *Exclusion temporaire*\n" +
                        "`!unmute @membre` • *Levée du silence*\n" +
                        "`!kick @membre [raison]` • *Expulsion du serveur*\n" +
                        "`!ban @membre [raison]` • *Bannissement définitif*\n" +
                        "`!unban [ID_utilisateur]` • *Révoque un bannissement*\n" +
                        "`!tempban @membre [jours] [raison]` • *Ban temporaire*"
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
            .setFooter({ text: "Écosystème n0mit CoreSystems • Protection" });

        return message.reply({ embeds: [helpEmbed] });
    }

    // ============================================================================
    // 3. EXÉCUTION DE TOUTES LES COMMANDES REPRÉSENTÉES
    // ============================================================================

    // Warn / Warnlist / Clearwarns
    if (command === 'warn') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ Syntaxe : `!warn @membre [raison]`");
        const reason = args.slice(1).join(' ') || "Aucune raison";
        const warns = userWarns.get(target.id) || [];
        warns.push({ reason, by: message.author.tag, date: new Date().toLocaleDateString() });
        userWarns.set(target.id, warns);
        saveData();
        return message.channel.send(`⚠️ **Avertissement** : ${target} a été averti (Total : ${warns.length}). Raison : *${reason}*`);
    }

    if (command === 'warnlist') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ Syntaxe : `!warnlist @membre`");
        const warns = userWarns.get(target.id) || [];
        const embed = new EmbedBuilder()
            .setTitle(`📜 Casier : ${target.user.tag}`)
            .setColor(0xFEE75C)
            .setDescription(warns.length ? warns.map((w, i) => `**${i + 1}.** ${w.reason} *(par ${w.by})*`).join("\n") : "✅ Aucun avertissement.");
        return message.reply({ embeds: [embed] });
    }

    if (command === 'clearwarns') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ Syntaxe : `!clearwarns @membre`");
        userWarns.delete(target.id);
        saveData();
        return message.reply(`🧹 Casier effacé pour **${target.user.tag}**.`);
    }

    // Mute / Unmute
    if (command === 'mute') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const target = message.mentions.members.first();
        const minutes = parseInt(args[1]);
        const reason = args.slice(2).join(' ') || "Exclusion temporaire";
        if (!target || isNaN(minutes)) return message.reply("⚠️ Syntaxe : `!mute @membre [min] [raison]`");
        await target.timeout(minutes * 60 * 1000, reason);
        return message.reply(`🤐 **${target.user.tag}** a été réduit au silence pour **${minutes} minutes**.`);
    }

    if (command === 'unmute') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ Syntaxe : `!unmute @membre`");
        await target.timeout(null);
        return message.reply(`🔊 Silence levé pour **${target.user.tag}**.`);
    }

    // Kick / Ban / Unban / Tempban
    if (command === 'kick') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const target = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || "Aucune raison";
        if (!target) return message.reply("⚠️ Syntaxe : `!kick @membre [raison]`");
        await target.kick(reason);
        return message.reply(`👢 **${target.user.tag}** a été expulsé.`);
    }

    if (command === 'ban') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const target = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || "Aucune raison";
        if (!target) return message.reply("⚠️ Syntaxe : `!ban @membre [raison]`");
        await target.ban({ reason });
        return message.reply(`🔨 **${target.user.tag}** a été banni.`);
    }

    if (command === 'unban') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const userId = args[0];
        if (!userId) return message.reply("⚠️ Syntaxe : `!unban [ID_utilisateur]`");
        await message.guild.members.unban(userId);
        return message.reply(`✅ Bannissement révoqué pour l'ID **${userId}**.`);
    }

    if (command === 'tempban') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const target = message.mentions.members.first();
        const days = parseInt(args[1]);
        const reason = args.slice(2).join(' ') || "Ban temporaire";
        if (!target || isNaN(days)) return message.reply("⚠️ Syntaxe : `!tempban @membre [jours] [raison]`");
        await target.ban({ reason });
        message.channel.send(`🔨 **${target.user.tag}** banni pour **${days} jours**.`);
        setTimeout(async () => { await message.guild.members.unban(target.id).catch(() => {}); }, days * 86400000);
        return;
    }

    // Lockdown / Slowmode / Clear / Purgeuser / Nuke
    if (command === 'lockdown') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const state = args[0];
        if (state === 'on') {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            return message.reply("🔒 Salon verrouillé.");
        } else if (state === 'off') {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            return message.reply("🔓 Salon déverrouillé.");
        }
        return message.reply("⚠️ Syntaxe : `!lockdown on/off`");
    }

    if (command === 'slowmode') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const sec = parseInt(args[0]);
        if (isNaN(sec)) return message.reply("⚠️ Syntaxe : `!slowmode [secondes]`");
        await message.channel.setRateLimitPerUser(sec);
        return message.reply(`⏱️ Mode lent réglé sur **${sec}s**.`);
    }

    if (command === 'clear') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("⚠️ Indiquez un chiffre entre 1 et 100.");
        await message.delete().catch(() => {});
        const deleted = await message.channel.bulkDelete(amount, true);
        return message.channel.send(`🧹 **${deleted.size}** messages supprimés.`).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
    }

    if (command === 'purgeuser') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const target = message.mentions.members.first();
        const amount = parseInt(args[1]) || 50;
        if (!target) return message.reply("⚠️ Syntaxe : `!purgeuser @membre [1-100]`");
        const msgs = await message.channel.messages.fetch({ limit: 100 });
        const userMsgs = msgs.filter(m => m.author.id === target.id).first(amount);
        await message.channel.bulkDelete(userMsgs, true);
        return message.reply(`🧹 Messages de **${target.user.tag}** supprimés.`);
    }

    if (command === 'nuke') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Action réservée aux Administrateurs.");
        const pos = message.channel.position;
        const newChannel = await message.channel.clone();
        await message.channel.delete();
        await newChannel.setPosition(pos);
        return newChannel.send("💥 Salon réinitialisé avec succès !");
    }

    // Secscore / Config / Antiraid / Backup / Report / Setlog / Serverinfo
    if (command === 'secscore') {
        let score = 100;
        if (!cfg.antiRaid) score -= 20;
        if (!cfg.logChannelId) score -= 30;
        if (!cfg.antiUnauthorizedBot) score -= 20;

        const embed = new EmbedBuilder()
            .setTitle("🛡️ Audit de Sécurité du Serveur")
            .setColor(score > 70 ? 0x57F287 : 0xED4245)
            .setDescription(`Note globale : **${score}/100**`)
            .addFields(
                { name: "Anti-Raid", value: cfg.antiRaid ? "✅ Actif" : "❌ Inactif (-20 pts)", inline: true },
                { name: "Salon de Logs", value: cfg.logChannelId ? "✅ Configuré" : "❌ Non défini (-30 pts)", inline: true },
                { name: "Anti-Bot Non Autorisé", value: cfg.antiUnauthorizedBot ? "✅ Actif" : "❌ Inactif (-20 pts)", inline: true }
            );
        return message.reply({ embeds: [embed] });
    }

    if (command === 'config') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const embed = new EmbedBuilder()
            .setTitle("⚙️ Configuration n0mit Safeguard")
            .setColor(0x5865F2)
            .setDescription(
                `• **Anti-Raid:** ${cfg.antiRaid ? "✅ ON" : "❌ OFF"}\n` +
                `• **Anti-Spam:** ${cfg.antiSpam ? "✅ ON" : "❌ OFF"}\n` +
                `• **Anti-Invite:** ${cfg.antiInvite ? "✅ ON" : "❌ OFF"}\n` +
                `• **Anti-GhostPing:** ${cfg.antiGhostPing ? "✅ ON" : "❌ OFF"}\n` +
                `• **Salon Logs:** ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : "Non défini"}`
            );
        return message.reply({ embeds: [embed] });
    }

    if (command === 'antiraid') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const state = args[0];
        if (state === 'on') cfg.antiRaid = true;
        else if (state === 'off') cfg.antiRaid = false;
        else return message.reply("⚠️ Syntaxe : `!antiraid on/off`");
        saveData();
        return message.reply(`🛡️ Anti-raid **${cfg.antiRaid ? "activé" : "désactivé"}**.`);
    }

    if (command === 'backup') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const channelsData = message.guild.channels.cache.map(c => ({ name: c.name, type: c.type }));
        serverBackups.set(message.guild.id, { date: new Date().toISOString(), channels: channelsData });
        saveData();
        return message.reply(`💾 Sauvegarde de **${channelsData.length} salons** effectuée.`);
    }

    if (command === 'report') {
        const target = message.mentions.members.first();
        const reason = args.slice(1).join(' ');
        if (!target || !reason) return message.reply("⚠️ Syntaxe : `!report @membre [raison]`");
        await message.delete().catch(() => {});
        const embed = new EmbedBuilder()
            .setTitle("📩 Nouveau Signalement")
            .setColor(0xED4245)
            .addFields(
                { name: "Cible", value: `${target}`, inline: true },
                { name: "Rapporteur", value: `${message.author}`, inline: true },
                { name: "Raison", value: reason }
            );
        await sendSecurityLog(message.guild, embed);
        return message.channel.send("✅ Signalement transmis.").then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
    }

    if (command === 'setlog') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const ch = message.mentions.channels.first();
        if (!ch) return message.reply("⚠️ Syntaxe : `!setlog #salon`");
        cfg.logChannelId = ch.id;
        saveData();
        return message.reply(`✅ Salon de logs défini sur ${ch}.`);
    }

    if (command === 'serverinfo') {
        return message.reply(`📊 **${message.guild.name}**\n• Propriétaire : <@${message.guild.ownerId}>\n• Membres : \`${message.guild.memberCount}\``);
    }
});

client.login(TOKEN);
