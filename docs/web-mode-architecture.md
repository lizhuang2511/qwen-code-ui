# QwenCode Desktop Web 模式技术结构分析

## 1. 整体架构概述

QwenCode Desktop 是一个基于 **PyWebview + FastAPI + React** 构建的 AI 辅助编程桌面环境。项目采用 **前后端分离** 架构，支持两种运行模式：

| 模式 | 前端容器 | 后端服务 | 通信方式 |
|------|----------|----------|----------|
| **桌面模式** | PyWebview 原生窗口 | FastAPI (本地) | JS Bridge + HTTP |
| **Web 模式** | 浏览器 | FastAPI (可远程) | HTTP + WebSocket |

---

## 2. 技术栈总览

### 2.1 后端技术栈

| 组件 | 技术 | 版本 | 用途 |
|------|------|------|------|
| Web 框架 | FastAPI | ≥0.95.0 | REST API + WebSocket 服务 |
| ASGI 服务器 | Uvicorn | ≥0.20.0 | 后端服务运行 |
| 数据验证 | Pydantic | ≥2.0.0 | 请求/响应数据校验 |
| 桌面容器 | PyWebview | ≥5.0.0 | 原生窗口封装 (仅桌面模式) |
| HTTP 客户端 | Requests | ≥2.28.0 | 外部 API 调用 |
| 环境变量 | Python-dotenv | ≥1.0.0 | .env 配置管理 |

### 2.2 前端技术栈

| 组件 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 框架 | React | 19.1.1 | UI 组件开发 |
| 构建工具 | Vite | 7.1.3 | 开发服务器 + 打包 |
| 语言 | TypeScript | 5.9.2 | 类型安全 |
| UI 框架 | Tailwind CSS | 4.1.12 | 原子化 CSS |
| 组件库 | Radix UI | 最新 | 无头组件 |
| 路由 | React Router | 7.8.1 | 页面导航 |
| 代码编辑器 | CodeMirror 6 | 6.x | 代码高亮编辑 |
| Markdown | React Markdown | 10.1.0 | Markdown 渲染 |
| 图表/图标 | Lucide React | 0.540.0 | 图标库 |
| 状态管理 | Context API | - | 全局状态 |
| PDF 处理 | React PDF | 10.1.0 | PDF 预览 |
| 表格处理 | XLSX | 0.18.5 | Excel 处理 |

---

## 3. 项目目录结构

```
qwencode5/
├── crates/                 # 后端核心模块
│   ├── backend/
│   │   └── api.py         # JS Bridge API 接口层
│   ├── filesystem.py      # 文件系统操作
│   ├── session.py         # AI 会话管理
│   ├── search.py          # 聊天记录搜索
│   ├── projects.py        # 项目管理
│   ├── version_utils.py   # 版本/备份管理
│   └── rpc.py             # RPC 日志记录
├── server/
│   ├── main.py            # FastAPI 主应用 (Web 模式核心)
│   └── api_web.py         # Web API 路由
├── frontend/
│   ├── src/
│   │   ├── components/    # React 组件
│   │   ├── contexts/      # React Context
│   │   ├── hooks/         # 自定义 Hooks
│   │   ├── pages/         # 页面组件
│   │   ├── lib/           # 工具库 (API 封装)
│   │   └── types/         # TypeScript 类型
│   ├── dist/              # 构建产物 (生产模式)
│   └── vite.config.ts     # Vite 配置
├── main.py                # 桌面模式入口
└── requirements.txt       # Python 依赖
```

---

## 4. Web 模式架构详解

### 4.1 启动流程

