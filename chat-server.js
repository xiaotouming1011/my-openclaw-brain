const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const mime = require('mime-types');

const PORT = 8080;
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

// Helper: Send to OpenClaw Agent and Relay Reply
async function sendToOpenClaw(text, sessionKey) {
    try {
        console.log(`[Agent] Thinking on: "${text}"...`);
        
        // We will call the local OpenClaw CLI to get a response
        // This is a simple blocking call.
        const { exec } = require('child_process');
        
        // Construct a CLI command to run an agent turn
        // We use --local to avoid complex gateway auth if possible, or gateway if running
        // Using 'openclaw agent' command via gateway
        const cmd = `/home/ubuntu/.nvm/versions/node/v24.13.0/bin/node /home/ubuntu/.nvm/versions/node/v24.13.0/lib/node_modules/openclaw/dist/index.js agent --message "${text.replace(/"/g, '\\"')}" --session "${sessionKey}" --json`;
        
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error(`[Agent] Exec error: ${error.message}`);
                broadcastToWS("[System] Brain is offline or busy.");
                return;
            }
            
            try {
                // Parse the CLI JSON output
                const output = JSON.parse(stdout);
                const reply = output.response || output.message || output.text;
                
                if (reply) {
                    console.log(`[Agent] Reply: ${reply.substring(0, 50)}...`);
                    broadcastToWS(reply);
                } else {
                    console.warn("[Agent] Empty response from brain.");
                }
            } catch (e) {
                console.error("[Agent] Parse error:", e);
                // Fallback: try to send raw stdout if json parse fails
                 if (stdout) broadcastToWS(stdout);
            }
        });

    } catch (e) {
        console.error("[Agent] Network Error:", e);
    }
}

function broadcastToWS(text) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'text',
                sender: 'ai',
                text: text
            }));
        }
    });
}

server.listen(PORT, HOST, () => {
    console.log(`Chat Server running at http://${HOST}:${PORT}`);
    console.log(`WebSocket ready.`);
});
