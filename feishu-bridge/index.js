import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Try to load config from config.json (ignored by git)
// If not found, look for environment variables
let CONFIG = {
    APP_ID: process.env.FEISHU_APP_ID,
    APP_SECRET: process.env.FEISHU_APP_SECRET
};

const configPath = path.join(import.meta.dirname, 'config.json');
if (fs.existsSync(configPath)) {
    try {
        const localConfig = JSON.parse(fs.readFileSync(configPath));
        CONFIG = { ...CONFIG, ...localConfig };
    } catch (e) {
        console.error("Failed to read config.json", e);
    }
}

if (!CONFIG.APP_ID || !CONFIG.APP_SECRET) {
    console.error("ERROR: Missing APP_ID or APP_SECRET. Please create config.json or set env vars.");
    // Do not exit, just warn, so the file can still be imported for other functions
}

async function getTenantAccessToken() {
  const url = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
  try {
    const response = await axios.post(url, {
      app_id: CONFIG.APP_ID,
      app_secret: CONFIG.APP_SECRET
    });
    if (response.data.code !== 0) {
      throw new Error(`Auth failed: ${response.data.msg}`);
    }
    return response.data.tenant_access_token;
  } catch (error) {
    console.error('Error getting token:', error.message);
    throw error;
  }
}

export async function sendMessage(args) {
  const { receive_id_type = 'chat_id', receive_id, content, msg_type = 'text' } = args;
  
  if (!receive_id) {
    return { error: 'Missing receive_id' };
  }

  try {
    const token = await getTenantAccessToken();
    const url = `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receive_id_type}`;
    
    // Construct content based on type
    let contentBody;
    if (msg_type === 'text') {
        // Feishu text content must be a JSON string containing "text"
        contentBody = JSON.stringify({ text: content });
    } else {
        contentBody = content; // Assume pre-formatted JSON string for other types
    }

    const response = await axios.post(url, {
      receive_id: receive_id,
      msg_type: msg_type,
      content: contentBody
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      }
    });

    if (response.data.code !== 0) {
        return { error: `Feishu API error: ${response.data.msg}`, full: response.data };
    }

    return { success: true, data: response.data.data };

  } catch (error) {
    return { error: error.message, stack: error.stack };
  }
}

export async function listChats() {
  try {
    const token = await getTenantAccessToken();
    const url = 'https://open.feishu.cn/open-apis/im/v1/chats?page_size=20';
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.code !== 0) {
        return { error: `Feishu API error: ${response.data.msg}` };
    }
    
    return { 
        success: true, 
        chats: response.data.data.items.map(c => ({
            name: c.name,
            chat_id: c.chat_id,
            description: c.description
        }))
    };
  } catch (error) {
    return { error: error.message };
  }
}

export async function getHistory(args) {
    const { container_id_type = 'chat', container_id } = args;
    if (!container_id) return { error: 'Missing container_id' };

    try {
        const token = await getTenantAccessToken();
        const url = `https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=${container_id_type}&container_id=${container_id}&page_size=20`;
        
        // Log URL for debugging
        // console.log('DEBUG Fetch URL:', url);

        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.data.code !== 0) {
            return { error: `Feishu API error: ${response.data.msg}` };
        }

        return {
            success: true,
            messages: response.data.data.items.map(m => ({
                msg_id: m.message_id,
                sender: m.sender.sender_id,
                content: m.body.content, // Usually a JSON string
                time: m.create_time
            })).reverse() // Oldest first
        };
    } catch (error) {
        if (error.response) {
             return { error: `Request failed with status code ${error.response.status}: ${JSON.stringify(error.response.data)}` };
        }
        return { error: error.message };
    }
}

// CLI adapter for OpenClaw
if (process.argv[1] === import.meta.filename) {
    const args = JSON.parse(process.argv[2] || '{}');
    if (args.action === 'list_chats') {
        listChats().then(console.log).catch(console.error);
    } else if (args.action === 'get_history') {
        getHistory(args).then(console.log).catch(console.error);
    } else {
        sendMessage(args).then(console.log).catch(console.error);
    }
}
