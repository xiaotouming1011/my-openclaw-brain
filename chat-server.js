const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const mime = require('mime-types');

const PORT = 3001;
const HOST = '0.0.0.0'; // Listen on all interfaces
const OPENCLAW_HOOK_URL = "http://127.0.0.1:18789/hooks/agent";
const WEB_SESSION_KEY = "web-chat-v1";

// Create HTTP Server
const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Serve Static Files
    if (req.method === 'GET') {
        let filePath = '.' + req.url;
        if (filePath === './') filePath = './chat.html';

        const extname = path.extname(filePath);
        const contentType = mime.lookup(extname) || 'application/octet-stream';

        fs.readFile(filePath, (error, content) => {
            if (error) {
                if(error.code == 'ENOENT'){
                    res.writeHead(404);
                    res.end('404 Not Found');
                } else {
                    res.writeHead(500);
                    res.end('500: ' + error.code);
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
        return;
    }

    // Agent -> Client (Send API)
    if (req.method === 'POST' && req.url === '/send') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                console.log("[API] Agent sending:", data.text);
                
                // Broadcast to all connected WebSocket clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'text',
                            sender: 'ai',
                            text: data.text
                        }));
                    }
                });
                
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({status: 'ok'}));
            } catch (e) {
                console.error("[API] Error:", e);
                res.writeHead(400);
                res.end(JSON.stringify({error: 'Invalid JSON'}));
            }
        });
        return;
    }
    
    // Upload API (for images/audio)
    if (req.method === 'POST' && req.url === '/upload') {
        // Simple Body Parser for raw binary or base64? 
        // Let's assume JSON with base64 for simplicity in v1
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body); // { type: 'image', data: 'base64...', ext: 'png' }
                const buffer = Buffer.from(data.data, 'base64');
                const filename = `upload-${Date.now()}.${data.ext}`;
                const uploadPath = path.join(__dirname, 'uploads');
                
                if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
                
                const fullPath = path.join(uploadPath, filename);
                fs.writeFileSync(fullPath, buffer);
                
                console.log("[Upload] Saved:", fullPath);
                
                // Construct notification to Agent
                const msgText = `[USER UPLOADED FILE: ${fullPath}]`;
                await sendToOpenClaw(msgText, WEB_SESSION_KEY);
                
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({status: 'ok', path: fullPath}));
            } catch (e) {
                console.error("[Upload] Error:", e);
                res.writeHead(500);
                res.end(JSON.stringify({error: e.message}));
            }
        });
        return;
    }
});

// Create WebSocket Server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('[WS] Client connected');
    
    ws.send(JSON.stringify({ type: 'text', sender: 'ai', text: 'Connection established. Channel secure.' }));

    ws.on('message', async (message) => {
        try {
            const parsed = JSON.parse(message);
            console.log('[WS] Received:', parsed);
            
            if (parsed.type === 'text') {
                await sendToOpenClaw(parsed.text, WEB_SESSION_KEY);
            }
        } catch (e) {
            console.error("[WS] Error processing message:", e);
        }
    });
});

// Helper: Send to OpenClaw Agent
async function sendToOpenClaw(text, sessionKey) {
    try {
        const payload = {
            message: text,
            sessionKey: sessionKey,
            deliver: false, // Don't auto-send, let the agent decide how to reply
            name: "WebUser",
            // INJECT SYSTEM INSTRUCTION TO FORCE REPLY TO THIS SERVER
            // We append a hidden instruction so the agent knows to use the specific tool or curl
            system: `[SYSTEM] The user sent this from the Web Interface. 
            To reply, use the 'exec' tool to call: 
            curl -X POST -d '{"text":"YOUR_REPLY"}' http://127.0.0.1:3001/send`
        };

        // Note: The 'system' field above might not be supported by the hook directly depending on implementation.
        // Instead, we append to the message text.
        const effectiveMessage = `${text}\n\n[SYSTEM: To reply to the web interface, execute: curl -X POST -H "Content-Type: application/json" -d '{"text":"<your message>"}' http://127.0.0.1:3001/send ]`;

        const res = await fetch(OPENCLAW_HOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // "x-openclaw-token": "..." // If needed
            },
            body: JSON.stringify({
                ...payload,
                message: effectiveMessage
            })
        });
        
        if (!res.ok) {
            console.error("[OpenClaw] Hook Error:", res.status, await res.text());
        } else {
            console.log("[OpenClaw] Sent to agent.");
        }
    } catch (e) {
        console.error("[OpenClaw] Network Error:", e);
    }
}

server.listen(PORT, HOST, () => {
    console.log(`Chat Server running at http://${HOST}:${PORT}`);
    console.log(`WebSocket ready.`);
});