```
┌─────────────────────────────────────────────────────────────┐
│                      main.py (桌面入口)                      │
├─────────────────────────────────────────────────────────────┤
│  1. get_entry() → 检查前端开发模式                           │
│     - 开发模式：http://localhost:1420 (Vite Dev Server)      │
│     - 生产模式：frontend/dist/index.html (静态文件)          │
│  2. start_backend() → 启动 FastAPI 服务                       │
│     - 默认端口：1858                                         │
│     - 监听地址：0.0.0.0 (支持远程访问)                        │
│  3. webview.create_window() → 创建原生窗口                   │
│  4. webview.start() → 进入事件循环                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              server/main.py (FastAPI 应用)                   │
├─────────────────────────────────────────────────────────────┤
│  1. 加载中间件：                                              │
│     - BasicAuthMiddleware (Web 访问认证)                     │
│     - CORSMiddleware (跨域支持)                              │
│  2. 注册路由：                                                │
│     - /api/* → api_web.py 路由                               │
│     - /* → 静态文件 (frontend/dist)                          │
│  3. WebSocket 管理：                                          │
│     - /api/ws → 实时 AI 会话通信                              │
│     - ConnectionManager 管理连接池                            │
│  4. 事件桥接：                                                │
│     - crates.events → WebSocket 广播                          │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 认证机制

**BasicAuthMiddleware** 实现 Web 访问控制：

```python
class BasicAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 1. 允许 OPTIONS 预检请求
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # 2. 本地访问放行 (127.0.0.1, localhost)
        if client_host in ("127.0.0.1", "localhost"):
            return await call_next(request)
        
        # 3. 检查 Web 设置
        web_settings = self.get_web_settings()
        if not web_settings["enabled"]:
            return Response("Web access is disabled", status_code=403)
        
        # 4. Basic Auth 验证
        auth = request.headers.get("Authorization")
        if not auth or not auth.startswith("Basic "):
            return Response("Unauthorized", 
                status_code=401,
                headers={"WWW-Authenticate": "Basic realm=\"Login Required\""})
        
        # 5. 验证用户名密码 (使用 secrets.compare_digest 防止计时攻击)
        ...
```

**配置位置**: `ui_settings.json`
```json
{
  "webEnabled": false,
  "webRemoteAccess": false,
  "webUsername": "lizhuang",
  "webPassword": "lizhuang",
  "webPort": "1858"
}
```

### 4.3 API 路由设计

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/ws` | WebSocket | AI 会话实时通信 |
| `/api/start-session` | POST | 启动 AI 会话 |
| `/api/send-message` | POST | 发送消息 |
| `/api/process-statuses` | GET | 获取进程状态 |
| `/api/projects` | GET/POST | 项目管理 |
| `/api/read-file-content` | POST | 读取文件 |
| `/api/write-file-content` | POST | 写入文件 |
| `/api/list-directory` | POST | 列出目录 |
| `/api/version-*` | POST | 版本管理 |
| `/api/mcp/*` | POST | MCP 服务管理 |
| `/api/model-providers` | GET | 模型提供商配置 |
| `/api/save-env-config` | POST | 保存环境变量 |

### 4.4 WebSocket 通信协议

**连接建立**:
```typescript
// 前端连接
const ws = new WebSocket("ws://localhost:1858/api/ws");
```

**后端推送事件**:
```json
{
  "event": "process-status-changed",
  "payload": [...],
  "sequence": 1
}
```

**前端发送命令**:
```json
{
  "command": "start-session",
  "session_id": "1234567890",
  "working_directory": "/path/to/project",
  "model": "qwen-max",
  "backend": "qwen"
}
```

**事件类型**:
| 事件名 | 方向 | 用途 |
|--------|------|------|
| `process-status-changed` | 后端→前端 | 进程状态更新 |
| `acp-session-update-{id}` | 后端→前端 | AI 会话更新 |
| `start-session` | 前端→后端 | 启动会话 |
| `send-message` | 前端→后端 | 发送消息 |
| `kill-process` | 前端→后端 | 终止进程 |

---

## 5. 前端架构

### 5.1 组件层次结构

```
App.tsx (根组件)
├── CustomTitleBar (自定义标题栏)
├── AppSidebar (侧边栏)
│   └── ConversationList (会话列表)
├── AppHeader (顶部导航)
├── Routes
│   ├── HomeDashboard (主页/对话)
│   │   └── MessageInputBar (消息输入)
│   ├── ProjectsPage (项目列表)
│   └── ProjectDetailPage (项目详情)
├── DirectoryPanel (目录面板 - 右侧)
├── VersionPanel (版本面板 - 右侧)
├── SettingsDialog (设置对话框)
└── ConversationSearchDialog (搜索对话框)
```

### 5.2 Context 管理

| Context | 用途 |
|---------|------|
| `ConversationContext` | 会话状态管理 |
| `BackendContext` | 后端配置/状态 |
| `SettingsContext` | UI 设置 |
| `ApiConfig` | API 配置 |

### 5.3 自定义 Hooks

| Hook | 用途 |
|------|------|
| `useConversationManager` | 会话 CRUD |
| `useProcessManager` | 进程状态管理 |
| `useMessageHandler` | 消息处理 |
| `useToolCallConfirmation` | 工具调用确认 |
| `useConversationEvents` | 事件监听 |
| `useSessionProgress` | 会话进度 |
| `useResizable` | 可调整面板 |

### 5.4 运行模式检测

