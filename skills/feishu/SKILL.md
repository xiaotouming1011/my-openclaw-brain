# Feishu Integration

## Description
Allows sending messages to Feishu (Lark) chats via a local bridge.
Use this to reply to users when you receive messages from the Feishu bridge.

## Tools

### feishu_reply
Send a text message to a specific Feishu chat.

- `chatId` (string, required): The Feishu chat_id to send to.
- `text` (string, required): The message content.

```bash
curl -X POST -H "Content-Type: application/json" -d '{"chatId": "${chatId}", "text": "${text}"}' http://127.0.0.1:3000/send
```
