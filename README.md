# QwenCode Desktop

QwenCode Desktop 是一个专为开发者设计的 AI 辅助编程桌面环境。它基于 PyWebview 构建，集成了 Qwen 和 Gemini 大模型，提供具备上下文感知的智能对话、代码编辑、项目管理以及 Git 版本控制功能，旨在打造沉浸式的 AI 结对编程体验。

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Python](https://img.shields.io/badge/python-3.10+-blue.svg) ![React](https://img.shields.io/badge/react-18+-61DAFB.svg)

## ✨ 核心功能

- **🤖 多模型智能对话**
  - 集成 Qwen 和 Gemini 大语言模型，支持流式响应。
  - 具备项目上下文感知能力，能够理解并引用项目中的文件内容。

- **🛠️ 全能项目管理**
  - 内置文件资源管理器，支持多项目切换与管理。
  - 提供全文搜索功能，快速定位代码片段。

- **📝 沉浸式代码编辑**
  - 集成 CodeMirror 编辑器，支持多种语言的语法高亮。
  - 支持 Markdown、PDF、Excel、图片等多种格式文件的实时预览。

- **🔄 版本控制集成**
  - 内置 Git 管理面板，直观查看文件变更。
  - 支持版本对比、回退、提交和撤销更改。

- **🔌 扩展能力**
  - 支持 MCP (Model Context Protocol) 协议，可扩展 AI 的工具调用能力。
  - 内置终端，方便执行命令行操作。

## 🚀 快速开始

### 环境要求

- Python 3.10 或更高版本
- Node.js 18+ (用于构建前端)
- pnpm (推荐) 或 npm

### 1. 克隆项目

```bash
git clone https://github.com/your-username/qwencode-desktop.git
cd qwencode-desktop
```

### 2. 构建前端

```bash
cd frontend
pnpm install
pnpm build
cd ..
```

### 3. 安装后端依赖

```bash
pip install -r requirements.txt
```

### 4. 启动应用

```bash
python start.py
```

## 📂 项目结构

- `crates/` - 后端核心逻辑 (Python 模块)
  - `backend/` - API 接口与业务逻辑
  - `parsers/` - 模型输出解析器
- `frontend/` - 前端用户界面 (React + Vite)
- `server/` - 后端 Web 服务 (FastAPI)
- `start.py` - 应用启动入口

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE) 开源。

---

*注：本项目使用了 [PyStand](https://github.com/skywind3000/PyStand) 进行打包分发。关于 PyStand 的详细说明请参考 [README_PyStand.md](README_PyStand.md)。*
