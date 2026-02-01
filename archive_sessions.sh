#!/bin/bash
SESSION_DIR="/home/ubuntu/.openclaw/agents/main/sessions"
ARCHIVE_DIR="$SESSION_DIR/archive"

echo "Creating archive directory..."
mkdir -p "$ARCHIVE_DIR"

echo "Moving session files to archive..."
# 移动所有 .jsonl 文件，附加时间戳以防重名
for f in "$SESSION_DIR"/*.jsonl; do
    if [ -f "$f" ]; then
        filename=$(basename "$f")
        timestamp=$(date +%Y%m%d_%H%M%S)
        mv "$f" "$ARCHIVE_DIR/${timestamp}_${filename}"
        echo "Archived $filename"
    fi
done

# 清理 lock 文件
rm -f "$SESSION_DIR"/*.lock

echo "Restarting OpenClaw Gateway..."
# 使用 nohup 后台运行重启，防止当前 shell 中断导致重启失败
nohup bash -c "sleep 2; openclaw gateway restart" > /dev/null 2>&1 &
echo "Restart scheduled in 2 seconds."
