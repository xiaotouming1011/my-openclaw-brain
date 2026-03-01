# OpenClaw Office（2D 可视化面板）快速复现手册

## 目标
在新机器上快速部署 `wickedapp/openclaw-office`，实现：
- `http://127.0.0.1:4200` 可访问
- 与本机 OpenClaw Gateway 连通
- 可随时一键卸载，便于后续替换更好的同类产品

## 1) 前置条件
- 已安装并可用 `openclaw` CLI
- 本机 Gateway 已启动（默认 `127.0.0.1:18789`）
- 已安装 `node` / `npm`

## 2) 安装目录
统一放在：`~/.openclaw/apps/openclaw-office`

```bash
mkdir -p ~/.openclaw/apps
cd ~/.openclaw/apps
git clone https://github.com/wickedapp/openclaw-office.git
cd openclaw-office
npm install
```

## 3) 配置
### 3.1 生成配置文件
```bash
cp openclaw-office.config.example.json openclaw-office.config.json
```

建议关键项：
- `gateway.url`: `ws://127.0.0.1:18789`
- `deployment.port`: `4200`

### 3.2 写入网关 token
```bash
TOKEN=$(jq -r '.gateway.auth.token' ~/.openclaw/openclaw.json)
cat > .env.local <<EOF
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=$TOKEN
PORT=4200
EOF
```

## 4) 兼容设置（关键）
当前这套面板在某些 OpenClaw 版本下会触发 `device identity` 拒绝；本次可用做法：

```bash
jq '.gateway.controlUi.allowInsecureAuth=true | .gateway.controlUi.dangerouslyDisableDeviceAuth=true' \
  ~/.openclaw/openclaw.json > ~/.openclaw/openclaw.json.tmp && \
  mv ~/.openclaw/openclaw.json.tmp ~/.openclaw/openclaw.json

openclaw gateway restart
```

> 备注：这是兼容性“降级开关”。如后续版本不再需要，可回滚为 `false`。

## 5) 启动与自启动（macOS launchd）
```bash
cd ~/.openclaw/apps/openclaw-office
npm run build
```

创建 `~/Library/LaunchAgents/com.openclaw.office.plist`，`ProgramArguments` 使用：
- `npm`
- `start`

并在 `EnvironmentVariables` 中显式加入（避免走系统代理导致网关被判非本地）：
- `HTTP_PROXY=""`
- `HTTPS_PROXY=""`
- `ALL_PROXY=""`
- `NO_PROXY="127.0.0.1,localhost"`

加载服务：
```bash
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.openclaw.office.plist
launchctl kickstart -k "gui/$(id -u)/com.openclaw.office"
```

## 6) 验证
```bash
curl -I http://127.0.0.1:4200
curl -s http://127.0.0.1:4200/api/health | jq .
```

查看日志：
```bash
tail -n 200 ~/.openclaw/apps/openclaw-office/openclaw-office.log
tail -n 200 ~/.openclaw/apps/openclaw-office/openclaw-office.err.log
```

## 7) 卸载（保留替换能力）
推荐保留脚本：`~/.openclaw/apps/openclaw-office/uninstall-openclaw-office.sh`

脚本应执行：
1. `launchctl bootout/unload` 服务
2. 删除 `~/Library/LaunchAgents/com.openclaw.office.plist`
3. 删除 `~/.openclaw/apps/openclaw-office`

手工卸载兜底：
```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.openclaw.office.plist || true
launchctl unload ~/Library/LaunchAgents/com.openclaw.office.plist || true
rm -f ~/Library/LaunchAgents/com.openclaw.office.plist
rm -rf ~/.openclaw/apps/openclaw-office
```

## 8) 回滚兼容开关（可选）
若不再使用该面板，且希望恢复更严格网关策略：

```bash
jq '.gateway.controlUi.allowInsecureAuth=false | .gateway.controlUi.dangerouslyDisableDeviceAuth=false' \
  ~/.openclaw/openclaw.json > ~/.openclaw/openclaw.json.tmp && \
  mv ~/.openclaw/openclaw.json.tmp ~/.openclaw/openclaw.json

openclaw gateway restart
```
