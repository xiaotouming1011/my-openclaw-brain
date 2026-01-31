#!/bin/bash
# sync-brain.sh
# Checks for changes in the workspace and pushes them to GitHub

# Navigate to workspace
cd /home/ubuntu/.openclaw/workspace

# Check if there are changes
if [[ -n $(git status -s) ]]; then
  echo "🧠 Brain change detected. Syncing to cloud..."
  git add .
  git commit -m "Auto-sync: $(date '+%Y-%m-%d %H:%M:%S')"
  git push
  echo "✅ Sync complete."
else
  echo "🧠 No changes to sync."
fi
