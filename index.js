// ============================================================================
// 🛡️ n0mit Safeguard v3.1 - Édition Corrective & Sécurisée
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
  res.write("n0mit Safeguard v3.1 - Online 24/7 | Sécurité Renforcée");
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
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildEmojisAndStickers
  ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = "1440037449546989701";
const UNIFIED_CHANNEL_NAME = "📢｜n0mit-coresystems";

const MOD_ROLE_NAME = "Modérateur";
const ADMIN_ROLE_NAME = "Administrateur";
const MAX_WARNS_BEFORE_BAN = 3;

// --- PERSISTANCE LOCAL FILE (JSON) ---
const DATA_FILE = path.join(__dirname, 'bot_data.json');

let db = {
  guildConfigs: {},
  warnTracker: {},
  tempBans: {},
  serverBackups: {}
};

// Chargement initial des données
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      db = JSON.parse(raw);
    }
  } catch (e) {
    console.error("Erreur lors du chargement des données :", e);
  }
}

// Sauvegarde des données
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error("Erreur lors de la sauvegarde des données :", e);
  }
}

loadData();

// Trackers volatiles (En mémoire vive car éphémères)
const staffActionTracker = new Map();
const spamTracker = new Map();

// ============================================================================
// 3. FONCTIONS UTILITAIRES & LOGS
// ============================================================================

// --- Fonction de Log de Sécurité ---
async function sendSecurityLog(guild, embed) {
  if (!guild) return;
  const cfg = getConfig(guild.id);
  if (!cfg.logChannelId) return;
  const logChannel = guild.channels.cache.get(cfg.logChannelId);
  if (logChannel) {
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }
}

// --- Verification des rôles staff (Correction des vérifications ID rôle) ---
function isModerator(member) {
  if (!member) return false;
  const cfg = getConfig(member.guild.id);
  const hasModRole = cfg.modRoleId ? member.roles.cache.has(cfg.modRoleId) : false;
  return member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    member.roles.cache.some(role => role.name.toLowerCase() === MOD_ROLE_NAME.toLowerCase()) ||
    hasModRole ||
    isAdmin(member);
}

function isAdmin(member) {
  if (!member) return false;
  const cfg = getConfig(member.guild.id);
  const hasAdminRole = cfg.adminRoleId ? member.roles.cache.has(cfg.adminRoleId) : false;
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.roles.cache.some(role => role.name.toLowerCase() === ADMIN_ROLE_NAME.toLowerCase()) ||
    hasAdminRole ||
    member.id === member.guild.ownerId;
}

// --- Gestion des avertissements ---
function addWarning(guildId, userId, reason, moderatorId) {
  const key = `${guildId}_${userId}`;
  if (!db.warnTracker[key]) db.warnTracker[key] = [];
  
  db.warnTracker[key].push({
    timestamp: Date.now(),
    reason: reason,
    moderatorId: moderatorId
  });
  saveData();
  return db.warnTracker[key].length;
}

// --- Vérification des bans temporaires ---
async function checkTempBans(guild) {
  const now = Date.now();
  const guildTempBans = db.tempBans[guild.id] || [];
  const toUnban = guildTempBans.filter(ban => ban.expiresAt <= now);

  for (const ban of toUnban) {
    try {
      await guild.members.unban(ban.userId, "Fin de ban temporaire");
      const logEmbed = new EmbedBuilder()
        .setTitle("⏳ Ban Temporaire Expiré")
        .setColor(0x57F287)
        .setDescription(`Le ban de **${ban.userTag}** (ID: ${ban.userId}) a expiré et a été levé automatiquement.`)
        .setTimestamp();
      await sendSecurityLog(guild, logEmbed);
    } catch (e) {
      console.error(`Erreur lors de la levée du ban temporaire pour ${ban.userId}:`, e);
    }
  }

  db.tempBans[guild.id] = guildTempBans.filter(ban => ban.expiresAt > now);
  saveData();
}

// --- Configuration ---
function saveConfig(guildId, config) {
  db.guildConfigs[guildId] = config;
  saveData();
}

