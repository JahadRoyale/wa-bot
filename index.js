const { default: makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');

const SECRET_TOKEN = 'MY_SECURE_TOKEN_123';
const GROUP_JID = process.env.GROUP_JID;
let globalSock = null;

// --- DUMMY WEB SERVER FOR RENDER ---
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
                    res.end('Bot not ready or GROUP_JID missing');
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
    // Using fresh folder name 'auth_info_v2' to purge ghost sessions
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_v2');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        // Added Browser signature so WhatsApp accepts the connection
        browser: Browsers.macOS('Desktop')
    });

    globalSock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        
        if (qr && !sock.authState.creds.registered) {
            const phoneNumber = process.env.BOT_NUMBER;
            if (phoneNumber) {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log(`\n=================================\n🔑 NEW PAIRING CODE: ${code}\n=================================\n`);
                } catch (err) {
                    console.error("Failed to request pairing code:", err.message);
                }
            }
        }
        
        if (connection === 'open') {
            console.log('✅ WhatsApp Bot Connected!');
            
            // Print Group IDs 3 seconds after connecting
            setTimeout(async () => {
                try {
                    const groups = await sock.groupFetchAllParticipating();
                    console.log('\n=== 📌 YOUR WHATSAPP GROUPS ===');
                    for (const id in groups) {
                        console.log(`Name: "${groups[id].subject}" -> GROUP_JID: ${id}`);
                    }
                    console.log('===================================\n');
                } catch (e) {
                    console.log('Could not fetch groups.');
                }
            }, 3000);
        }
        else if (connection === 'close') startBot();
    });
}

startBot();
