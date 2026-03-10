# VoiceWake - 本地语音唤醒与识别功能实现文档

## 💡 一、功能概述
本功能使得用户可以通过直接对话的方式与 OpenClaw 进行交互。系统会在后台静默监听麦克风，将用户的语音实时转换为文本，交由 OpenClaw 处理，最后通过系统的文本转语音（TTS）功能将 AI 的回复大声朗读出来。

*   **免提交互**：无需键盘输入，像和真人聊天一样自然。
*   **本地优先**：优先使用本地的麦克风权限和系统原生能力（如 macOS 的 `say` 命令），保障隐私安全。
*   **无缝衔接**：通过特定的前缀标识（`User talked via voice recognition:`），让 OpenClaw 能够感知到这是来自语音的请求，从而触发特定的语音回复行为。

---

## 🛠️ 二、核心技术链路与架构

整个语音唤醒和识别的闭环可以分为以下四个核心模块：

### 1. 🎤 实时拾音与端点检测 (Audio Input & VAD)
*   **工具选型**：Python `PyAudio` 或 macOS 快捷指令。
*   **实现原理**：脚本在后台监听麦克风输入，引入 **VAD (Voice Activity Detection，静音检测)** 机制，音量超过阈值开始录制，低于阈值结束录制。

### 2. 🧠 语音转文字 (STT - Speech to Text)
*   **工具选型**：OpenAI `Whisper` 模型（本地部署版）、或者 macOS 原生听写 API。
*   **实现原理**：将有效音频片段送入 STT 引擎，转换为中文字符串。

### 3. ⚡ 指令注入与触发 OpenClaw
*   **实现原理**：识别文本前强制拼接上下文标识：`User talked via voice recognition: [识别出的文本]`。
*   **下发方式**：通过 OpenClaw 本地 Gateway Webhook 或 `openclaw message send`，或者 `openclaw system event` 模拟用户输入。

### 4. 🗣️ 语音回复反馈 (TTS - Text to Speech)
*   **工具选型**：macOS 系统自带的 `say` 命令（通过 OpenClaw `voice-wake-say` Skill）。
*   **实现原理**：通过在 Skill 脚本中运行阻塞式的 `printf '%s' "回复内容" | say`，用户能第一时间“听”到 AI 的响应。

---

## ⚠️ 三、多轮对话与接力棒 (Walkie-Talkie Mode)

### 难点 1：如何进行丝滑的多轮对话（取消循环录音）
*   **问题**：如果在快捷指令里写一个 100 次的循环循环录音，既不准确也不优雅。
*   **解决方案**：采用基于进程状态的“麦克风交接权”。macOS 的 `say` 命令是**阻塞式**的。在 AI 说话完毕之前，该命令不会结束。
*   **接力棒**：在 `voice-wake-say` 这个 Skill 的末尾加入如下代码：
    ```bash
    printf '%s' "回答的文本" | say
    # 当 say 进程结束后，通过脚本再次唤醒录音快捷指令
    shortcuts run "唤醒龙虾"
    ```
    这样就能实现类似对讲机的对话：AI 说完，人类的麦克风自动亮起等待输入。