function getConfig(guildId) {
  if (!db.guildConfigs[guildId]) {
    db.guildConfigs[guildId] = {
      antiInvite: true,
      antiPhishing: true,
      antiEveryone: true,
      antiGhostPing: true,
      antiNukeStaff: true,
      antiUnauthorizedBot: true,
      antiRaid: false,
      antiSpam: true,
      antiZalgo: true,
      antiAltAccounts: false,
      antiMassMention: true,
      antiEmojiSpam: true,
      antiCaps: true,
      logChannelId: null,
      modRoleId: null,
      adminRoleId: null,
      autoBanAfterWarns: MAX_WARNS_BEFORE_BAN,
      allowedInvites: []
    };
    saveData();
  }
  return db.guildConfigs[guildId];
}

// ============================================================================
// 4. SYNCHRONISATION SALON UNIFIÉ
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
      .setDescription("Liaison réussie entre n0mit Safeguard et le salon système.")
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
  }
});

// ============================================================================
// 5. MODULES DE SÉCURITÉ AUTOMATIQUES
// ============================================================================

// A. Anti-Bot Tiers & Anti-Raid
client.on('guildMemberAdd', async (member) => {
  const cfg = getConfig(member.guild.id);

  // Anti-Bot Non Autorisé
  if (member.user.bot && cfg.antiUnauthorizedBot) {
    try {
      const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd });
      const entry = logs.entries.first();
      if (entry && entry.executor.id !== member.guild.ownerId) {
        const allowedBots = process.env.ALLOWED_BOTS?.split(',') || [];
        if (!allowedBots.includes(member.user.id)) {
          if (member.kickable) {
            await member.kick("Bot non autorisé par le propriétaire.");
            const embed = new EmbedBuilder()
              .setTitle("🚨 BOT NON AUTORISÉ EXPULSÉ")
              .setColor(0xED4245)
              .setDescription(`Le bot **${member.user.tag}** (ID: ${member.user.id}) ajouté par <@${entry.executor.id}> a été expulsé.`)
              .setTimestamp();
            await sendSecurityLog(member.guild, embed);
          }
        }
      }
    } catch (e) {
      console.error("Erreur anti-bot:", e);
    }
  }

  // Anti-Raid
  if (!member.user.bot && cfg.antiRaid) {
    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 1) {
      try {
        if (member.moderatable) {
          await member.timeout(24 * 60 * 60 * 1000, "Anti-Raid : Compte récent (<24h)");
          const embed = new EmbedBuilder()
            .setTitle("🛡️ Anti-Raid : Quarantaine")
            .setColor(0xFEE75C)
            .setDescription(`Le compte récent **${member.user.tag}** a été placé en isolement temporaire.`)
            .setTimestamp();
          await sendSecurityLog(member.guild, embed);
        }
      } catch (e) {
        console.error("Erreur anti-raid:", e);
      }
    }
  }
});

// B. Anti-Nuke Staff (Correction cibles des Audit Logs & Permissions)
client.on('channelDelete', async (channel) => {
  if (!channel.guild) return;
  const cfg = getConfig(channel.guild.id);
  if (!cfg.antiNukeStaff) return;

  try {
    const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete });
    const entry = logs.entries.first();
    if (!entry || entry.target.id !== channel.id) return;
    const executor = entry.executor;
    if (executor.id === channel.guild.ownerId || executor.id === client.user.id) return;

    const key = `${channel.guild.id}_${executor.id}`;
    const now = Date.now();
    const userStats = staffActionTracker.get(key) || { count: 0, lastAction: now };

    if (now - userStats.lastAction > 10000) userStats.count = 1;
    else userStats.count++;
    userStats.lastAction = now;
    staffActionTracker.set(key, userStats);

    if (userStats.count >= 2) {
      const member = await channel.guild.members.fetch(executor.id).catch(() => null);
      if (member && member.manageable) {
        const dangerousRoles = member.roles.cache.filter(r =>
          r.permissions.has(PermissionFlagsBits.Administrator) ||
          r.permissions.has(PermissionFlagsBits.ManageChannels) ||
          r.permissions.has(PermissionFlagsBits.BanMembers)
        );
        if (dangerousRoles.size > 0) {
          await member.roles.remove(dangerousRoles, "Anti-Nuke Safeguard").catch(() => {});
        }

        if (userStats.count >= 5 && member.bannable) {
          await member.ban({ reason: "Anti-Nuke: Suppression multiple de salons", days: 1 });
        }

        const nukeEmbed = new EmbedBuilder()
          .setTitle("💥 TENTATIVE DE NUKE INTERCEPTÉE")
          .setColor(0xED4245)
          .setDescription(`L'utilisateur **${executor.tag}** a supprimé plusieurs salons consécutifs.\n` +
            `🔒 **${dangerousRoles.size} rôles administratifs révoqués.**`)
          .setTimestamp();
        await sendSecurityLog(channel.guild, nukeEmbed);
      }
    }
  } catch (e) {
    console.error("Erreur anti-nuke:", e);
  }
});

