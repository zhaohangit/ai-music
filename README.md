# AI Music Pro - AI音乐生成项目

智能音乐创作平台，集成Suno API和智谱GLM，支持AI音乐生成、歌词创作和翻唱功能。

## 功能特性

- 🎵 **AI音乐生成**：使用Suno API生成高质量音乐
- 📝 **智能歌词创作**：GLM-5驱动的歌词生成和润色
- 🎨 **现代UI设计**：玻璃态效果、渐变色彩、深色主题
- 🌍 **国际化支持**：支持中文、英文、日文、韩文
- 🔄 **多LLM支持**：支持JoyBuilder（内网）和智谱GLM（外网）

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- Redis（可选，用于任务队列）

### 安装

```bash
# 克隆项目
cd music-ai-project

# 安装所有依赖
npm run install:all

# 配置环境变量
cp backend/.env.example backend/.env
# 编辑 .env 文件，填入API密钥
```

### 开发

```bash
# 启动开发服务器（前后端同时启动）
npm run dev

# 或分别启动
npm run dev:backend  # 后端 :3000
npm run dev:frontend # 前端 :5173
```

### 测试

```bash
# 运行所有测试
npm test

# 分别测试
npm run test:backend
npm run test:frontend
```

### Docker部署

```bash
# 构建并启动
npm run docker:up

# 停止
npm run docker:down
```

## 项目结构

```
music-ai-project/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── config/         # 配置文件
│   │   ├── routes/         # API路由
│   │   ├── services/       # 业务服务
│   │   ├── middleware/     # 中间件
│   │   ├── types/          # 类型定义
│   │   └── utils/          # 工具函数
│   └── package.json
│
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── components/    # UI组件
│   │   ├── views/         # 页面
│   │   ├── i18n/          # 国际化
│   │   ├── services/      # API服务
│   │   └── styles/        # 样式
│   └── package.json
│
├── docs/                   # 文档
├── docker-compose.yml
└── package.json
```

## API文档

### 音乐生成

```bash
# 创建歌曲（灵感模式）
POST /api/music/create
{
  "mode": "inspiration",
  "prompt": "一首关于夏天的欢快歌曲"
}

# 创建歌曲（自定义模式）
POST /api/music/create
{
  "mode": "custom",
  "title": "城市微光",
  "lyrics": "...",
  "tags": "中文流行,电子"
}

# 查询生成状态
GET /api/music/status/:id
```

### 歌词生成

```bash
POST /api/lyrics/generate
{
  "idea": "写一首关于青春的歌词",
  "style": "流行",
  "mood": "温暖"
}
```

## 技术栈

- **后端**: Node.js + Express + TypeScript
- **前端**: React + Vite + TypeScript + Styled-Components
- **AI服务**: Suno API + 智谱GLM-5
- **缓存**: Redis
- **部署**: Docker + Docker Compose

## License

MIT
