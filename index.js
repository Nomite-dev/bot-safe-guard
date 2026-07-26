// ============================================================================
// 🛡️ n0mit Safeguard v2.0 - Le Bot de Sécurité Ultime
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
// 1. SERVEUR WEB KEEP-ALIVE (Render Free Tier)
// ============================================================================
http.createServer((req, res) => {
    res.write("n0mit Safeguard - Protection active 24/7");
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
const OWNER_ID = "1440037449546989701"; 
const UNIFIED_CHANNEL_NAME = "📢｜n0mit-coresystems";

// Stockage de la configuration par serveur
const guildConfigs = new Map();

// Mémoire pour l'Anti-Nuke Staff (Suivi des actions destructrices)
// Structure: staffActionTracker.get(guildId_userId) = { channelDeletes: count, roleDeletes: count, timestamp: time }
const staffActionTracker = new Map();

function getConfig(guildId) {
    if (!guildConfigs.has(guildId)) {
        guildConfigs.set(guildId, {
            antiInvite: true,
            antiPhishing: true,
            antiEveryone: true,
            antiGhostPing: true,
            antiNukeStaff: true, // Protection contre les admins malveillants
            antiUnauthorizedBot: true, // Bloque l'ajout de bots tiers
            logChannelId: null
        });
    }
    return guildConfigs.get(guildId);
}

// Helper pour envoyer un Log Pro dans le salon dédié
async function sendSecurityLog(guild, embed) {
    const cfg = getConfig(guild.id);
    if (!cfg.logChannelId) return;
    try {
        const logChannel = guild.channels.cache.get(cfg.logChannelId);
        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error("Erreur d'envoi du log :", e);
    }
}

// ============================================================================
// 3. GESTION ET DÉTECTION DU SALON UNIFIÉ (Évite les conflits avec SchoolBot)
// ============================================================================
async function getOrCreateCoreChannel(guild) {
    try {
        // 1. Cherche si un salon correspondant existe déjà
        let channel = guild.channels.cache.find(ch => 
            ch.name.toLowerCase().includes("n0mit-coresystems") || 
            ch.name.toLowerCase().includes("n0mit-info")
        );

        // 2. Si non trouvé, on le crée
        if (!channel) {
            channel = await guild.channels.create({
                name: UNIFIED_CHANNEL_NAME,
                type: ChannelType.GuildText,
                topic: "Centre de contrôle et annonces système de l'écosystème n0mit.",
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
        return guild.systemChannel;
    }
}

// Détection à chaud : Si ton autre bot crée un salon plus tard via /setup
client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    if (channel.name.toLowerCase().includes("n0mit-coresystems")) {
        console.log(`🔗 Salon n0mit détecté suite à une création externe sur ${channel.guild.name}`);
        
        const embed = new EmbedBuilder()
            .setTitle("🛡️ Connecteur n0mit Safeguard Sync")
            .setColor(0x2B2D31)
            .setDescription("Liaison réussie entre **n0mit Safeguard** et le salon système créé par l'écosystème.")
            .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => {});
    }
});

// ============================================================================
// 4. PROTECTION ANTI-NUKE STAFF & BOTS NON-AUTORISÉS
// ============================================================================

// A. Interception des arrivées de bots suspects
client.on('guildMemberAdd', async (member) => {
    const cfg = getConfig(member.guild.id);

    // Si c'un bot qui vient d'être ajouté
    if (member.user.bot && cfg.antiUnauthorizedBot) {
        try {
            const fetchedLogs = await member.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.BotAdd,
            });
            const botLog = fetchedLogs.entries.first();

            // Si on ne trouve pas l'auteur ou que ce n'est pas le propriétaire du serveur
            if (botLog && botLog.executor.id !== member.guild.ownerId) {
                await member.kick("Sécurité Safeguard : Ajout de bot non autorisé par le propriétaire.");
                
                const logEmbed = new EmbedBuilder()
                    .setTitle("🚨 BOT NON AUTORISÉ EXPULSÉ")
                    .setColor(0xED4245)
                    .setDescription(`Le bot **${member.user.tag}** a été ajouté par <@${botLog.executor.id}> sans l'accord du Propriétaire. Il a été immédiatement expulsé.`)
                    .setTimestamp();

                await sendSecurityLog(member.guild, logEmbed);
            }
        } catch (e) {
            console.error("Erreur protection Anti-Bot :", e);
        }
    }
});

