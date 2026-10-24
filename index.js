const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');

// --- SETUP EXPRESS SERVER (Agar Render Uptime 24/7) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot Invite Contest Online & Ready!');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Express berjalan di port ${PORT}`);
});

// --- INITIALIZE DISCORD CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Data storage (In-Memory)
const invitesCache = new Map();
const memberTracker = new Map();
const userStats = new Map();

function formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    let result = [];
    if (hours > 0) result.push(`${hours}j`);
    if (minutes > 0) result.push(`${minutes}m`);
    result.push(`${seconds}s`);
    return result.join(' ');
}

function getInviterStats(inviterId) {
    if (!userStats.has(inviterId)) {
        userStats.set(inviterId, { valid: new Set(), left: new Set() });
    }
    return userStats.get(inviterId);
}

function checkAndValidate(memberId) {
    const data = memberTracker.get(memberId);
    if (!data || data.isValid) return;

    if (data.chatCount >= 3 && data.joinedVoice) {
        data.isValid = true;
        const stats = getInviterStats(data.inviterId);
        stats.valid.add(memberId);
        console.log(`[VALIDATED] Member ${memberId} lulus kualifikasi untuk inviter ${data.inviterId}`);
    }
}

client.once('ready', async () => {
    console.log(`🤖 Bot Berhasil Login sebagai ${client.user.tag}`);
    
    for (const guild of client.guilds.cache.values()) {
        try {
            const guildInvites = await guild.invites.fetch();
            invitesCache.set(guild.id, new Collection(guildInvites.map(inv => [inv.code, inv.uses])));
        } catch (err) {
            console.error(`Gagal mengambil invite untuk guild ${guild.id}:`, err);
        }
    }
});

client.on('guildMemberAdd', async (member) => {
    const cachedInvites = invitesCache.get(member.guild.id);
    let inviterId = 'UNKNOWN';

    try {
        const newInvites = await member.guild.invites.fetch();
        const usedInvite = newInvites.find(inv => cachedInvites && cachedInvites.get(inv.code) < inv.uses);

        if (usedInvite && usedInvite.inviter) {
            inviterId = usedInvite.inviter.id;
        }
        
        invitesCache.set(member.guild.id, new Collection(newInvites.map(inv => [inv.code, inv.uses])));
    } catch (err) {
        console.error('Gagal memproses invite member baru:', err);
    }

    memberTracker.set(member.id, {
        inviterId: inviterId,
        chatCount: 0,
        joinedVoice: false,
        totalVcTime: 0,
        vcJoinTimestamp: null,
        isValid: false
    });

    console.log(`[JOIN] ${member.user.tag} masuk via invite dari ${inviterId}`);
});

client.on('guildMemberRemove', (member) => {
    const data = memberTracker.get(member.id);
    if (data && data.inviterId !== 'UNKNOWN') {
        const stats = getInviterStats(data.inviterId);
        if (stats.valid.has(member.id)) {
            stats.valid.delete(member.id);
        }
        stats.left.add(member.id);
        console.log(`[LEAVE] ${member.user.tag} keluar. Poin dikurangi dari ${data.inviterId}`);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    console.log(`[DEBUG] Pesan dari ${message.author.tag}: ${message.content}`);

    const data = memberTracker.get(message.author.id);
    if (data) {
        data.chatCount += 1;
        checkAndValidate(message.author.id);
    }

    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'buatlink' || command === 'invite' || command === 'mylink') {
        try {
            const invite = await message.channel.createInvite({
                maxAge: 0,
                maxUses: 0,
                unique: true,
                reason: `Link invite personal untuk ${message.author.tag}`
            });

            return message.reply(
                `🔗 **Link Invite Personal Kamu Berhasil Dibuat!**\n` +
                `Bagikan link ini ke teman-teman kamu:\n` +
                `https://discord.gg/${invite.code}`
            );
        } catch (err) {
            console.error('Gagal membuat invite:', err);
            return message.reply('❌ Gagal membuat link invite. Pastikan bot memiliki izin Manage Server yang cukup!');
        }
    }

    if (command === 'myinvite') {
        const stats = getInviterStats(message.author.id);
        const validCount = stats.valid.size;
        const leftCount = stats.left.size;
        const totalPoints = validCount - leftCount;

        return message.reply(
            `📊 **Statistik Invite Kamu (${message.author.username}):**\n` +
            `🟢 Valid (Aktif Chat & VC): **${validCount}**\n` +
            `🔴 Keluar (Left): **${leftCount}**\n` +
            `⭐ **Total Poin Bersih: ${totalPoints}**`
        );
    }

    if (command === 'leaderboard' || command === 'topinvite') {
        const leaderboardData = [];

        for (const [inviterId, stats] of userStats.entries()) {
            if (inviterId === 'UNKNOWN') continue;
            const points = stats.valid.size - stats.left.size;
            leaderboardData.push({ inviterId, points, valid: stats.valid.size, left: stats.left.size });
        }

        leaderboardData.sort((a, b) => b.points - a.points);
        const top10 = leaderboardData.slice(0, 10);

        if (top10.length === 0) {
            return message.reply('🏆 Leaderboard masih kosong! Ketik `!buatlink` untuk mulai mengundang!');
        }

        let lbMessage = '🏆 **TOP 10 LEADERBOARD INVITE CONTEST** 🏆\n\n';
        top10.forEach((item, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
            lbMessage += `${medal} **#${index + 1}** <@${item.inviterId}> ➔ **${item.points} Poin** (${item.valid} Valid, ${item.left} Left)\n`;
        });

        return message.reply(lbMessage);
    }

    if (command === 'audit') {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('❌ Kamu tidak memiliki izin untuk menggunakan perintah audit ini!');
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('⚠️ Harap sebutkan user yang ingin diaudit! Contoh: `!audit @username`');
        }

        let auditMessage = `🔍 **AUDIT KEAKTIFAN MEMBER DIAJAK OLEH <@${targetUser.id}>**\n\n`;
        let count = 0;

        for (const [memberId, data] of memberTracker.entries()) {
            if (data.inviterId === targetUser.id) {
                count++;
                let vcTime = data.totalVcTime;
                if (data.vcJoinTimestamp) {
                    vcTime += Math.floor((Date.now() - data.vcJoinTimestamp) / 1000);
                }

                const status = data.isValid ? '🟢 VALID' : '🔴 BELUM QUALIFIED';
                auditMessage += `• <@${memberId}> ➔ ${status} | 💬 Chat: **${data.chatCount}** | 🔊 Jam VC: **${formatDuration(vcTime)}**\n`;
            }
        }

        if (count === 0) {
            return message.reply(`ℹ️ User <@${targetUser.id}> belum memiliki member yang diajak.`);
        }

        return message.reply(auditMessage);
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    const memberId = newState.member.id;
    const data = memberTracker.get(memberId);

    if (!data) return;

    if (!oldState.channelId && newState.channelId) {
        data.joinedVoice = true;
        data.vcJoinTimestamp = Date.now();
        checkAndValidate(memberId);
        console.log(`[VC JOIN] ${newState.member.user.tag} masuk VC`);
    }

    if (oldState.channelId && !newState.channelId) {
        if (data.vcJoinTimestamp) {
            const durationSeconds = Math.floor((Date.now() - data.vcJoinTimestamp) / 1000);
            data.totalVcTime += durationSeconds;
            data.vcJoinTimestamp = null;
            console.log(`[VC LEAVE] ${newState.member.user.tag} keluar VC`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌GAGAL LOGIN KE DISCORD:', err);
});