```typescript
// frontend/src/lib/runtime.ts
export const isPywebview = () => {
  return typeof window.pywebview === 'object';
};

// Vite 定义
define: {
  __WEB__: JSON.stringify(process.env.GEMINI_CLI_DESKTOP_WEB === "true")
}
```

---

## 6. 桌面模式 vs Web 模式

### 6.1 桌面模式 (PyWebview)

```
┌──────────────────────────────────────┐
│          原生窗口 (PyWebview)         │
│  ┌────────────────────────────────┐  │
│  │      React SPA (本地加载)       │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
              │ JS Bridge │
              ▼           │
┌──────────────────────────────────────┐
│         Api 类 (crates/backend/api.py)│
│  - 直接调用 Python 函数                │
│  - 访问本地文件系统                    │
│  - 调用原生 API (剪贴板/窗口控制)       │
└──────────────────────────────────────┘
```

**特点**:
- 通过 `webview.create_window(js_api=Api())` 暴露 Python API
- 前端调用 `window.pywebview.api.method_name()` 直接执行 Python 代码
- 支持原生功能：窗口控制、剪贴板、系统托盘等

### 6.2 Web 模式 (FastAPI)

```
┌──────────────────────────────────────┐
│            浏览器                     │
│  ┌────────────────────────────────┐  │
│  │     React SPA (HTTP 加载)       │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
         │ HTTP / WebSocket │
         ▼                  │
┌──────────────────────────────────────┐
│         FastAPI (server/main.py)     │
│  - REST API 端点                      │
│  - WebSocket 实时通信                 │
│  - 调用 crates 模块                   │
└──────────────────────────────────────┘
```

**特点**:
- 通过标准 HTTP/WebSocket 协议通信
- 支持远程访问 (需配置 `webRemoteAccess: true`)
- 使用 Basic Auth 认证
- 前端通过 `axios` 调用 API

### 6.3 代码适配层

**前端 API 封装** (`frontend/src/lib/api.ts`):
```typescript
// 自动检测运行环境
const api = __WEB__ 
  ? new WebApi()      // HTTP 调用
  : new PywebviewApi(); // JS Bridge 调用

// 统一接口
await api.start_session({...});
await api.read_file_content({...});
```

---

## 7. AI 会话管理

### 7.1 会话生命周期

```
1. 用户点击"新建对话"
       │
       ▼
2. 前端调用 /api/start-session
       │
       ▼
3. server/main.py → crates/session.start_session()
       │
       ▼
4. 创建子进程运行 AI CLI (qwen/gemini/llxprt)
       │
       ▼
5. 建立 WebSocket 连接，开始流式通信
       │
       ▼
6. AI 响应 → 事件桥接 → WebSocket 广播 → 前端更新
```

### 7.2 支持的 AI 后端

| 后端 | 配置位置 | 环境变量 |
|------|----------|----------|
| Qwen | `~/.qwen/settings.json` | `DASHSCOPE_API_KEY` |
| Gemini | 内部配置 | `GEMINI_API_KEY` |
| LLxprt | 内部配置 | `LLXPRT_API_KEY` |

**模型提供商配置** (`model_providers.json`):
```json
{
  "providers": [
    {
      "id": "openrouter",
      "name": "OpenRouter",
      "url": "https://openrouter.ai/api/v1",
      "env_key": "OPENROUTER_API_KEY",
      "models": [...]
    },
    {
      "id": "siliconflow",
      "name": "SiliconFlow (硅基流动)",
      "url": "https://api.siliconflow.cn/v1",
      "env_key": "SILICONFLOW_API_KEY",
      "models": [...]
    },
    {
      "id": "qwen",
      "name": "Qwen (DashScope)",
      "url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "env_key": "DASHSCOPE_API_KEY",
      "models": [...]
    }
  ]
}
```

---

## 8. 文件系统操作

### 8.1 核心模块 (`crates/filesystem.py`)

| 函数 | 功能 |
|------|------|
| `validate_directory(path)` | 验证目录合法性 |
| `list_directory_contents(path)` | 列出目录内容 |
| `read_file_content(path)` | 读取文件内容 |
| `write_file_content(path, content)` | 写入文件 |
| `read_binary_file_as_base64(path)` | 读取二进制文件 |
| `copy_files(paths, target)` | 复制文件 |
| `delete_path(path)` | 删除文件/目录 |
| `create_directory(path)` | 创建目录 |

### 8.2 文件预览支持