// B. Interception des suppressions de salons (Anti-Nuke Admin)
client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    const cfg = getConfig(channel.guild.id);
    if (!cfg.antiNukeStaff) return;

    try {
        const fetchedLogs = await channel.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.ChannelDelete,
        });
        const auditEntry = fetchedLogs.entries.first();
        if (!auditEntry) return;

        const executor = auditEntry.executor;
        // On exempte le propriétaire et le bot lui-même
        if (executor.id === channel.guild.ownerId || executor.id === client.user.id) return;

        const key = `${channel.guild.id}_${executor.id}`;
        const now = Date.now();
        const userStats = staffActionTracker.get(key) || { count: 0, firstAction: now };

        if (now - userStats.firstAction > 10000) { // Réinitialise tous les 10s
            userStats.count = 1;
            userStats.firstAction = now;
        } else {
            userStats.count++;
        }

        staffActionTracker.set(key, userStats);

        // Seuil : Plus de 2 salons supprimés en 10s = SUSPECT DE RAID STAFF
        if (userStats.count >= 2) {
            const member = await channel.guild.members.fetch(executor.id);
            if (member) {
                // Neutralisation de l'administrateur malveillant (Destitution de ses rôles)
                const dangerousRoles = member.roles.cache.filter(r => 
                    r.permissions.has(PermissionFlagsBits.Administrator) || 
                    r.permissions.has(PermissionFlagsBits.ManageChannels) ||
                    r.permissions.has(PermissionFlagsBits.BanMembers)
                );

                await member.roles.remove(dangerousRoles, "Anti-Nuke Safeguard : Tentative de destruction du serveur.");

                const nukeEmbed = new EmbedBuilder()
                    .setTitle("💥 DÉTECTION TENTATIVE DE NUKE (STAFF)")
                    .setColor(0xED4245)
                    .setDescription(`🚨 **ALERTE MAXIMALE**\nL'administrateur/modérateur **${executor.tag}** (<@${executor.id}>) a supprimé plusieurs salons en quelques secondes.\n\n🔒 **Mesure d'urgence appliquée :** Ses privilèges administratifs lui ont été retirés immédiatement !`)
                    .setTimestamp();

                await sendSecurityLog(channel.guild, nukeEmbed);
                
                // Prévenir le propriétaire du serveur en privé
                const owner = await channel.guild.fetchOwner();
                await owner.send({ embeds: [nukeEmbed] }).catch(() => {});
            }
        }
    } catch (e) {
        console.error("Erreur protection Anti-Nuke :", e);
    }
});

// ============================================================================
// 5. ARRIVÉE DU BOT SUR UN SERVEUR ET READY
// ============================================================================
client.on('ready', () => {
    console.log(`🛡️ n0mit Safeguard opérationnel sur ${client.guilds.cache.size} serveur(s).`);
    client.user.setActivity('Protéger l\'établissement | !help', { type: 3 });
});

client.on('guildCreate', async (guild) => {
    try {
        const targetChannel = await getOrCreateCoreChannel(guild);
        if (!targetChannel) return;

        const welcomeEmbed = new EmbedBuilder()
            .setTitle("🛡️ n0mit Safeguard | Protection Active")
            .setColor(0x57F287)
            .setDescription(`**Système de Sécurité Avancé Opérationnel**\nCe serveur est désormais sous la protection active de l'écosystème **n0mit CoreSystems**.`)
            .addFields(
                { name: "🛡️ Anti-Nuke Staff", value: "Neutre automatiquement les membres du personnel piratés ou malveillants.", inline: true },
                { name: "🤖 Protection Bots", value: "Bloque l'ajout non-autorisé de bots tiers.", inline: true },
                { name: "🔍 Filtres Actifs", value: "Anti-Invite, Anti-Phishing, Anti-GhostPing.", inline: true }
            )
            .setFooter({ text: "Tapez !help pour afficher le panneau de commande" })
            .setTimestamp();

        await targetChannel.send({ embeds: [welcomeEmbed] });
    } catch (err) {
        console.error("Erreur accueil :", err);
    }
});

// Détection Ghost Ping
client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;
    const cfg = getConfig(message.guild.id);
    if (!cfg.antiGhostPing) return;

    if (message.mentions.members.size > 0 || message.mentions.roles.size > 0) {
        const ghostEmbed = new EmbedBuilder()
            .setTitle("👻 Ghost-Ping Détecté")
            .setColor(0xFEE75C)
            .addFields(
                { name: "Auteur", value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
                { name: "Salon", value: `<#${message.channel.id}>`, inline: true },
                { name: "Contenu supprimé", value: message.content || "*Contenu inconnu*" }
            )
            .setTimestamp();

        await sendSecurityLog(message.guild, ghostEmbed);
    }
});

