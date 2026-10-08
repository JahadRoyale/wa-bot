const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');

const SECRET_TOKEN = 'MY_SECURE_TOKEN_123';
const GROUP_JID = process.env.GROUP_JID; // We will add this in Render later
let globalSock = null;

// --- API TO RECEIVE COMMANDS FROM HOSTINGER ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/send') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                if (data.secret !== SECRET_TOKEN) {
                    res.writeHead(403);
                    return res.end('Unauthorized');
                }
                
                if (globalSock && GROUP_JID && data.message) {
                    await globalSock.sendMessage(GROUP_JID, { text: data.message });
                    res.writeHead(200);
                    res.end('Sent to WhatsApp');
                } else {
                    res.writeHead(500);
                    res.end('Bot not ready or GROUP_JID missing in Render Env Vars');
                }
            } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
    } else {
        res.writeHead(200);
        res.end('WhatsApp Bot is running!');
    }
}).listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 API listening on port ${PORT}`);
});

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    globalSock = sock; // Share socket with the HTTP server

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        
        if (qr && !sock.authState.creds.registered) {
            const phoneNumber = process.env.BOT_NUMBER;
            if (phoneNumber) {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log(`\n🔑 PAIRING CODE: ${code}\n`);
                } catch (err) {}
            }
        }
        if (connection === 'open') console.log('✅ WhatsApp Bot Connected!');
        else if (connection === 'close') startBot();
    });

    // Helper: Logs your Group ID whenever someone types in the WhatsApp Group
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        
        if (msg.key.remoteJid.endsWith('@g.us')) {
            console.log(`\n📌 SAVE THIS GROUP JID: ${msg.key.remoteJid}`);
        }
    });
}

startBot();