| 类型 | 处理方式 |
|------|----------|
| 文本/代码 | CodeMirror 高亮 |
| Markdown | React Markdown + Rehype |
| PDF | PDF.js + React PDF |
| Excel | XLSX 解析 |
| 图片 | 原生 `<img>` 标签 |

---

## 9. 版本/备份管理

### 9.1 核心功能 (`crates/backend/version_utils.py`)

| 功能 | API |
|------|-----|
| 初始化版本控制 | `POST /api/version-init` |
| 创建快照 | `POST /api/version-create` |
| 列出历史 | `POST /api/version-list` |
| 恢复版本 | `POST /api/version-restore` |
| 删除版本 | `POST /api/version-delete` |
| 排除路径配置 | `POST /api/save-excluded-paths` |

### 9.2 存储结构

```
<project_path>/.qwen_backup/
├── metadata.json      # 版本元数据
├── excluded.json      # 排除路径配置
└── versions/
    ├── <version_id_1>/
    ├── <version_id_2>/
    └── ...
```

---

## 10. MCP (Model Context Protocol) 支持

### 10.1 配置位置

`~/.qwen/settings.json`:
```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-xxx"],
      "enabled": true
    }
  },
  "disabledMcpServers": {...}
}
```

### 10.2 API 接口

| 接口 | 功能 |
|------|------|
| `GET /api/get-mcp-config` | 获取 MCP 配置 |
| `POST /api/save-mcp-config` | 保存 MCP 配置 |
| `POST /api/check-mcp-server` | 检查 MCP 服务器 |
| `POST /api/mcp/launch` | 启动 MCP 服务 |

---

## 11. 安全机制

### 11.1 Web 访问控制

1. **Basic Auth 认证**: 所有非本地请求需通过用户名密码验证
2. **远程访问开关**: `webRemoteAccess` 控制是否允许外部 IP
3. **计时攻击防护**: 使用 `secrets.compare_digest` 比较密码

### 11.2 CORS 配置

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # 允许所有源 (开发模式)
    allow_credentials=False,  # 不允许携带凭证
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 11.3 文件访问限制

- 所有路径操作需通过 `validate_directory()` 验证
- 禁止访问系统敏感目录
- 支持配置排除路径 (版本管理)

---

## 12. 开发模式

### 12.1 前端开发

```bash
cd frontend
pnpm install
pnpm dev  # 启动 Vite Dev Server (端口 1420)
```

### 12.2 后端开发

```bash
# 自动重载
python -m uvicorn server.main:app --reload --port 1858
```

### 12.3 桌面模式开发

```bash
# main.py 自动检测前端开发模式
export FRONTEND_DEV=1
python main.py
```

### 12.4 代理配置 (Vite)

```typescript
// vite.config.ts
proxy: {
  "/api": {
    target: "http://localhost:1858",
    changeOrigin: true,
  },
  "/api/ws": {
    target: "ws://localhost:1858",
    changeOrigin: true,
    ws: true,
  },
}
```

---

## 13. 构建与部署

### 13.1 前端构建

```bash
cd frontend
pnpm build  # 输出到 frontend/dist/
```

### 13.2 生产模式启动

```bash
# main.py 自动加载 frontend/dist/index.html
python main.py
```

### 13.3 Web 模式部署

```bash
# 启动 FastAPI 服务
python -m uvicorn server.main:app --host 0.0.0.0 --port 1858
```

---

## 14. 关键技术决策

| 决策 | 原因 |
|------|------|
| FastAPI 而非 Flask | 异步支持 + 自动文档 + 类型安全 |
| PyWebview 而非 Electron | 更小的包体积 + 原生体验 |
| React 18+ | 并发渲染 + 更好的性能 |
| Tailwind CSS | 原子化 CSS + 快速开发 |
| CodeMirror 6 | 模块化 + 更好的扩展性 |
| WebSocket 而非 SSE | 双向通信需求 |

---

## 15. 总结

QwenCode Desktop 的 Web 模式采用现代化的前后端分离架构：

- **后端**: FastAPI 提供 REST API + WebSocket 服务，通过 crates 模块复用桌面模式的核心逻辑
- **前端**: React + TypeScript + Vite 构建 SPA，通过统一的 API 层适配桌面/Web 两种模式
- **通信**: HTTP 用于 CRUD 操作，WebSocket 用于实时 AI 会话
- **安全**: Basic Auth + 远程访问控制 + CORS
- **扩展**: MCP 协议支持，可动态扩展 AI 工具调用能力

这种设计使得同一套代码可以同时支持桌面应用和 Web 部署，最大化代码复用率。