// C. Ghost-Ping Detection
client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;
  const cfg = getConfig(message.guild.id);

  if (cfg.antiGhostPing) {
    if (message.mentions.members.size > 0 || message.mentions.roles.size > 0) {
      const ghostEmbed = new EmbedBuilder()
        .setTitle("👻 Ghost-Ping Détecté")
        .setColor(0xFEE75C)
        .addFields(
          { name: "Auteur", value: `${message.author.tag} (${message.author.id})`, inline: true },
          { name: "Salon", value: `<#${message.channel.id}>`, inline: true },
          { name: "Contenu", value: message.content || "*Inconnu / Média*" }
        )
        .setTimestamp();
      await sendSecurityLog(message.guild, ghostEmbed);

      const userKey = `${message.guild.id}_${message.author.id}_ghost`;
      const userGhostPings = (spamTracker.get(userKey) || 0) + 1;
      spamTracker.set(userKey, userGhostPings);

      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (userGhostPings >= 3 && member && member.moderatable && !isModerator(member)) {
        await member.timeout(10 * 60 * 1000, "Ghost-Ping répété");
        spamTracker.set(userKey, 0);
      }
    }
  }
});

// ============================================================================
// 6. READY & ÉVÉNEMENTS
// ============================================================================
client.on('ready', () => {
  console.log(`🛡️ n0mit Safeguard v3.1 actif pour ${client.guilds.cache.size} serveurs.`);
  client.user.setActivity('Protéger le serveur | !help', { type: 3 });

  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      checkTempBans(guild);
    }
  }, 60 * 1000);
});

