// ============================================================================
// 🛡️ n0mit Safeguard v3.6 - Écosystème n0mit CoreSystems
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
    res.write("n0mit Safeguard v3.6 - Online");
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
const devStaff = new Set(db.devStaff || []); // Équipe de développement du Bot
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
const SECRET_PASSWORD = "6280"; // Mot de passe Dev Bot

function isBotDev(userId) {
    return userId === OWNER_ID || devStaff.has(userId);
}

// Vérifie si la personne a des droits de modération sur le SERVEUR
function isServerMod(member) {
    if (!member) return false;
    return member.permissions.has(PermissionFlagsBits.ManageMessages) || 
           member.permissions.has(PermissionFlagsBits.KickMembers) || 
           member.permissions.has(PermissionFlagsBits.BanMembers) ||
           member.id === member.guild.ownerId ||
           isBotDev(member.id);
}

client.on('ready', () => {
    console.log(`🛡️ n0mit Safeguard v3.6 connecté.`);
    client.user.setActivity('!help | n!help (Anti-Conflit)', { type: 3 });
});

client.on('messageCreate', async (message) => {
    // IGNORE LES AUTRES BOTS (Anti-conflit RaidProtect)
    if (message.author.bot || !message.guild) return;

    let content = message.content.trim();
    
    // Support du préfixe n! pour éviter de faire réagir RaidProtect
    let usedPrefix = null;
    if (content.startsWith('n!')) usedPrefix = 'n!';
    else if (content.startsWith('!')) usedPrefix = '!';

    if (!usedPrefix) return;

    // Découpage de la commande
    const args = content.slice(usedPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ============================================================================
    // 1. COMMANDE !staff (RÉSERVÉE AU STAFF DU BOT / ÉQUIPE DEV)
    // ============================================================================
    if (command === 'staff') {
        const inputPassword = args[0];

        // Si aucun mot de passe n'est fourni ou s'il est faux
        if (!inputPassword || inputPassword !== SECRET_PASSWORD) {
            await message.delete().catch(() => {});
            return message.channel.send(`🔒 **Accès Développeur Bot** : Veuillez fournir le mot de passe secret.\nExemple : \`!staff 6280\``)
                .then(m => setTimeout(() => m.delete().catch(() => {}), 6000));
        }

        // Si le mot de passe est bon, on l'ajoute au staff dev
        devStaff.add(message.author.id);
        saveData();
        await message.delete().catch(() => {});

        const devEmbed = new EmbedBuilder()
            .setTitle("⚙️ Panneau d'Administration Dev - n0mit Bot")
            .setColor(0xED4245)
            .setDescription(`Bienvenue **${message.author.tag}**. Vous êtes authentifié comme Développeur du Bot.`)
            .addFields(
                {
                    name: "🚫 Système de Restriction Système",
                    value: 
                        "`!restrict @membre [1/2/3] 6280` • *Restreint un membre*\n" +
                        "`!unrestrict @membre 6280` • *Lève la restriction*"
                },
                {
                    name: "💾 Backups & Infrastructure",
                    value: 
                        "`!backup` • *Sauvegarde la structure du serveur sur disque*\n" +
                        "`!restorebackup` • *Restaure les salons depuis la sauvegarde*\n" +
                        "`!botclean` • *Nettoie les messages du bot*"
                }
            )
            .setFooter({ text: "Session Staff Bot Active" });

        return message.channel.send({ embeds: [devEmbed] });
    }

    // ============================================================================
    // 2. COMMANDE !help (COMMANDES POUR LE STAFF DU SERVEUR)
    // ============================================================================
    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle("🛡️ Centre de Modération - n0mit Safeguard")
            .setColor(0x5865F2)
            .setDescription("Liste des commandes disponibles pour la modération du serveur.\n*Astuce : Utilisez `n!commande` si un autre bot (comme RaidProtect) réagit aussi.*")
            .addFields(
                {
                    name: "🔨 Modération du Serveur",
                    value: 
                        "`!warn @membre [raison]` • *Avertir un joueur*\n" +
                        "`!warnlist @membre` • *Voir l'historique d'avertissements*\n" +
                        "`!clearwarns @membre` • *Effacer les avertissements*\n" +
                        "`!mute @membre [minutes] [raison]` • *Rendre muet (Timeout)*\n" +
                        "`!unmute @membre` • *Retirer le mute*\n" +
                        "`!kick @membre [raison]` • *Expulser du serveur*\n" +
                        "`!ban @membre [raison]` • *Bannir définitivement*\n" +
                        "`!tempban @membre [jours] [raison]` • *Bannir temporairement*"
                },
                {
                    name: "⚙️ Gestion des Salons",
                    value: 
                        "`!clear [1-100]` • *Supprimer un lot de messages*\n" +
                        "`!slowmode [secondes]` • *Activer/Ajuster le mode lent*\n" +
                        "`!report @membre [raison]` • *Signaler un membre au staff*\n" +
                        "`!serverinfo` • *Afficher les infos du serveur*"
                }
            )
            .setFooter({ text: "n0mit CoreSystems • Seuls les modérateurs du serveur peuvent exécuter les actions." });

        return message.reply({ embeds: [helpEmbed] });
    }

    // ============================================================================
    // 3. COMMANDES DE MODÉRATION SERVEUR
    // ============================================================================

    // Warn
    if (command === 'warn') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ Syntaxe : `!warn @membre [raison]`");
        const reason = args.slice(1).join(' ') || "Aucune raison spécifiée";

        const warns = userWarns.get(target.id) || [];
        warns.push({ reason, by: message.author.tag, date: new Date().toLocaleDateString() });
        userWarns.set(target.id, warns);
        saveData();

        return message.channel.send(`⚠️ **Avertissement** : ${target} a été averti. (Total : ${warns.length})\nRaison : *${reason}*`);
    }

    // Warnlist
    if (command === 'warnlist') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ Syntaxe : `!warnlist @membre`");

        const warns = userWarns.get(target.id) || [];
        const embed = new EmbedBuilder()
            .setTitle(`📜 Avertissements de ${target.user.tag}`)
            .setColor(0xFEE75C)
            .setDescription(warns.length ? warns.map((w, i) => `**${i + 1}.** ${w.reason} *(par ${w.by})*`).join("\n") : "✅ Aucun avertissement.");

        return message.reply({ embeds: [embed] });
    }

    // Clearwarns
    if (command === 'clearwarns') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ Syntaxe : `!clearwarns @membre`");

        userWarns.delete(target.id);
        saveData();
        return message.reply(`🧹 Avertissements effacés pour **${target.user.tag}**.`);
    }

    // Clear
    if (command === 'clear') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("⚠️ Indiquez un nombre entre 1 et 100.");

        await message.delete().catch(() => {});
        const deleted = await message.channel.bulkDelete(amount, true);
        return message.channel.send(`🧹 **${deleted.size}** messages supprimés.`).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
    }

    // Slowmode
    if (command === 'slowmode') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const sec = parseInt(args[0]);
        if (isNaN(sec)) return message.reply("⚠️ Syntaxe : `!slowmode [secondes]`");
        await message.channel.setRateLimitPerUser(sec);
        return message.channel.send(`⏱️ Mode lent réglé sur **${sec}s**.`);
    }

    // Tempban
    if (command === 'tempban') {
        if (!isServerMod(message.member)) return message.reply("❌ Permission insuffisante.");
        const target = message.mentions.members.first();
        const days = parseInt(args[1]);
        const reason = args.slice(2).join(' ') || "Bannissement temporaire";

        if (!target || isNaN(days)) return message.reply("⚠️ Syntaxe : `!tempban @membre [jours] [raison]`");

        await target.ban({ reason });
        message.channel.send(`🔨 **${target.user.tag}** banni pour **${days} jours**.`);

        setTimeout(async () => {
            await message.guild.members.unban(target.id).catch(() => {});
        }, days * 24 * 60 * 60 * 1000);
        return;
    }

    // ============================================================================
    // 4. COMMANDES DÉVELOPPEUR BOT (RÉSERVÉES STAFF BOT)
    // ============================================================================
    
    if (command === 'backup') {
        if (!isBotDev(message.author.id)) return message.reply("❌ Réservé aux Développeurs du Bot (`!staff 6280`).");
        const channelsData = message.guild.channels.cache.map(c => ({ name: c.name, type: c.type }));
        serverBackups.set(message.guild.id, { date: new Date().toISOString(), channels: channelsData });
        saveData();
        return message.reply(`💾 Sauvegarde de la structure (**${channelsData.length} salons**) effectuée avec succès.`);
    }

    if (command === 'restorebackup') {
        if (!isBotDev(message.author.id)) return message.reply("❌ Réservé aux Développeurs du Bot.");
        const backup = serverBackups.get(message.guild.id);
        if (!backup) return message.reply("❌ Aucune sauvegarde disponible.");

        for (const ch of backup.channels) {
            const exists = message.guild.channels.cache.find(c => c.name === ch.name);
            if (!exists) await message.guild.channels.create({ name: ch.name, type: ch.type }).catch(() => {});
        }
        return message.channel.send("✅ Restauration des salons terminée.");
    }
});

client.login(TOKEN);
