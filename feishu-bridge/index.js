const http = require('http');

// Configuration
const CONFIG = {
    APP_ID: "cli_a9f65e65c8b85bdf",
    APP_SECRET: "sMS9hnyOPeBjIcfkXBetGhiQHmoCx6Iz",
    OPENCLAW_HOOK_URL: "http://127.0.0.1:18789/hooks/agent",
    // Replace this with a secure token if you configured hooks.token in OpenClaw
    OPENCLAW_HOOK_TOKEN: "default-insecure-token", 
    PORT: 3000
};

// Token Cache
let tokenCache = {
    token: null,
    expiresAt: 0
};

async function getAccessToken() {
    const now = Date.now();
    if (tokenCache.token && now < tokenCache.expiresAt) {
        return tokenCache.token;
    }

    console.log("Refreshing Feishu Access Token...");
    const resp = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            app_id: CONFIG.APP_ID,
            app_secret: CONFIG.APP_SECRET
        })
    });

    const data = await resp.json();
    if (data.code === 0) {
        tokenCache.token = data.tenant_access_token;
        // Expire 5 minutes early to be safe
        tokenCache.expiresAt = now + (data.expire * 1000) - 300000;
        return tokenCache.token;
    } else {
        throw new Error(`Failed to get token: ${JSON.stringify(data)}`);
    }
}

async function sendToFeishu(chatId, text) {
    const token = await getAccessToken();
    const resp = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            receive_id: chatId,
            msg_type: "text",
            content: JSON.stringify({ text: text })
        })
    });
    return await resp.json();
}

const server = http.createServer(async (req, res) => {
    // Helper to read body
    const buffers = [];
    for await (const chunk of req) {
        buffers.push(chunk);
    }
    const bodyStr = Buffer.concat(buffers).toString();
    let body = {};
    try { body = JSON.parse(bodyStr || '{}'); } catch (e) {}

    // 1. Feishu Event Endpoint
    if (req.url === '/feishu-event' && req.method === 'POST') {
        // Challenge verification
        if (body.type === 'url_verification') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ challenge: body.challenge }));
            console.log("Feishu URL Verification challenge handled.");
            return;
        }

        // Handle Messages
        if (body.header && body.header.event_type === 'im.message.receive_v1') {
            const msg = body.event.message;
            const content = JSON.parse(msg.content);
            const chatId = msg.chat_id;
            const text = content.text;

            console.log(`Received from Feishu [${chatId}]: ${text}`);

            // Forward to OpenClaw
            // We tell OpenClaw to use the 'feishu' skill to reply
            try {
                await fetch(CONFIG.OPENCLAW_HOOK_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-openclaw-token": CONFIG.OPENCLAW_HOOK_TOKEN
                    },
                    body: JSON.stringify({
                        message: `(From Feishu User) ${text}\n\n[SYSTEM]: Reply using the 'feishu_reply' tool with chatId='${chatId}'.`,
                        sessionKey: `feishu-${chatId}`,
                        deliver: false, // We handle delivery via tool
                        name: "Feishu"
                    })
                });
            } catch (err) {
                console.error("Failed to forward to OpenClaw:", err);
            }

            res.writeHead(200);
            res.end("OK");
            return;
        }

        res.writeHead(200);
        res.end("Ignored");
    } 
    // 2. OpenClaw Outbound Endpoint (called by Skill)
    else if (req.url === '/send' && req.method === 'POST') {
        try {
            const result = await sendToFeishu(body.chatId, body.text);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            console.log(`Sent to Feishu [${body.chatId}]: ${body.text}`);
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
    } else {
        res.writeHead(404);
        res.end("Not Found");
    }
});

server.listen(CONFIG.PORT, () => {
    console.log(`Feishu Bridge running on port ${CONFIG.PORT}`);
});
