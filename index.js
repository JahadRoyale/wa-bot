const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');

const axios = require('axios');

const pino = require('pino');

const http = require('http');



const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {

    res.writeHead(200);

    res.end('WhatsApp Bot is running securely in the background!');

}).listen(PORT, '0.0.0.0', () => {

    console.log(`🌐 Dummy web server listening on port ${PORT}`);

});



// --- CONFIGURATION ---

const HOSTINGER_WEBHOOK_URL = 'https://cloutronism.shop/whatsapp-webhook.php'; // <-- Replace with your domain

const SECRET_TOKEN = 'MY_SECURE_TOKEN_123'; 



async function startBot() {

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    

    const sock = makeWASocket({

        auth: state,

        printQRInTerminal: false,

        logger: pino({ level: 'silent' })

    });



    sock.ev.on('creds.update', saveCreds);



    sock.ev.on('connection.update', async (update) => {

        const { connection, qr } = update;

        

        // Baileys recommended method: Request pairing code only when the QR event fires

        if (qr && !sock.authState.creds.registered) {

            const phoneNumber = process.env.BOT_NUMBER;

            if (!phoneNumber) {

                console.error("❌ Add your BOT_NUMBER in the environment variables!");

                return;

            }

            try {

                const code = await sock.requestPairingCode(phoneNumber);

                console.log(`\n=================================\n🔑 PAIRING CODE: ${code}\n=================================\n`);

            } catch (err) {

                console.error("❌ Failed to request pairing code:", err.message);

            }

        }



        if (connection === 'open') console.log('✅ WhatsApp Bot Connected to Server!');

        else if (connection === 'close') startBot();

    });



    sock.ev.on('messages.upsert', async ({ messages, type }) => {

        if (type !== 'notify') return;

        const msg = messages[0];

        

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