// ============================================================================
// 7. GESTION DES MESSAGES & COMMANDES
// ============================================================================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const cfg = getConfig(message.guild.id);
  const isStaff = isModerator(message.member);
  const isAdminMember = isAdmin(message.member);

  // --- FILTRES PASSIFS (Équipés dans messageCreate) ---
  
  // Anti-Spam
  if (cfg.antiSpam && !isStaff) {
    const trackerKey = `${message.guild.id}_${message.author.id}`;
    const now = Date.now();
    const userSpam = spamTracker.get(trackerKey) || { count: 0, lastMsg: now };

    if (now - userSpam.lastMsg < 2000) {
      userSpam.count++;
      if (userSpam.count >= 5) {
        if (message.member.moderatable) {
          await message.member.timeout(5 * 60 * 1000, "Anti-Spam Automatique");
          await message.channel.send(`🤐 ${message.author} a été réduit au silence 5 min pour spam.`)
            .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }
        userSpam.count = 0;
      }
    } else {
      userSpam.count = 1;
    }
    userSpam.lastMsg = now;
    spamTracker.set(trackerKey, userSpam);
  }

  // Anti-Zalgo
  if (cfg.antiZalgo && !isStaff) {
    const zalgoRegex = /[\u0300-\u036f\u1ab0-\u1ace\u1dc0-\u1ffe\u20d0-\u20ff]/g;
    const suspiciousChars = message.content.match(zalgoRegex);
    if (suspiciousChars && suspiciousChars.length > 5) {
      await message.delete().catch(() => {});
      return message.channel.send(`⚠️ ${message.author}, caracteres altérés interdits.`)
        .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
    }
  }

  // Anti-Invite
  if (cfg.antiInvite && !isStaff) {
    const inviteRegex = /(discord\.(gg|me|com)|discordapp\.com\/invite)\/[a-zA-Z0-9-]+/gi;
    const matches = message.content.match(inviteRegex);
    if (matches) {
      const isAllowed = matches.some(invite => cfg.allowedInvites.some(allowed => invite.includes(allowed)));
      if (!isAllowed) {
        await message.delete().catch(() => {});
        return message.channel.send(`⚠️ ${message.author}, invitations interdites.`)
          .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
      }
    }
  }

  // Anti-Mass Mention
  if (cfg.antiMassMention && !isStaff) {
    const mentionCount = message.mentions.members.size + message.mentions.roles.size;
    if (mentionCount >= 5) {
      await message.delete().catch(() => {});
      if (message.member.moderatable) {
        await message.member.timeout(5 * 60 * 1000, "Mention de masse");
      }
      return;
    }
  }

  // COMMANDES

  if (message.content === '!help' || message.content === '.help') {
    const helpEmbed = new EmbedBuilder()
      .setTitle("🛡️ Centre de Contrôle n0mit Safeguard v3.1")
      .setColor(0x5865F2)
      .setDescription("Guide complet des fonctionnalités du bot.")
      .addFields(
        { name: "🛠️ Modération", value: "`!warn @user [raison]` • `!warnings @user` • `!softban @user` • `!tempban @user [durée] [raison]`" },
        { name: "🚨 Salons & Serveur", value: "`!clear [1-100]` • `!lockserver on/off` • `!backup` • `!restore`" },
        { name: "⚙️ Configuration", value: "`!config` • `!setmodrole @role` • `!setadminrole @role` • `!setlog #salon` • `!secscore`" }
      )
      .setTimestamp();
    return message.reply({ embeds: [helpEmbed] });
  }

  // Warn
  if (message.content.startsWith('!warn')) {
    if (!isStaff) return message.reply("❌ Permission insuffisante.");
    const member = message.mentions.members.first();
    if (!member) return message.reply("⚠️ Utilisation : `!warn @membre [raison]`");
    const reason = message.content.split(' ').slice(2).join(' ') || "Aucune raison";

    const warnCount = addWarning(message.guild.id, member.id, reason, message.author.id);
    const embed = new EmbedBuilder()
      .setTitle("⚠️ Avertissement Officiel")
      .setColor(0xFEE75C)
      .setDescription(`**${member.user.tag}** a reçu un avertissement.\nRaison: *${reason}*\nTotal: **${warnCount}**`)
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    await sendSecurityLog(message.guild, embed);

    if (cfg.autoBanAfterWarns && warnCount >= cfg.autoBanAfterWarns) {
      if (member.bannable) {
        await member.ban({ reason: `Ban automatique (${warnCount} warns)` });
      }
    }
  }

  // Backup
  if (message.content === '!backup') {
    if (!isAdminMember) return message.reply("❌ Réservé aux administrateurs.");
    
    const backupChannels = message.guild.channels.cache.map(c => ({
      name: c.name,
      type: c.type,
      topic: c.topic || null
    }));

    db.serverBackups[message.guild.id] = { channels: backupChannels };
    saveData();
    return message.reply("📦 **Sauvegarde de la structure du serveur effectuée avec succès.**");
  }

  // Restore
  if (message.content === '!restore') {
    if (!isAdminMember) return message.reply("❌ Réservé aux administrateurs.");
    const backup = db.serverBackups[message.guild.id];
    if (!backup) return message.reply("❌ Aucune sauvegarde trouvée.");

    try {
      for (const channelData of backup.channels) {
        if (channelData.type === ChannelType.GuildText) {
          const existing = message.guild.channels.cache.find(c => c.name === channelData.name);
          if (!existing) {
            await message.guild.channels.create({ name: channelData.name, type: channelData.type, topic: channelData.topic });
          }
        }
      }
      return message.reply("📦 **Restauration des salons terminée.**");
    } catch (e) {
      return message.reply("❌ Erreur lors de la restauration.");
    }
  }

  // Set Log Channel
  if (message.content.startsWith('!setlog')) {
    if (!isAdminMember) return message.reply("❌ Réservé aux administrateurs.");
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply("⚠️ Utilisation : `!setlog #salon`");

    cfg.logChannelId = channel.id;
    saveConfig(message.guild.id, cfg);
    return message.reply(`✅ Salon de logs configuré sur ${channel}`);
  }

  // Clear
  if (message.content.startsWith('!clear')) {
    if (!isStaff) return message.reply("❌ Permission insuffisante.");
    const amount = parseInt(message.content.split(' ')[1]);
    if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("⚠️ Indiquez un nombre de 1 à 100.");

    await message.channel.bulkDelete(amount, true).catch(() => {});
    return message.channel.send(`🧹 ${amount} messages supprimés.`)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
  }
});

client.login(TOKEN);
