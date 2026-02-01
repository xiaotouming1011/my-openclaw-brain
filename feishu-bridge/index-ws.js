import { Client, WSClient, EventDispatcher } from '@larksuiteoapi/node-sdk';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try load config
let localConfig = {};
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        localConfig = JSON.parse(fs.readFileSync(configPath));
    }
} catch (e) {
    console.error("Failed to load config.json:", e.message);
}

// Configuration
const CONFIG = {
    APP_ID: process.env.FEISHU_APP_ID || localConfig.APP_ID,
    APP_SECRET: process.env.FEISHU_APP_SECRET || localConfig.APP_SECRET,
    OPENCLAW_HOOK_URL: "http://127.0.0.1:18789/hooks/agent",
    OPENCLAW_HOOK_TOKEN: "feishu-bridge-secret-2024", 
    PORT: 3000
};

if (!CONFIG.APP_ID || !CONFIG.APP_SECRET) {
    console.error("Missing APP_ID or APP_SECRET in config.json or env");
    process.exit(1);
}

// 1. Initialize Lark Client (for sending messages)
const client = new Client({
    appId: CONFIG.APP_ID,
    appSecret: CONFIG.APP_SECRET,
});

// 2. Initialize WS Client (for receiving messages)
const wsClient = new WSClient({
    appId: CONFIG.APP_ID,
    appSecret: CONFIG.APP_SECRET,
});

// 3. Start WebSocket Connection
wsClient.start({
    eventDispatcher: new EventDispatcher({}).register({
        'im.message.receive_v1': async (data) => {
            const chatId = data.message.chat_id;
            const content = JSON.parse(data.message.content);
            const text = content.text;
            
            console.log(`[WS] Received from ${chatId}: ${text}`);

            // Forward to OpenClaw
            try {
                const res = await fetch(CONFIG.OPENCLAW_HOOK_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-openclaw-token": CONFIG.OPENCLAW_HOOK_TOKEN
                    },
                    body: JSON.stringify({
                        message: `(From Feishu) ${text}\n\n[SYSTEM]: Reply using 'feishu_reply' with chatId='${chatId}'.`,
                        sessionKey: `feishu-${chatId}`,
                        deliver: false, // Don't auto-send via message tool, let agent handle
                        name: "Feishu"
                    })
                });
                if (!res.ok) {
                    console.error("OpenClaw hook failed:", res.status, await res.text());
                }
            } catch (err) {
                console.error("Failed to forward to OpenClaw:", err);
            }
        }
    })
});

// 4. HTTP Server for Outbound (OpenClaw -> Feishu)
const server = http.createServer(async (req, res) => {
    // Only handle sending
    if (req.url === '/send' && req.method === 'POST') {
        const buffers = [];
        for await (const chunk of req) buffers.push(chunk);
        const bodyStr = Buffer.concat(buffers).toString() || '{}';
        
        let body;
        try {
            body = JSON.parse(bodyStr);
        } catch (e) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Invalid JSON" }));
            return;
        }

        try {
            await client.im.message.create({
                params: { receive_id_type: 'chat_id' },
                data: {
                    receive_id: body.chatId,
                    msg_type: 'text',
                    content: JSON.stringify({ text: body.text })
                }
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: "sent" }));
            console.log(`[HTTP] Sent to ${body.chatId}`);
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
            console.error("Send failed:", err);
        }
    } else {
        res.writeHead(404);
        res.end("Not Found");
    }
});

server.listen(CONFIG.PORT, () => {
    console.log(`Feishu Bridge (WS Mode) running on port ${CONFIG.PORT}`);
});
