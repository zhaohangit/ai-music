# MuseFlow AI 音乐创作平台

## MV 工作室（2026-09-30）

新增照片参考、12 个视频模型选项、可编辑动态分镜、单镜头生成与重试、歌词字幕、整曲合成和私有成片下载。使用 `npm run dev:mv` 启动本地 OrbStack 配置；完整运行要求与正式部署边界见 [MV 工作室说明](docs/mv-studio.md)。

Suno 当前目录补充 V6 / Wild / Mini、Max 模式、创造力增强，以及 MP3 / M4A / WAV 独立下载任务。本次接口更新见 [Suno 合同更新](docs/mxapi-suno-v2-contract.md#2026-09-29-contract-update)。

MuseFlow 是一套面向真实 SaaS 场景的 AI 音乐产品：它提供账号登录后的创作工作台、项目与作品库、双 Track 生成、任务中心、AI 歌词与提示词助手、余额/账单入口，以及可拆分部署的 API、Worker、PostgreSQL、Valkey 和私有对象存储。

MuseFlow 通过 ModelCross 网关接入 MXAPI Suno V2；账号、钱包、订阅、充值、不可变积分账本、模型授权、动作价格目录、Provider 路由和通用 AI 网关均由独立部署的 ModelCross 统一提供。永久 MXAPI/Suno 凭据只配置在 ModelCross Channel 或 ModelCross Secret Store。MuseFlow 每次操作只取得绑定用户、资源、动作、模型、最高费用和有效期的短时 task token；浏览器既不会获得 Provider 凭据，也不会获得 ModelCross Refresh Token。

> MuseFlow 不是 Suno 官方产品。使用 MXAPI、Suno、ModelCross 或模型输出前，请确认相应服务条款、数据合规要求、内容权利和可用额度。

## 当前安全默认值

仓库提供的 `.env.example` 是“可预览、不可产生真实费用”的本地配置：

- `AUTH_MODE=development`：使用明确标记的本地开发身份；生产环境会拒绝该模式；
- `BILLING_LIVE_ENABLED=false`：不会向 ModelCross 发起真实积分预占或结算；
- `AI_LIVE_ENABLED=false`：不会调用真实付费 AI 歌词/优化模型；
- `SUNO_API_KEY=`：不会启用仅供隔离 Fake Provider 测试的直连路径；
- PostgreSQL、Valkey、RustFS 和 MuseFlow 端口只绑定 `127.0.0.1`；
- RustFS Bucket 默认私有，不提供匿名读权限。

三个真实调用开关的语义不能混用：

- `BILLING_LIVE_ENABLED=false` 表示只允许价格预览，不是“先生成、以后再补扣费”；除显式启用的本地 Fake Provider 测试外，音乐 Provider mutation 必须被禁止；
- `AI_LIVE_ENABLED=false` 表示 AI 助手真实调用被禁止；服务端同时要求真实 AI 必须配合 `BILLING_LIVE_ENABLED=true`；
- `BILLING_LIVE_ENABLED=true` 时，MuseFlow 固定通过 ModelCross Suno V2 网关调用 Provider；ModelCross 网关、Work Billing 或 MXAPI 凭据任一未配置，设置页应显示 `managedBy: modelcross` / `providerConfigured: false`，`/health/ready` 返回 503，而 `/health/live` 仍可返回 200。

生产启动还会拒绝明显的默认/示例 Secret，不能通过仅把 `NODE_ENV` 改为 `production` 就把 `.env.example` 用于公网。

不要为了让冒烟测试变绿而打开上述开关。应先在 staging 完成计费幂等、崩溃恢复、部分成功、退款和跨用户隔离测试，再逐项启用真实能力。

## 能力概览

- 可真实鼠标/触摸滚动的公开 Landing Page、Sticky Header、阅读进度、区块导航、登录后应用 Shell、深浅主题和移动端布局；
- 灵感模式、自定义歌词模式、纯音乐、风格/排除风格、声线与模型能力参数；
- MXAPI 一次上游请求返回两个任务；创作台可选择在 MuseFlow 中保留 1 首或 2 首，两个 Provider 任务仍分别跟踪 `task_id`、`custom_id`、素材和计费结果；
- Extend、Cover、Remaster 派生操作与来源关系；Extend/Cover 可覆盖目标模型与全部生成参数，并在服务端重新授权和校验；
- 项目、作品库、任务中心、播放器、搜索、筛选、删除与私有素材 Range 播放；
- AI 歌词生成、续写、改写、翻译、标题、风格和 Prompt 优化；
- AI 原文与建议分离，只有用户明确接受后才写入创作内容；
- OIDC Authorization Code + PKCE、HttpOnly 不透明 Session、多用户资源隔离；
- Session Refresh Token 轮换使用数据库行锁串行化，并在刷新后重新同步 UserInfo 角色；
- 用户级本地创作草稿只在身份确认后加载，退出或切换账号时清空内存，旧全局草稿不会跨用户迁移；
- 积分 quote/reserve/capture/release/refund 幂等流程和定时对账；
- 数据库级 API 限流、用户级音乐/AI 并发上限，以及可跨进程恢复的 `reserve_pending` 计费状态；
- Transactional Outbox 以 lease + `SKIP LOCKED` 并发领取、指数退避和确认状态可靠派发事件；
- PostgreSQL 业务权威数据、BullMQ 任务、Redis SSE 事件、S3/RustFS 私有对象；
- API 与 Worker 独立角色、存活/就绪探针、Prometheus 指标和优雅停机。

## 页面滚动与交互约定

首页无法滑动不是产品设计。应用根节点为了让工作台保持固定视口，使用了 `height: 100%` 和 `body { overflow: hidden; }`；因此 Landing Page 必须自己形成 `height: 100%; overflow-y: auto` 的滚动容器，不能只设置 `min-height`。当前的结构是：

- Landing Page 独立纵向滚动，Header 粘滞在容器顶部，阅读进度和当前区块随滚动更新；
- 锚点采用平滑滚动，Logo 和页脚支持回顶，并遵循 `prefers-reduced-motion`；
- 移动导航支持键盘焦点、Escape 关闭和焦点恢复；
- 工作台保持固定视口，只让主内容、列表和弹窗在各自边界内滚动；
- 390px 宽度下创作参数改为纵向重排，页面不应出现横向滚动。

因此验收首页时要检查 Landing 容器的 `scrollTop`，而不是只检查会保持为 0 的 `window.scrollY`。

## 系统边界

```text
浏览器
  │ 仅持有 MuseFlow HttpOnly Session；同源 /api
  ▼
MuseFlow API ───────────────► ModelCross（独立部署）
  │                             ├─ OIDC / 用户与用户组
  │                             ├─ 钱包、订阅、充值、账单
  │                             ├─ 不可变积分账本与价格版本
  │                             ├─ 受限 Worker task token
  │                             ├─ Suno V2 网关与永久 MXAPI Key
  │                             └─ 通用 AI /v1/responses
  │
  ├─ PostgreSQL 16：音乐域、Session、幂等、Outbox、计费镜像
  ├─ Valkey：BullMQ、锁、缓存、跨进程 SSE
  ├─ S3 / RustFS：私有音频、封面、视频
  └─ MuseFlow Worker：用短时 task token 轮询、入库、素材下载与结算
                                │
                                ▼
                         MXAPI Suno V2
```

职责必须保持唯一：

| 领域 | 唯一权威 | MuseFlow 的职责 |
|---|---|---|
| 身份与账号 | ModelCross | 保存 OIDC `iss + sub` 映射和应用 Session |
| 余额、充值、订阅 | ModelCross | 展示只读摘要并跳转 ModelCross |
| 价格与积分账本 | ModelCross | 发起幂等计费操作，保存操作镜像用于对账 |
| 音乐项目、Track、派生关系 | MuseFlow PostgreSQL | 完整业务生命周期与 owner 隔离 |
| 队列、锁、SSE | Valkey | 临时协调；不得作为账本或任务最终状态 |
| 音频、封面、视频 | 私有 S3/RustFS | 对象 Key、校验和、Range 与删除 tombstone |
| MXAPI Provider Key | ModelCross Channel / Secret Store | MuseFlow 和浏览器都不可读；ModelCross 网关只在转发时注入 |

ModelCross 为独立项目和独立服务。不要把 ModelCross 的 AGPL UI 或服务源码复制进 MuseFlow；两者通过 OIDC 和 HTTP 契约集成。

## 一键启动安全本地栈

### 环境要求

- Docker Engine 24+ 和 Docker Compose v2；
- 如需源码开发：Node.js 20.19+、npm 10+；
- 默认端口：MuseFlow `8787`、PostgreSQL `5432`、Valkey `6379`、RustFS S3 API `9000`、兼容控制台端口 `9001`。

### 启动

```bash
cd "/Users/zhaohan25/Documents/my-code/ai-music"
cp .env.example .env
docker compose up --build -d
docker compose ps
```

打开 [http://127.0.0.1:8787](http://127.0.0.1:8787)。本地默认使用开发身份，可以浏览完整产品页面；因为真实计费、AI 和 MXAPI Key 都未启用，不会消耗真实积分。

检查运行状态：

```bash
curl --fail http://127.0.0.1:8787/health/live
curl --include http://127.0.0.1:8787/health/ready
docker compose logs --tail=100 museflow-api museflow-worker
```

`/health/live` 表示进程存活。`/health/ready` 同时检查数据库、队列、事件总线、对象存储和 ModelCross Provider 网关；安全默认配置返回 `503 not_ready` 是预期状态，不代表页面打不开。

停止服务但保留数据：

```bash
docker compose down
```

不要在仍需数据时执行 `docker compose down --volumes`；该参数会删除 PostgreSQL、Valkey 和 RustFS 的命名卷。

### Compose 服务

| 服务 | 用途 | 持久化/健康检查 |
|---|---|---|
| `postgres` | PostgreSQL 16 业务数据库 | `postgres-data`、`pg_isready` |
| `valkey` | BullMQ、事件与缓存 | AOF、`valkey-data`、`valkey-cli ping` |
| `minio` | 本地私有 S3（RustFS，保留服务名兼容性） | `minio-data`、RustFS live probe |
| `minio-init` | 幂等创建私有 Bucket | 成功后退出 0 |
| `museflow-api` | HTTP API、OIDC BFF、SSE、前端静态文件 | `/health/live` |
| `museflow-worker` | Provider 轮询、素材入库、结算与对账 | 进程及依赖连接 |

API 与 Worker 使用同一不可变镜像，通过 `RUNTIME_ROLE=api|worker|all` 选择角色。需要增加 Worker 吞吐时可在确认 Provider 限流和数据库连接池容量后执行：

```bash
docker compose up -d --scale museflow-worker=3
```

## ModelCross 独立部署与 OIDC 契约

ModelCross 不在本 Compose 中启动。生产环境应独立部署、独立升级、独立备份，并使用一个浏览器和 MuseFlow 容器都能访问的规范 HTTPS Issuer。

### 注册 MuseFlow OIDC Client

在 ModelCross 管理端注册机密客户端，最小配置如下：

| 配置 | 建议值 |
|---|---|
| Client ID | `museflow` |
| Product Key | `museflow` |
| Redirect URI | `https://music.example.com/api/auth/callback` |
| Grant Types | `authorization_code`, `refresh_token` |
| Response Types | `code` |
| PKCE | 必须，`S256` |
| Scopes | `openid profile email modelcross.work modelcross.work.billing` |

MuseFlow 使用 Discovery、JWKS、Authorization Code + PKCE、`state`、`nonce` 和后端 Client Secret。ModelCross ID Token 至少应提供标准 `iss`、`sub`、`aud`，并建议提供 `azp`、`product_key`、`email`、`email_verified`、`name`、`picture`、`roles`。`sub` 是 MuseFlow 所有资源隔离的稳定主键；不要使用邮箱作为 owner ID。

ModelCross 需要向 MuseFlow 暴露以下契约：

| 能力 | 方法与路径 |
|---|---|
| OIDC Discovery | `GET /.well-known/openid-configuration` |
| Authorization / Token / UserInfo / JWKS | 由 Discovery 返回的标准端点 |
| 账号、余额、订阅与可用/预占积分摘要 | `GET /api/work/v2/account` |
| 当前账户授权的模型 | `GET /v1/models` |
| 受限任务凭证 | `POST /api/work/v1/task-token` |
| 当前产品计费目录 | `GET /api/work/v1/billing/catalog` |
| 计费报价 | `POST /api/work/v1/billing/quote` |
| 预占积分 | `POST /api/work/v1/billing/reserve` |
| 按 owner/resource/幂等键恢复预占操作 | `GET /api/work/v1/billing/operations/lookup?resource_id=...` |
| 查询计费操作 | `GET /api/work/v1/billing/operations/:operation_id` |
| 成功/部分成功结算 | `POST /api/work/v1/billing/operations/:operation_id/capture` |
| 失败释放 | `POST /api/work/v1/billing/operations/:operation_id/release` |
| 退款/冲正 | `POST /api/work/v1/billing/operations/:operation_id/refund` |
| AI 歌词与优化 | `POST /v1/responses` |

所有计费写请求必须携带稳定的 `Idempotency-Key`。Capture 请求只提交服务端可验证的 `successful_items`，绝不提交客户端计算的金额；金额、价格版本、用户组倍率和可扣余额必须由 ModelCross 根据 product/operation/group 的服务端目录决定，不能相信浏览器或 MuseFlow 自报金额。

ModelCross 的模型授权是 owner-scoped 强边界。MuseFlow 默认适配器定义 8 个 Suno 模型，但 OIDC 用户在工作台实际看到的列表始终是“ModelCross `/v1/models` 返回的授权 ID”与“MuseFlow 本地适配器能力”的交集。目录读取失败时不会降级为暴露全部模型；Extend/Cover 更换目标模型时也会重新执行这个授权检查。

### ModelCross 动作价格目录

当前联调合同包含 34 个固定价 `operation_code`：15 个音乐、3 个歌词/Prompt AI 辅助，以及 16 个绘画、商品套图和 Veo 固定价能力。下表不是写死在浏览器的售价；实际可用性、价格版本、积分、用户组倍率和 `charging_enabled` 每次都以 ModelCross 动态目录为准。ModelCross 的本地部署工具会读取 MXAPI 的公开 `channel-points` 快照，按 `ceil(provider_points × MUSEFLOW_UPSTREAM_COST_MULTIPLIER)` 生成目录，默认倍率为 4，版权音频额外增加 15 provider points。生产价格必须由 ModelCross 运营目录明确发布。

| 类型 | `operation_code` | 当前预计积分 | 输出数/语义 |
|---|---|---:|---|
| 音乐 | `generation_pair` | 320 | 双版本生成，2 Tracks；MXAPI 80 × 4 |
| 音乐 | `sound_pair` | 60 | 双版本音效，2 Tracks；MXAPI 15 × 4 |
| 音乐 | `extend_pair` | 320 | 续写，2 Tracks |
| 音乐 | `cover_pair` | 320 | 翻唱，2 Tracks |
| 音乐 | `remaster_pair` | 320 | 高清重制，2 Tracks；MXAPI 80 × 4 |
| 音乐 | `upload_single` | 4 | 普通参考音频上传，1 项 |
| 音乐 | `upload_copyright_single` | 64 | 版权参考音频上传，(1 + 15) × 4 |
| 音乐 | `upload_extend_pair` | 324 | 上传 + 生成，(1 + 80) × 4 |
| 音乐 | `upload_copyright_extend_pair` | 384 | 版权上传 + 生成，(1 + 15 + 80) × 4 |
| 音乐 | `whole_song_single` | 4 | 获取整首歌，1 Track |
| 音乐 | `crop_single` | 4 | 裁剪，1 Track |
| 音乐 | `speed_single` | 4 | 变速，1 Track |
| 音乐 | `aligned_lyrics_single` | 4 | 歌词时间轴资产 |
| 音乐 | `video_single` | 4 | 音乐视频资产 |
| 音乐 | `convert_wav_single` | 4 | WAV 资产 |
| AI | `lyrics_generate` | 2 | 歌词生成 |
| AI | `lyrics_rewrite` | 1 | 歌词续写/改写/翻译 |
| AI | `prompt_optimize` | 1 | 标题/风格/Prompt 优化 |

固定价非音乐目录同样由 `channel-points × 4` 生成：Nano 标准 24、Nano Pro V2 80、Nano 2 80、Nano 2 Lite 60、GPT Image 2 40、即梦 4.0/4.5/5.0 分别 64/72/100，商品卖点/策划/套图分别 12/12/88，Veo2 Fast/Veo3 Fast/Quality/Economy 分别 80/160/720/200 credits。`point_cost=0` 的 Seedance、Grok、即梦视频和 Veo 统一接口不是免费能力，而是按通道、模型、token、分辨率和时长动态计费；必须在 ModelCross 服务端形成请求级报价后才能预扣、执行和结算。

`/api/catalog/mxapi-capabilities` 返回 NANO、GPT、即梦、Seedance、Grok、Veo、商品套图和系统通用接口的浏览器安全合同，包括原始入参名、结果字段、Provider identifier、ModelCross `operation_code`、价格版本与执行状态。Suno 和管理员诊断已接入；本地 MV 工作室通过服务端视频适配器执行 Seedance、即梦、Grok 和 Veo 任务。正式多用户媒体执行仍需 ModelCross 的授权、报价和结算支持，浏览器不会直接调用 MXAPI。

前端通过 MuseFlow 的 `/api/catalog/music-operations` 和 `/api/catalog/ai-operations` 读取动态参数、价格和可执行状态。“有目录项”不等于“可执行”：真实音乐操作还需 Provider 已配置并通过鉴权、ModelCross 项已开放真实扣费且 `BILLING_LIVE_ENABLED=true`；真实 AI 还需 `AI_LIVE_ENABLED=true` 及目标 AI 模型已授权。

### 生产 OIDC 配置

至少修改 `.env` 中以下值：

```dotenv
NODE_ENV=production
AUTH_MODE=oidc
PUBLIC_URL=https://music.example.com
MUSEFLOW_SESSION_SECRET=使用密钥管理系统生成的至少32字符随机值

MODELCROSS_OIDC_ISSUER=https://account.example.com
MODELCROSS_OIDC_CLIENT_ID=museflow
MODELCROSS_OIDC_CLIENT_SECRET=OIDC客户端密钥
MODELCROSS_OIDC_REDIRECT_URI=https://music.example.com/api/auth/callback
MODELCROSS_BASE_URL=https://account.example.com
MODELCROSS_ACCOUNT_URL=https://account.example.com/profile
MODELCROSS_WALLET_URL=https://account.example.com/wallet
MODELCROSS_ORDERS_URL=https://account.example.com/usage-logs
MODELCROSS_TASK_TOKEN_SECRET=ModelCross与MuseFlow服务端约定的高熵密钥
MODELCROSS_AI_RELAY_TOKEN=仅用于ModelCross通用AI网关的部署级凭据
```

OIDC Issuer 必须与 Discovery 返回值和 JWT `iss` 完全一致。生产配置拒绝 `AUTH_MODE=development`，并要求 Session Secret 长度至少 32 字符。

生产配置加载器会对以下凭据做 fail-closed 检查：

- `MUSEFLOW_SESSION_SECRET` 和 `MODELCROSS_OIDC_CLIENT_SECRET`；
- 已配置的 `MODELCROSS_TASK_TOKEN_SECRET`、`MODELCROSS_AI_RELAY_TOKEN` 和 `S3_SECRET_ACCESS_KEY`；
- `DATABASE_URL` 中的数据库密码。

上述值中只要包含 `change-me`、`default`、`example`、`placeholder`、`sample` 等明显占位标记，或使用 `development-only-secret`，生产进程就会拒绝启动。这包括 Compose 默认数据库密码 `museflow-local-change-me`；不要依赖“容器只在内网”而保留它。

### Token 与密钥边界

- 生产浏览器只收到 `HttpOnly`、`Secure`、`SameSite=Lax` 的 MuseFlow Session Cookie；本地 HTTP 开发不会设置 `Secure`；
- OIDC Access/Refresh Token 只以 AES-256-GCM 密文保存在 MuseFlow Session 数据中；
- Refresh Token 不返回浏览器，也不写入 `localStorage`；
- Worker 使用短时、受限 task token，限制 `resource_id`、operations、models、`max_cost`、幂等键和 TTL；
- ModelCross Work Billing 的 Reserve/Capture/Release 只使用用户绑定的短时 task token；`/v1/responses` 只使用独立的部署级 `MODELCROSS_AI_RELAY_TOKEN`，两类凭据不得互换；
- `MODELCROSS_OIDC_CLIENT_SECRET`、`MODELCROSS_TASK_TOKEN_SECRET`、`MODELCROSS_AI_RELAY_TOKEN`、数据库密码和 S3 Secret 只存在于服务端 Secret Store；永久 MXAPI Key 只存在于 ModelCross；
- 任何上述密钥都不得使用 `VITE_*` 前缀、写入前端源码、镜像层、日志或截图；
- 普通用户设置页只显示 ModelCross 托管状态和只读健康结果，返回 `managedBy: modelcross`；更改设置的 API 会返回 403，不提供编辑 Provider Key 的入口。

`MODELCROSS_TASK_TOKEN_SECRET` 必须与 ModelCross 的 `WORK_TASK_TOKEN_SECRET` 匹配，仅用于服务间签发受限 task token 和读取不含余额/密钥的网关状态。它不是 MXAPI Key。ModelCross 可用 `WORK_SUNO_V2_CHANNEL_ID` 选择全局 Suno Channel，或从只读 Secret File 注入永久 Key；该永久凭据不会返回 MuseFlow。

## 计费与充值

MuseFlow 本身不接收支付回调、不保存银行卡/支付凭证，也不维护第二份可扣余额。账户中心、充值页面、支付订单和钱包均由 ModelCross 提供，MuseFlow 只展示余额摘要与跳转链接。`MODELCROSS_ACCOUNT_URL` 未配置时，应用默认使用 `${MODELCROSS_BASE_URL}/profile`；Compose 的本地默认值使用浏览器、Discovery 与 JWT 共用的 canonical `http://modelcross.localhost:3000/profile`。`MODELCROSS_ACCOUNT_URL`、`MODELCROSS_WALLET_URL` 和 `MODELCROSS_ORDERS_URL` 都是浏览器跳转地址，不能填写仅容器内部可解析的主机名。

### MXAPI 成本到 ModelCross 售价

ModelCross 是用户售价和账单的唯一权威。部署侧可运行
`/Users/zhaohan25/Documents/my-code/ModelCross/deploy/local-work/sync-museflow-pricing.sh`
读取 MXAPI 公共 `channel-points`，按 `MUSEFLOW_UPSTREAM_COST_MULTIPLIER`（默认 4）
和版权音频 surcharge 生成 `WORK_BILLING_CATALOG_FILE`。当前快照下，双版本音乐/Remaster
为 320 credits，双音效为 60 credits，普通单项后处理为 4 credits；上传续作按上传和生成
两段成本相加。MXAPI 商户 points 只用于 Provider 成本对账，不会进入用户钱包。

一次音乐操作的推荐时序（Quote → Reserve → Capture/Release → Reconcile）：

```text
1. MuseFlow 创建 generation intent 和稳定幂等键
2. ModelCross 根据 product、operation_code 和 price_version 报价；当前音乐结算按动作统一计价，不把本地模型展示价冒充模型差异化账单
3. MuseFlow 先持久化加密任务凭证与 `reserve_pending`，再调用 ModelCross reserve；余额不足时停止，不提交 Provider
4. 若 reserve 成功后进程在本地 Operation ID 落库前崩溃，Worker 通过 owner/resource/原始幂等键 lookup 恢复远端操作
5. MuseFlow 取得持久提交权后至多一次提交 Provider，并把 task_id、Track 和 accepted 状态原子落库；任何“可能已提交但未确认”的窗口进入 manual_review_required，不自动重提或 release
6. Worker 持久化每个 Track、custom_id 和素材
7. 全成功：capture；全失败：release；部分成功：按价格策略 capture
8. 超时或进程崩溃：标记 reconcile_required，后台通过 lookup/查询远端 Operation 并幂等补做 capture/release；异常远端终态进入人工复核
9. 账本结果镜像到 MuseFlow，用于展示和人工对账，不作为余额权威；音乐与 AI 镜像使用独立幂等命名空间
```

Reconcile 是 MuseFlow 使用 ModelCross 的 lookup、operation query、capture、release/refund 契约编排出的恢复流程，不应假定 ModelCross 存在一个没有在契约中声明的单一 `/reconcile` 端点。管理员可以调用 MuseFlow `POST /api/admin/reconcile` 把计费、存储和轮询对账任务加入队列。

上线真实扣费前必须全部满足：

1. 双击、网络重试和 API 重启不会重复提交或重复扣费；
2. reserve 后崩溃能够恢复并 release/capture；
3. Provider task 已持久化后，轮询和对象存储失败能够安全恢复；Provider 接受结果未能确认落库时必须隔离人工复核，不能自动重提；
4. 双 Track 全成功、全失败、部分失败都有明确价格策略；
5. capture/release/refund 重放返回同一结果；
6. Redis 或 Worker 重启不会丢失 SQL 中的最终状态；
7. staging 对账零差异，告警和人工 reconcile 已演练；
8. 最后才将 `BILLING_LIVE_ENABLED=true`，并先小流量观察。

## MXAPI / Suno V2

真实音乐生成在 ModelCross 侧配置，MuseFlow 不保存永久 Provider Key：

```dotenv
# MuseFlow
BILLING_LIVE_ENABLED=true
MODELCROSS_BASE_URL=https://modelcross.example.com
MODELCROSS_TASK_TOKEN_SECRET=与ModelCross的WORK_TASK_TOKEN_SECRET相同
SUNO_POLL_INTERVAL_MS=5000
SUNO_REQUEST_TIMEOUT_MS=30000

# ModelCross
WORK_BILLING_ENABLED=true
WORK_SUNO_V2_GATEWAY_ENABLED=true
WORK_SUNO_V2_CHANNEL_ID=已配置的SunoAPI渠道ID
# 或使用 WORK_SUNO_V2_API_KEY_FILE=/run/secrets/mxapi-suno-key
WORK_SUNO_V2_BASE_URL=https://open.mxapi.org
```

MuseFlow 的 `SUNO_API_BASE_URL` / `SUNO_API_KEY` 只供 `BILLING_LIVE_ENABLED=false` 的隔离 Fake Provider 测试使用；真实计费开启后会被忽略，所有提交和查询固定走 ModelCross。不要为了将 readiness 从 503 变成 200 而临时填入真实密钥或打开实扣。

关键 ID 不可混用：

- MuseFlow Track ID：本产品内部资源 ID；
- MXAPI `task_id`：查询异步任务；
- Suno `custom_id`：Extend、Cover、Remaster 的源歌曲 ID。

MXAPI 一次生成会产生两个独立 `task_id`；创作台可选择只保留一个结果或保留两首。Worker 仍必须通过上游结果精确绑定对应 `custom_id`，不能按数组位置猜测；选择一首不会改变 MXAPI 的双任务上游成本。

默认模型目录使用 MXAPI 模型 ID 作为稳定值，使用用户可读名称作为展示值。其中 `chirp-auk-turbo` 的正确展示名称是 **Suno V4.5 All**，不应显示成 Turbo。V3 和 V3.5 仍保留用于旧项目复现，不要因为新模型上线就从 Provider 适配器中删除。

### 生成与派生参数

生成请求已覆盖 MXAPI Suno V2 中与该产品相关的参数：

- 模型 `mv`、标题 `title`、纯音乐 `make_instrumental`；
- 灵感模式 `gpt_description_prompt`，或自定义模式 `prompt` + `tags`；
- `negative_tags`、`metadata.vocal_gender`、`metadata.control_sliders.style_weight` 和 `metadata.control_sliders.weirdness_constraint`；
- V4.5+ 将灵感/自定义模式明确映射为 `metadata.create_mode=simple|custom`，旧模型完全省略高级 metadata；
- Extend 的 `task=extend`、`continue_clip_id`、`continue_at`，Cover 的 `task=cover`、`cover_clip_id`；
- 上传续作的 `task=upload_extend`，以及上传来源 Extend/Cover 的 `metadata.control_sliders.audio_weight`；`metadata.can_control_sliders` 始终由服务端按实际发送的滑杆同步生成，不作为独立 UI 输入。

音效不是歌曲 Generate 的一组高级选项，而是独立的 `POST /api/v2/music/sound` 合同：`title` 与 `tags` 必填，模型 `mv` 仅允许 `chirp-crow` / `chirp-fenix`，`tempo`、`key`、`loop` 可选，并固定返回两个独立任务。MXAPI 没有公布 BPM 范围或调性枚举，因此 MuseFlow 不会虚构这些限制；UI 的循环开关默认开启只是明确标注的产品推荐值，服务端仍保留字段省略语义。

Extend/Cover 不再只复用来源 Track 参数。`/api/catalog/music-operations` 会在这两个动作的 `generationOverrides` 中公布可覆盖字段，客户端可选覆盖以下完整集合：

```text
model, mode, title, description, style, lyrics, instrumental,
negativeTags, vocalGender, styleWeight, weirdness
```

服务端先将覆盖值与来源 Track 合并，再按目标模型的动态 capability 重新检查：

1. 目标模型必须存在、已启用、支持该动作，并在当前 ModelCross 账户的授权列表中；
2. `mode`、纯音乐与必填字段组合必须合法；
3. 标题、描述、风格、歌词和排除标签的长度，以及声线/滑杆范围，必须符合目标模型；
4. 目标模型和全部覆盖参数都纳入幂等摘要，相同 `Idempotency-Key` 搭配不同参数会返回冲突；
5. Extend 的 `continueAt` 不能超过已知 Track 时长；`continueAt` 不能用于 Cover/Remaster。

Remaster 的变化程度枚举为 `subtle | normal | high`。生成模型会显式映射到 Remaster 专用 Wire 模型：V4 → `chirp-up`、V4.5 家族 → `chirp-bass`、V5 → `chirp-carp`、V5.5 → `chirp-flounder`。V3/V3.5 没有公开映射，能力目录必须关闭 Remaster，服务端也会 fail closed，绝不能默认伪装成 V4。2026-08-26 复核的 MXAPI 专用 Remaster 文档已明确 `chirp-flounder` 对应 V5.5，且 `variation_category` 适用于 V5 及以上；Remaster 不接受 Generate 覆盖字段。

Aligned Lyrics 的 `lyrics` 不使用页面硬编码常量，而从 `/api/catalog/music-operations` 读取 `minLength: 1` / `maxLength: 5000`；超过当前动态上限时客户端应禁用提交，服务端仍做最终校验。

MuseFlow 的 Provider Client 已覆盖 MXAPI 当前公开的全部 V2 音乐端点。面向用户开放与底层客户端支持是两个不同层级：只有具备 ModelCross 服务端价格、幂等预占/结算、SQL 任务状态和私有资产落盘的动作才会出现在产品 API 中。

| MXAPI V2 能力 | 文档请求字段 | Provider Client | 当前产品 API |
|---|---|---|---|
| 双版本生成 | `mv`、`title`、`make_instrumental`、`gpt_description_prompt` 或 `prompt` + `tags`、`negative_tags`、`metadata` | `generate` | 已开放 |
| 双版本音效 | `title`、`tags`、`mv`，可选 `tempo`、`key`、`loop` | `sound` | 已开放；独立 `sound_pair` 动态计费 |
| 延长 / 上传音频延长 | `task=extend` / `task=upload_extend`、`continue_clip_id`、`continue_at`；V4.5+ 上传延长可带 `metadata.control_sliders.audio_weight` | `generate` | 已开放；上传延长按普通/版权音频分别动态计费，V4/V3.5/V3 保留续作但完全省略 `audio_weight` |
| 翻唱 | `task=cover`、`cover_clip_id`；上传来源可带 `metadata.control_sliders.audio_weight` | `generate` | 已开放；仅保留中的上传来源显示音频参考度 |
| 单个 / 批量任务查询 | `id`；`ids,page,size` | `task` / `tasks` | 已由 Worker 使用 |
| 上传参考音频 | `audio_url`、`copyrightAudio` | `uploadAudio` | 已开放；强制权利声明、私有暂存、可信时长与普通/版权价格分离 |
| 获取整首歌 | `clip_id` | `wholeSong` | 已开放；单任务计费与派生关系持久化 |
| 歌词时间戳 | `lyrics`、`suno_id` | `alignedLyrics` | 已开放；动态 1–5000 字校验、异步作业、私有时间轴资产与同源下载 |
| Remaster | `clip_id`、专用 `model_name`，V5/V5.5 可选 `variation_category` | `remaster` | V4+ 开放；V3/V3.5 fail closed |
| 音乐视频 | 数字记录 `task_id`、`suno_id` | `musicVideo` | 已开放；流式下载到私有对象存储 |
| WAV 转换 | 数字记录 `task_id`、`suno_id` | `convertWav` | 已开放；流式下载到私有对象存储 |
| 裁剪 | `clip_id`、`crop_start_s`、`crop_end_s` | `crop` | 已开放；服务端校验时间范围与派生关系 |
| 变速 | `clip_id`、`speed_multiplier`、`keep_pitch`，可选 `title` | `speed` | 已开放；倍率只接受文档枚举 `0.25 / 0.5 / 0.75 / 1 / 1.25 / 1.5 / 2`，标题留空时 Wire 完全省略该字段 |

查询结果中的 MXAPI 数字数据库记录 `data.id`、异步 `task_id` 和 Suno `custom_id` 均为不同标识。Provider Client 会分别保留 `providerRecordId`、`taskId` 和 `customId`；音乐视频和 WAV 接口明确要求前者，不能拿字符串任务 ID 代替。歌词时间戳、音乐视频与 WAV 的 `result.extend` 也不是生成歌曲的数组结构，已分别规范化为时间轴、`videoUrl` 和 `wavUrl`。

Provider 余额检查按实时 V2 API Test 使用 `GET /api/v2/points/balance`；管理员诊断还可读取分页 `GET /api/v2/points/logs?page=1&pageSize=20`（`pageSize` 最大 100）。这些余额、日志以及任务返回的 `points_cost / points_refunded` 都属于 MXAPI 部署商户成本，只能用于管理员诊断与 Provider 对账；它们不会通过普通 Track API 投影到浏览器，更不能出现在作品卡、用户钱包、扣费或退款状态中。用户侧唯一权威口径是 ModelCross 的批次 `estimated_credits`、账单镜像 `settled_credits` 和 `billing_status`。

Provider 返回的素材 URL 会经过协议、端口、单次 DNS 解析/IP 固定、大小、MIME 与 checksum 校验；禁止凭据、重定向、内网/Metadata/转换地址和 DNS rebinding。生产环境必须配置精确的 `ASSET_HOST_ALLOWLIST`，且只允许 HTTP/HTTPS 默认端口；不要通过放开任意私网或任意端口绕过校验。

## 对象存储

本地 Compose 使用 RustFS；生产可替换为 AWS S3、Cloudflare R2、阿里云 OSS 的 S3 兼容端点或其他兼容服务：

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=https://your-s3-compatible-endpoint.example.com
S3_REGION=auto
S3_BUCKET=museflow-production
S3_ACCESS_KEY_ID=从SecretStore注入
S3_SECRET_ACCESS_KEY=从SecretStore注入
S3_FORCE_PATH_STYLE=false
SIGNED_URL_TTL_SECONDS=300
ALLOW_PRIVATE_ASSET_URLS=false
ASSET_HOST_ALLOWLIST=cdn1.example.com,cdn2.example.com

# 使用仓库 docker-compose.yml 时，通过以下 Compose-only 变量把容器
# 从内置 RustFS 切换到上述外部存储：
MUSEFLOW_S3_ENDPOINT=https://your-s3-compatible-endpoint.example.com
MUSEFLOW_S3_ACCESS_KEY_ID=从SecretStore注入
MUSEFLOW_S3_SECRET_ACCESS_KEY=从SecretStore注入
```

Bucket 必须保持私有。客户端下载应通过 MuseFlow owner 校验后的同源接口或短时签名 URL；不得把 Bucket 改成 public。删除 Track 会先写数据库 tombstone，再由 Worker 幂等删除对象，避免数据库事务和对象存储之间出现不可恢复的不一致。

## 源码开发

安装锁定依赖：

```bash
cd "/Users/zhaohan25/Documents/my-code/ai-music"
npm ci
```

只启动依赖容器，再运行 API + Worker 合并角色和 Vite：

```bash
cp .env.example .env
docker compose up -d postgres valkey minio minio-init
npm run dev
```

开发前端默认位于 [http://127.0.0.1:5173](http://127.0.0.1:5173)，并将 `/api` 代理到 `8787`。生产构建由 Express 同源提供 `web/dist`。

使用本地 Fake MXAPI 验证双 Track 流程，不会调用真实 Provider：

```bash
docker compose up -d postgres valkey minio minio-init
npm run dev:fake
```

如果只需要兼容旧的本地 JSON 运行方式，可显式设置 `PLATFORM_MODE=false`；该模式不包含 SaaS 账号、跨进程队列、集中计费或云对象存储，不应部署到公网。

## 自动化测试与交付门禁

完整本地质量门禁：

```bash
./scripts/verify-delivery.sh quality
```

该脚本会使用独立 Compose project 和 Docker 随机回环端口启动临时 PostgreSQL、Valkey、私有 RustFS，显式运行真实 PostgreSQL 集成测试；随后构建前端/后端，启动确定性的 Fake MXAPI 与合并角色平台，运行 Playwright 页面测试，最后只清理自己创建的进程、网络和临时卷。它优先使用 npm；当桌面运行环境只提供打包的 Node.js 时会自动使用同一套锁定依赖直接执行测试工具。它不会连接真实 ModelCross、MXAPI 或付费模型，也不会占用已有的 `8787` 开发栈。

验证生产镜像：

```bash
./scripts/verify-delivery.sh image
```

一次执行测试、类型检查、构建、页面 E2E 和镜像构建：

```bash
./scripts/verify-delivery.sh all
```

也可以分项运行：

```bash
npm test --workspace server
npm test --workspace web
npm run typecheck
npm run build
# 先启动安全测试栈，再把地址传给 Playwright：
E2E_BASE_URL=http://127.0.0.1:8787 E2E_FAKE_PROVIDER=true npm run test:e2e
docker compose --env-file .env.example config --quiet
docker build --target runtime --tag museflow-ai-music:verify .
```

CI 会提供 PostgreSQL 16、Valkey 和私有 RustFS 依赖，并依次执行：

1. 锁文件安装；
2. Compose 模型校验；
3. 服务端单元/集成测试；
4. 前端组件、交互和无障碍测试；
5. 前后端 TypeScript 检查；
6. 生产构建；
7. 安装锁定版本的 Playwright Chromium；
8. 启动确定性 Fake MXAPI 和生产构建的平台进程，等待 `/health/ready`；
9. 运行登录、Landing 真实滚轮/键盘导航、工作台、390px 无横向溢出、动态 Suno 参数、无障碍、CSP 与安全假生成端到端测试；
10. 独立构建最终 runtime 镜像。

测试环境固定 `BILLING_LIVE_ENABLED=false`、`AI_LIVE_ENABLED=false`，Provider 指向本机 Fake 地址，不会触发真实积分、AI 或音乐费用。

## 生产部署清单

同一 `docker-compose.yml` 可用于单机生产基线，但生产流量前至少完成以下工作：

1. 使用独立 `.env` 或编排平台 Secret 注入，轮换所有示例密码；
2. 设置 `NODE_ENV=production`、`AUTH_MODE=oidc` 和规范 HTTPS URL；
3. 在反向代理/负载均衡器终止 TLS，只暴露 MuseFlow API；
4. PostgreSQL、Valkey、RustFS/S3 不开放公网端口；
5. 为数据库和对象存储配置加密、版本控制、定期备份与恢复演练；
6. 将 ModelCross、MXAPI 和对象 CDN 加入精确出站策略；
7. 保护 `/metrics`，只允许监控网络访问；
8. 配置日志脱敏、异常追踪、队列堆积、账本差异、存储失败和 Provider 限流告警；
9. 先保持真实开关关闭完成 staging 验收，再分阶段开启 AI、Provider 和积分结算；
10. 建立账号删除、内容举报、审计、对象清理和数据保留流程。

第 1 项不是建议性检查：生产进程会拒绝默认/示例 Session、OIDC、task-token、S3 Secret 和 `DATABASE_URL` 默认口令。第 9 项也不能跳过：只接通 OIDC、账户、授权模型和价格目录，不等于已经可以真实扣费或调用 Suno/AI。

如使用外部托管依赖，可通过 `MUSEFLOW_DATABASE_URL`、`MUSEFLOW_REDIS_URL`、`MUSEFLOW_S3_ENDPOINT`、`MUSEFLOW_S3_ACCESS_KEY_ID` 和 `MUSEFLOW_S3_SECRET_ACCESS_KEY` 覆盖 Compose 容器内地址。连接串中的用户名和密码必须正确 URL 编码；不要把未转义的 `@`、`:` 或 `/` 直接拼进 URL。

生产建议使用外部托管 PostgreSQL、Valkey 和对象存储，只保留 `museflow-api` 与 `museflow-worker` 镜像。迁移 SQL 位于 `server/migrations`，镜像会一并携带；平台启动时按文件名顺序执行并校验 checksum，已经应用的迁移文件不得原地修改，应新增下一序号迁移。

当前迁移已到 `010`：

| 迁移 | 用途 |
|---|---|
| `001_platform.sql` | 平台核心表、Session、Track、计费镜像、Outbox |
| `002_ai_idempotency.sql` | AI 幂等运行与结果记录 |
| `003_ai_billing_recovery.sql` | AI 计费恢复状态 |
| `004_security_controls.sql` | 数据库限流与 Session/Auth 清理索引 |
| `005_billing_recovery_namespace.sql` | 音乐/AI 计费命名空间与 reserve 崩溃恢复索引 |
| `006_suno_product_actions.sql` | 参考音频、上传续作、Track 资产作业与对应计费镜像 |
| `007_reference_audio_duration.sql` | 服务端可信的参考音频时长与 600 秒边界 |
| `008_provider_submission_ledger.sql` | Provider 至多一次提交边界，`not_started/started/accepted/rejected/uncertain` 及人工复核 |
| `009_ai_applied_fields_audit.sql` | AI 建议逐字段接受与应用审计 |
| `010_sound_generation_and_billing_projection.sql` | Sound 双任务参数持久化、用户侧 ModelCross 账单投影，以及旧模型上传续作的 nullable `audio_weight` |

### 无损升级与回滚

升级前先对 PostgreSQL 做逻辑备份并验证 `pg_restore -l`，记录旧镜像的不变标签/镜像 ID，同时保留数据库、Valkey 和 RustFS 命名卷。使用新标签更新 API/Worker：

```bash
MUSEFLOW_IMAGE=museflow-ai-music:<new-tag> \
APP_VERSION=<new-tag> \
docker compose --env-file /secure/path/museflow.env up -d --no-deps \
  museflow-api museflow-worker
```

如应用层需回滚，改回上一个已验证镜像标签，执行同样的 `up -d --no-deps`：

```bash
MUSEFLOW_IMAGE=museflow-ai-music:<previous-tag> \
APP_VERSION=<previous-tag> \
docker compose --env-file /secure/path/museflow.env up -d --no-deps \
  museflow-api museflow-worker
```

升级和回滚都**不得**执行 `docker compose down --volumes`，不要删除旧镜像。数据库迁移是前向、checksum 受保护的；仅回切镜像不会自动回退 SQL。回切前必须确认旧镜像对新增 schema 仍向后兼容；如确实需恢复数据库，只能根据已验证的备份在隔离环境先演练，再按独立的破坏性变更流程执行。

### 备份示例

先创建受限权限的备份目录，再执行逻辑备份：

```bash
mkdir -p ./backups
chmod 700 ./backups
docker compose exec -T postgres pg_dump \
  --username museflow --dbname museflow --format=custom \
  > "./backups/museflow-$(date +%Y%m%d-%H%M%S).dump"
```

对象存储需使用供应商版本控制/快照或 `mc mirror` 备份到独立 Bucket。恢复属于破坏性操作，必须在隔离环境演练并核对数据库与对象版本，不应直接对生产卷试验。

## 健康检查与观测

| 路径 | 含义 | 是否需要 Provider Key |
|---|---|---|
| `GET /health/live` | API 进程存活 | 否 |
| `GET /health/ready` | DB、队列、事件、存储、Provider 全部就绪 | 是 |
| `GET /api/health` | 产品级状态和活跃任务摘要 | 完整 ready 需要 |
| `GET /metrics` | Prometheus 指标 | 否；生产必须限制访问 |

建议告警至少覆盖：API readiness、PostgreSQL 连接、Valkey 延迟、BullMQ waiting/failed、Worker 心跳、`reconcile_required` 数量、S3 tombstone 重试、Provider 错误率、OIDC/JWKS 失败和计费对账差异。

## 主要 API

前端只调用同源 API。除公开目录与健康检查外，业务资源均按 OIDC `sub` 隔离。

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/auth/login` | 开始 OIDC 登录或本地开发登录 |
| `GET` | `/api/auth/callback` | OIDC PKCE 回调 |
| `POST` | `/api/auth/logout` | 撤销本地 Session |
| `GET` | `/api/session`, `/api/me` | 当前用户和只读账户摘要 |
| `GET` | `/api/catalog/music-models` | 动态模型能力和价格提示 |
| `GET` | `/api/catalog/music-operations` | ModelCross 音乐动作价格、动态参数和可执行状态 |
| `GET` | `/api/catalog/ai-operations` | AI 动作、授权模型、动态参数和计费状态 |
| `GET/POST/DELETE` | `/api/projects` | 项目管理 |
| `GET` | `/api/library` | 当前用户作品库 |
| `POST` | `/api/generate` | 创建歌曲或音效双 Track 批次；`kind=sound` 使用独立音效合同 |
| `POST` | `/api/tracks/:id/actions` | Extend、Cover、Remaster |
| `GET` | `/api/tracks/:id/audio` | owner 校验后的私有音频/Range |
| `GET` | `/api/tracks/:id/cover` | owner 校验后的私有封面 |
| `DELETE` | `/api/tracks/:id` | 删除 Track 并写对象 tombstone |
| `GET` | `/api/tasks` | 任务与计费结算状态 |
| `GET` | `/api/events` | 当前用户的 SSE 事件流 |
| `GET` | `/api/billing/summary` | ModelCross 余额/订阅摘要 |
| `GET` | `/api/billing/orders` | 账单入口/镜像 |
| `GET` | `/api/billing/topup` | ModelCross 充值跳转 |
| `GET` | `/api/settings` | 只读 Provider 部署归属和配置状态 |
| `POST` | `/api/ai/assist` | AI 歌词和优化建议 |
| `POST` | `/api/ai/assist/:id/accept` | 明确接受某次建议 |
| `POST` | `/api/admin/reconcile` | 管理员手动触发幂等对账 |

生成、派生、项目写入和 AI 操作应携带 `Idempotency-Key`。对相同用户、操作和请求体重放时必须返回原结果；相同键配不同请求体必须拒绝。

## 关键环境变量

完整、带注释的模板见 `.env.example`。

| 分类 | 变量 | 生产要求 |
|---|---|---|
| 运行时 | `PLATFORM_MODE`, `RUNTIME_ROLE`, `PUBLIC_URL` | 平台模式；API/Worker 分离；HTTPS 公网地址 |
| 数据库 | `DATABASE_URL`, `DATABASE_POOL_SIZE` | 独立凭据、TLS、备份与连接池预算 |
| 队列与并发 | `REDIS_URL`, `REDIS_KEY_PREFIX`, `WORKER_CONCURRENCY`, `MAX_CONCURRENT_GENERATIONS_PER_USER`, `MAX_CONCURRENT_AI_RUNS_PER_USER` | 私网/TLS、唯一前缀，并分别限制 Worker 与单用户并发 |
| 存储 | `STORAGE_DRIVER`, `S3_*`, `SIGNED_URL_TTL_SECONDS`, `ASSET_HOST_ALLOWLIST` | 私有 Bucket、最小权限凭据、短时 URL；生产必须精确列出 Provider CDN Host |
| Session | `MUSEFLOW_SESSION_SECRET`, `SESSION_*` | 至少 32 字符高熵密钥，定期轮换 |
| OIDC | `MODELCROSS_OIDC_*` | 规范 Issuer、精确 Redirect URI、机密客户端 |
| ModelCross | `MODELCROSS_BASE_URL`, `MODELCROSS_ACCOUNT_URL`, `MODELCROSS_WALLET_URL`, `MODELCROSS_ORDERS_URL`, `MODELCROSS_TASK_TOKEN_SECRET` | 服务端 API 使用 HTTPS；账户/钱包/订单链接必须可被浏览器访问；task token 权限受限 |
| AI | `MODELCROSS_AI_RELAY_TOKEN`, `MODELCROSS_LYRICS_MODEL`, `MODELCROSS_FAST_MODEL`, `AI_LIVE_ENABLED` | Relay 凭据仅供服务端 `/v1/responses` 使用；模型由中央配置；测试后再开 |
| 计费 | `BILLING_LIVE_ENABLED` | staging 对账通过后再开 |
| Provider | MuseFlow: `SUNO_*_MS`; ModelCross: `WORK_SUNO_V2_*` | 永久凭据只由 ModelCross 管理；MuseFlow 使用资源绑定 task token；遵守限流和超时 |

## 故障排查

### `http://127.0.0.1:8787` 打不开

```bash
docker compose ps
docker compose logs --tail=200 museflow-api
curl --include http://127.0.0.1:8787/health/live
lsof -nP -iTCP:8787 -sTCP:LISTEN
```

若端口已占用，在 `.env` 中改为 `MUSEFLOW_PORT=8790`，然后重新执行 `docker compose up -d`，访问 `http://127.0.0.1:8790`。同时把 `PUBLIC_URL` 和 OIDC Redirect URI 改成一致端口。

### API 一直处于 starting

先看依赖状态和一次性初始化容器：

```bash
docker compose ps --all
docker compose logs postgres valkey minio minio-init
```

常见原因是宿主端口冲突、旧数据卷凭据与新 `.env` 不一致、RustFS 密码过短，或数据库迁移失败。迁移 checksum 错误时不要编辑已经应用的 SQL，应恢复原文件并新增迁移。

### `/health/ready` 返回 503

查看 JSON 中的 `checks` 字段。安全默认下 `provider=false` 是预期结果；真实模式下依次检查 ModelCross 的 Work Billing、Suno V2 网关、Channel/Secret 和 `/api/work/internal/suno/status`。数据库、队列或存储为 false 则检查对应容器。不要仅为得到 200 而填入生产 Key。

### OIDC issuer mismatch 或回调失败

- 确认 `MODELCROSS_OIDC_ISSUER` 与 Discovery `issuer`、JWT `iss` 完全一致；
- 确认注册的 Redirect URI 与 `MODELCROSS_OIDC_REDIRECT_URI` 字符级一致；
- 确认浏览器和容器都能访问 Issuer；
- 检查反向代理是否正确传递 `Host`、`X-Forwarded-Proto`，且 `PUBLIC_URL` 是 HTTPS；
- 不要用内部容器 URL 作为对浏览器发布的 Issuer。

### 余额能显示但生成失败

依次检查模型是否启用、ModelCross task token 权限、reserve 结果、ModelCross Suno Channel/Secret、Provider 余额、Worker 日志和对象存储。`BILLING_LIVE_ENABLED=false` 时显示的是非实扣预览状态；不要把它误认为已完成真实扣费集成。

### 歌曲完成但不能播放

检查 Track 是否已 materialized、对象的 owner 前缀和 checksum、RustFS Bucket 是否仍为私有、API Range 响应以及 Worker 的素材下载错误。不要通过临时公开 Bucket 绕过 owner 校验。

## 上游接口依据

- [MXAPI API 在线测试（本次 UI 与 Wire 参数主合同）](https://open.mxapi.org/api-test)
- [MXAPI 生成音乐 V2](https://open.mxapi.org/api/docs?id=v2-music-generate)
- [MXAPI 生成音效 V2](https://open.mxapi.org/api/docs?id=v2-music-sound)
- [MXAPI 查询音乐任务](https://open.mxapi.org/api/docs?id=v2-music-query-task)
- [MXAPI 批量查询音乐任务](https://open.mxapi.org/api/docs?id=v2-music-batch-query)
- [MXAPI 上传参考音频](https://open.mxapi.org/api/docs?id=v2-music-upload)
- [MXAPI 获取整首歌](https://open.mxapi.org/api/docs?id=v2-music-whole-song)
- [MXAPI 获取歌词时间戳](https://open.mxapi.org/api/docs?id=v2-music-aligned-lyrics)
- [MXAPI Remaster](https://open.mxapi.org/api/docs?id=v2-music-upsample)
- [MXAPI 生成音乐视频](https://open.mxapi.org/api/docs?id=v2-music-video)
- [MXAPI 转 WAV](https://open.mxapi.org/api/docs?id=v2-music-convert-wav)
- [MXAPI 裁剪音乐](https://open.mxapi.org/api/docs?id=v2-music-crop)
- [MXAPI 变速音乐](https://open.mxapi.org/api/docs?id=v2-music-speed)
- [MXAPI API 使用指南](https://open.mxapi.org/api-guide)

以上文档于 2026-08-26 逐页复核。用户指定的交互式 API Test 是本次参数与 UI 条件显示的主合同，专用 `v2-music-*` 页面用于补充说明。页面内部仍有少量冲突：Sound 基本说明写单个任务但响应示例返回两个 `task_ids`；Aligned Lyrics 的完成状态分别出现 `complete` 与 `aligned`。专用 Remaster 文档已明确 `chirp-flounder` 对应 V5.5，并确认 V5 及以上支持 `variation_category`。MuseFlow 对固定双结果和两个歌词状态做兼容；不会复制演示 JSON 中的重复字段或非法注释，也不会发送旧字段的双份兼容副本。

## 许可证与来源

MuseFlow 以 MIT 许可的 [MiniMax Music UI](https://github.com/adambenhassen/minimax-music-ui) 为产品与工程底座进行改造，并保留 [LICENSE](./LICENSE)。`GetMusicFromSuno` 与 `ACE-Step Studio` 仅用于研究工作流和界面，不复制其素材或大段源码。

ModelCross 是独立的 AGPLv3 项目，带其自身归属要求；本仓库通过网络契约与其集成，不重新许可 ModelCross 代码。MXAPI、Suno、模型输出和云服务分别受对应平台条款约束；MuseFlow 的 MIT 许可证不授予第三方 API、模型、商标或生成内容的额外权利。
