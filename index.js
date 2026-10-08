const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const pino = require('pino');

// --- CONFIGURATION ---
const HOSTINGER_WEBHOOK_URL = 'https://YOURDOMAIN.com/whatsapp-webhook.php'; // Edit this
const SECRET_TOKEN = 'MY_SECURE_TOKEN_123'; 

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Disabling QR to use pairing code
        logger: pino({ level: 'silent' })
    });

    // Auto-generate pairing code for headless cloud servers
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            const phoneNumber = process.env.BOT_NUMBER;
            if (!phoneNumber) {
                console.error("❌ Add your BOT_NUMBER in the environment variables!");
                return;
            }
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`\n=================================\n🔑 PAIRING CODE: ${code}\n=================================\n`);
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') console.log('✅ WhatsApp Bot Connected to Server!');
        else if (connection === 'close') startBot(); // Auto-reconnect
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        
        // Ignore status updates and own messages
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const senderName = msg.pushName || 'Mod';

        if (text.toLowerCase().startsWith('cancel')) {
            try {
                const response = await axios.post(HOSTINGER_WEBHOOK_URL, 
                    { message: text, sender: senderName },
                    { headers: { 'X-Bot-Token': SECRET_TOKEN } }
                );

                if (response.data && response.data.reply) {
                    await sock.sendMessage(msg.key.remoteJid, { text: response.data.reply }, { quoted: msg });
                }
            } catch (err) {
                console.log('Webhook error:', err.message);
                await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ Error reaching Hostinger server.' });
            }
        }
    });
}

startBot();
