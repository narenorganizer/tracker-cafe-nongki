const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot Test Online!'));
app.listen(PORT, '0.0.0.0', () => console.log(`Server Express berjalan di port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', () => {
    console.log(`🤖 Bot Login sebagai ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    console.log(`[PESAN DITERIMA] Dari ${message.author.tag}: ${message.content}`);

    // Tes perintah sederhana
    if (message.content === '!ping') {
        try {
            await message.reply('Pong! Bot merespons dengan normal.');
            console.log('[BERHASIL MEMBALAS PESAN]');
        } catch (err) {
            console.error('[GAGAL MEMBALAS PESAN]:', err);
        }
    }
});

client.login(process.env.DISCORD_TOKEN).then(() => {
    console.log('✅ Token valid, terhubung ke Discord.');
}).catch(err => {
    console.error('❌ Error login:', err);
});
