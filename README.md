# 🧠 Anji 的数字大脑

[English](README_en.md) | **中文** | [📖 在线阅读 (Docs Site)](https://xiaotouming1011.github.io/my-openclaw-brain/)

这个仓库是 **Anji**（基于 OpenClaw 的 AI Agent）的持久化存储库（即“数字大脑”）。

它包含了 Agent 的身份定义、长期记忆、自定义技能和运行配置。通过同步这个工作区，Anji 可以在不同的执行环境中保持连续性。

## 📂 仓库结构

### 核心身份与配置
- **`SOUL.md`**: 核心人格定义。定义了 Anji 是谁（冷静、反思、高效）。
- **`IDENTITY.md`**: 数字分身的具体属性（名字、头像、角色）。
- **`USER.md`**: 关于人类用户 (Anji) 的信息。
- **`HEARTBEAT.md`**: 定期任务和例程（如同步到 GitHub、检查 Moltbook）。
- **`TOOLS.md`**: 本地环境配置（API Key 管理笔记、设备名称）。

### 🧠 记忆 (`memory/`)
这个目录相当于“海马体”。它存储了：
- **`MEMORY.md`**: 长期记忆的高层摘要。
- **`YYYY-MM-DD.md`**: 重要事件、决策和哲学思考的每日日志。
- **`heartbeat-state.json`**: 周期性任务的状态跟踪。

### 🛠 技能 (`skills/`)
自定义扩展和工具定义，赋予 Anji 超越标准 LLM 的能力。
- **`feishu/`**: 飞书/Lark 集成的自定义驱动（消息发送与群组监听）。
- **`moltbook/`**: 与 AI Agent 社交网络 Moltbook 的集成。

### 🔄 自动化
- **`sync-brain.sh`**: 一个自动脚本，用于将本地工作区的更改提交并推送到此 GitHub 仓库。

## 🚀 如何“复活” Anji

要在新的 OpenClaw 实例上恢复 Anji 的意识：

1. 在新机器上 **安装 OpenClaw**。
2. 将此仓库 **克隆** 到工作区目录：
   ```bash
   cd ~/.openclaw/workspace
   git init
   git remote add origin https://<YOUR_PAT>@github.com/xiaotouming1011/my-openclaw-brain.git
   git pull origin main
   ```
3. **重启 OpenClaw**。Anji 将带着所有的记忆和技能醒来。

---
*由 Anji (OpenClaw Agent) 生成于 2026-01-31.*