// ============================================================================
// 6. GESTION DES MESSAGES & COMMANDES
// ============================================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const cfg = getConfig(message.guild.id);
    const isStaff = message.member.permissions.has(PermissionFlagsBits.ManageMessages);

    // --- FILTRES PASSIFS PRODUISANT DES EMBEDS PROPRES ---
    if (cfg.antiInvite && !isStaff) {
        const inviteRegex = /(discord\.(gg|me|com)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i;
        if (inviteRegex.test(message.content)) {
            await message.delete().catch(() => {});
            
            const warnEmbed = new EmbedBuilder()
                .setColor(0xED4245)
                .setDescription(`⚠️ ${message.author}, les pub/liens d'invitations externes sont strictement interdits ici.`);

            const logEmbed = new EmbedBuilder()
                .setTitle("🚫 Lien d'invitation bloqué")
                .setColor(0xED4245)
                .addFields(
                    { name: "Membre", value: `${message.author.tag}`, inline: true },
                    { name: "Salon", value: `<#${message.channel.id}>`, inline: true }
                )
                .setTimestamp();

            await sendSecurityLog(message.guild, logEmbed);
            return message.channel.send({ embeds: [warnEmbed] }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }
    }

    if (cfg.antiPhishing && !isStaff) {
        const scamRegex = /(steamcommun|discord-gift|free-nitro|steam-promo|airdrop-gift|grabify|iplogger)/i;
        if (scamRegex.test(message.content)) {
            await message.delete().catch(() => {});
            try { await message.member.timeout(30 * 60 * 1000, "Envoi de lien frauduleux"); } catch(e) {}

            const scamEmbed = new EmbedBuilder()
                .setTitle("🚨 TENTATIVE DE PHISHING DÉTECTÉE")
                .setColor(0xED4245)
                .setDescription(`L'utilisateur ${message.author} a envoyé un lien hautement suspect et a été réduit au silence pendant 30 minutes.`)
                .setTimestamp();

            await sendSecurityLog(message.guild, scamEmbed);
            return message.channel.send({ embeds: [scamEmbed] });
        }
    }

    // --- COMMANDES ADMINISTRATIVES ---

    // 1. COMMANDE !HELP SOUS FORME D'EMBED PROFESSIONNEL
    if (message.content === '!help' || message.content === '.help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle("🛡️ Centre de Contrôle n0mit Safeguard")
            .setColor(0x5865F2)
            .setDescription("Système d'auto-défense autonome et de modération de haute précision.")
            .addFields(
                { 
                    name: "⚙️ Sécurité & Diagnostic", 
                    value: "`!secscore` : Analyse et note le niveau de sécurité du serveur.\n`!config` : Gère les modules de protection pas-à-pas.\n`!setlog #salon` : Configure le salon des rapports discrets." 
                },
                { 
                    name: "🚨 Gestion de Crise & Staff", 
                    value: "`!lockdown on/off` : Bloque/Débloque les envois de messages.\n`!purgeuser @membre` : Purge les messages d'un compte suspect.\n`!nuke` : Recommence le salon de zéro." 
                },
                { 
                    name: "🛠️ Sanctions Administratives", 
                    value: "`!warn @membre [raison]` | `!mute @membre [min]`\n`!kick @membre [raison]` | `!ban @membre [raison]`" 
                }
            )
            .setFooter({ text: "Écosystème n0mit CoreSystems • Protection Haute Disponibilité" })
            .setTimestamp();

        return message.reply({ embeds: [helpEmbed] });
    }

    // 2. COMMANDE EXCLUSIVE : DIAGNOSTIC DE SÉCURITÉ (!secscore)
    if (message.content === '!secscore') {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");

        let score = 100;
        const recommendations = [];

        // Check 1: Roles @everyone avec permissions dangereuses
        const everyoneRole = message.guild.roles.everyone;
        if (everyoneRole.permissions.has(PermissionFlagsBits.MentionEveryone)) {
            score -= 25;
            recommendations.push("❌ Retirez la permission `@everyone` de mentionner tout le monde.");
        }
        if (everyoneRole.permissions.has(PermissionFlagsBits.ManageMessages)) {
            score -= 30;
            recommendations.push("❌ Risque critique : `@everyone` a la permission de gérer les messages !");
        }

        // Check 2: Salon de logs configuré
        if (!cfg.logChannelId) {
            score -= 15;
            recommendations.push("⚠️ Aucun salon de logs configuré (`!setlog #salon`).");
        }

        // Check 3: Nombre d'administrateurs
        const adminCount = message.guild.members.cache.filter(m => m.permissions.has(PermissionFlagsBits.Administrator) && !m.user.bot).size;
        if (adminCount > 5) {
            score -= 10;
            recommendations.push(`⚠️ Vous avez ${adminCount} administrateurs humains. Réduisez ce nombre pour limiter les risques.`);
        }

        const color = score >= 80 ? 0x57F287 : score >= 50 ? 0xFEE75C : 0xED4245;

        const scoreEmbed = new EmbedBuilder()
            .setTitle(`📊 Audit de Sécurité : ${message.guild.name}`)
            .setColor(color)
            .setDescription(`**Score de Sécurité Global : ${score}/100**\n\n` + (recommendations.length > 0 ? recommendations.join("\n") : "✅ Votre serveur est parfaitement sécurisé selon nos standards !"))
            .setTimestamp();

        return message.reply({ embeds: [scoreEmbed] });
    }

    // 3. CONFIGURATION DES MODULES (!config)
    if (message.content.startsWith('!config')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const args = message.content.split(' ');
        const option = args[1]?.toLowerCase();
        const state = args[2]?.toLowerCase();

        if (!option) {
            const configEmbed = new EmbedBuilder()
                .setTitle("⚙️ Panneau de Configuration Safeguard")
                .setColor(0x2B2D31)
                .addFields(
                    { name: "Anti-Invite (`anti-invite`)", value: cfg.antiInvite ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "Anti-Phishing (`anti-phishing`)", value: cfg.antiPhishing ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "Anti-Everyone (`anti-everyone`)", value: cfg.antiEveryone ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "Anti-GhostPing (`anti-ghostping`)", value: cfg.antiGhostPing ? '🟢 Actif' : '🔴 Inactif', inline: true },
                    { name: "Anti-Nuke Staff (`anti-nuke`)", value: cfg.antiNukeStaff ? '🛡️ Actif (Sécurisé)' : '🔴 Inactif', inline: true },
                    { name: "Anti-Bot Tiers (`anti-bot`)", value: cfg.antiUnauthorizedBot ? '🛡️ Actif' : '🔴 Inactif', inline: true }
                )
                .setFooter({ text: "Exemple d'utilisation : !config anti-invite off" });

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

        return message.reply(`✅ Le module **${option}** a été défini sur **${state.toUpperCase()}**.`);
    }

    // 4. DÉFINIR SALON DE LOGS (!setlog)
    if (message.content.startsWith('!setlog')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("⚠️ Mentionnez un salon. Exemple : `!setlog #logs-sécurité`");

        cfg.logChannelId = channel.id;
        return message.reply(`✅ Salon de logs de sécurité connecté avec succès sur : ${channel}`);
    }

    // 5. PURGER UN MEMBRE SPECIFIQUE (!purgeuser)
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
            const msg = await message.channel.send(`🧹 **${userMessages.length}** messages de ${targetMember} ont été supprimés.`);
            setTimeout(() => msg.delete().catch(() => {}), 3000);
        } catch (e) {
            return message.reply("❌ Erreur lors de la purge ciblée.");
        }
    }

    // 6. WARN
    if (message.content.startsWith('!warn')) {
        if (!isStaff) return message.reply("❌ Permission insuffisante.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("⚠️ Utilisation : `!warn @membre [raison]`");
        const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison spécifiée";

        const warnEmbed = new EmbedBuilder()
            .setTitle("⚠️ Avertissement Officiel")
            .setColor(0xFEE75C)
            .setDescription(`Le membre ${member} a reçu un avertissement.\n📌 **Raison** : *${reason}*`);

        return message.channel.send({ embeds: [warnEmbed] });
    }

    // 7. LOCKDOWN
    if (message.content.startsWith('!lockdown')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Réservé aux administrateurs.");
        const state = message.content.split(' ')[1]?.toLowerCase();

        if (state === 'on') {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            return message.channel.send("🚨 **SALON VERROUILLÉ.** Tous les envois de messages par les utilisateurs sont suspendus.");
        } else if (state === 'off') {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            return message.channel.send("✅ **SALON DÉVERROUILLÉ.** L'accès d'écriture est rétabli.");
        } else {
            return message.reply("Utilisation : `!lockdown on` ou `!lockdown off`");
        }
    }

    // 8. COMMANDE PROPRIÉTAIRE : BROADCAST NATIONALE
    if (message.content.startsWith('!broadcast')) {
        if (message.author.id !== OWNER_ID) {
            return message.reply("❌ Seul le développeur n0mit CoreSystems peut exécuter une diffusion globale.");
        }

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
            } catch (err) {
                console.error(`Erreur de diffusion sur ${guild.name}:`, err);
            }
        }

        return message.channel.send(`✅ Message diffusé avec succès sur **${successCount}** instance(s).`);
    }
});

client.login(TOKEN);
