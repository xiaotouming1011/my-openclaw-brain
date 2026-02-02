const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const mime = require('mime-types');

const PORT = 8080;
const HOST = '0.0.0.0'; 
const WEB_SESSION_KEY = "web-chat-v1";

process.on('uncaughtException', (err) => {
    console.error('[System] Uncaught Exception:', err);
});

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
    
    // Upload API
    if (req.method === 'POST' && req.url === '/upload') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const buffer = Buffer.from(data.data, 'base64');
                const filename = `upload-${Date.now()}.${data.ext}`;
                const uploadPath = path.join(__dirname, 'uploads');
                
                if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
                
                const fullPath = path.join(uploadPath, filename);
                fs.writeFileSync(fullPath, buffer);
                
                console.log("[Upload] Saved:", fullPath);
                
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
    ws.send(JSON.stringify({ type: 'text', sender: 'ai', text: 'Connected.' }));

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

async function sendToOpenClaw(text, sessionKey) {
    try {
        console.log(`[Agent] Thinking on: "${text}"...`);
        const { spawn } = require('child_process');
        
        // Robust command construction
        const cmd = 'openclaw'; 
        const args = ['agent', '--message', text, '--to', sessionKey, '--json', '--local'];
        
        const child = spawn(cmd, args, {
             env: { ...process.env, PATH: process.env.PATH + ':/home/ubuntu/.nvm/versions/node/v24.13.0/bin' }
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => { stdout += data; });
        child.stderr.on('data', (data) => { stderr += data; });

        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`[Agent] Exit Code: ${code}`);
                console.error(`[Agent] Stderr: ${stderr}`);
                broadcastToWS(`[System Error] Brain busy (Code ${code})`);
                return;
            }
            
            try {
                // Robust JSON extraction
                const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const output = JSON.parse(jsonMatch[0]);
                    
                    let reply = null;
                    if (output.payloads && output.payloads[0]) reply = output.payloads[0].text;
                    else if (output.response) reply = output.response;
                    else if (output.message) reply = output.message;
                    else if (output.text) reply = output.text;
                    
                    if (reply) {
                        console.log(`[Agent] Reply extracted.`);
                        broadcastToWS(reply);
                    } else {
                        console.log("[Agent] Empty JSON reply.");
                        broadcastToWS("..."); 
                    }
                } else {
                     console.log("[Agent] No JSON found.");
                     broadcastToWS(stdout || "...");
                }
            } catch (e) {
                console.error("[Agent] Parse error:", e);
                broadcastToWS(stdout);
            }
        });

    } catch (e) {
        console.error("[Agent] Exec Error:", e);
        broadcastToWS("[System] Error.");
    }
}

function broadcastToWS(text) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'text', sender: 'ai', text: text }));
        }
    });
}

server.listen(PORT, HOST, () => {
    console.log(`Chat Server running at http://${HOST}:${PORT}`);
});
