import fs from 'fs';
import path from 'path';

let CONFIG = {
    APP_ID: 'cli_a9f65e65c8b85bdf',
    APP_SECRET: 'sMS9hnyOPeBjIcfkXBetGhiQHmoCx6Iz'
};

// Try to read from adjacent feishu-bridge if available
try {
    const bridgeConfigPath = path.resolve('../feishu-bridge/config.json');
    if (fs.existsSync(bridgeConfigPath)) {
        const local = JSON.parse(fs.readFileSync(bridgeConfigPath, 'utf8'));
        CONFIG = { ...CONFIG, ...local };
    }
} catch (e) {
    // ignore
}

let cachedToken = null;
let tokenExpiry = 0;

async function getTenantAccessToken() {
    if (cachedToken && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    const url = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            app_id: CONFIG.APP_ID,
            app_secret: CONFIG.APP_SECRET
        })
    });
    
    const data = await res.json();
    if (data.code !== 0) {
        throw new Error(`Auth failed: ${data.msg}`);
    }

    cachedToken = data.tenant_access_token;
    tokenExpiry = Date.now() + (data.expire * 1000) - 60000; // Buffer 60s
    return cachedToken;
}

export const plugin = {
    meta: {
        id: 'feishu',
        name: 'Feishu Channel',
        version: '1.0.0'
    },
    load: (api) => {
        api.registerChannel('feishu', {
            send: async (msg) => {
                // msg: { to (chat_id), text, ... }
                const token = await getTenantAccessToken();
                const url = `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`;

                // If msg.to is missing, we can't send.
                // OpenClaw might pass 'to' from the session.
                if (!msg.to) {
                    throw new Error('Missing "to" (chat_id) in message');
                }

                const content = JSON.stringify({ text: msg.text || '(no text)' });

                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json; charset=utf-8'
                    },
                    body: JSON.stringify({
                        receive_id: msg.to,
                        msg_type: 'text',
                        content: content
                    })
                });

                const data = await res.json();
                if (data.code !== 0) {
                    throw new Error(`Feishu API error: ${data.msg}`);
                }
                
                return {
                    id: data.data?.message_id,
                    timestamp: new Date().toISOString()
                };
            }
        });

        api.logger.info('Feishu plugin loaded successfully');
    }
};
