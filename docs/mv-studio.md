# MV 工作室

实现与接口核对日期：2026-09-30。

## 创作流程

1. 在歌曲详情选择「创作人物 MV」，或打开侧栏「MV 工作室」。
2. 选择已完成歌曲、成片时长、参考人物照片及画面叙事。
3. 选择视频模型、分辨率、横竖画幅、单镜头长度与表演方式。
4. 创建分镜：这是本地规划操作，不调用视频生成。每段有独立提示词、模型与任务。
5. 可以先生成一个镜头预览，再生成其余镜头。只提交未完成或明确失败的镜头。已完成镜头支持生成新的候选版本，旧素材仍可选择。
6. 全部分镜就绪后，Worker 使用原曲、动态片段和已对齐字幕生成 MP4；同步到歌曲视频资产，并保留 MV 项目的历史成片。
7. 成片和 SRT 通过登录后的同源接口播放、Range 读取和下载。

不会用照片缩放、定格补帧或循环视频凑足时长。规划分镜覆盖指定歌曲时段，每段不足时长时合成失败并提示重新生成。

## 视频模型

| 家族 | 模型 | 可选分辨率 | 单镜头 |
| --- | --- | --- | --- |
| Seedance | 2.5 | 480p / 720p / 1080p | 4–30 秒 |
| Seedance | 2.0 | 480p / 720p / 1080p | 4–15 秒 |
| Seedance | 2.0 Fast / Mini | 480p / 720p | 4–15 秒 |
| 即梦 | 1.0 Fast / 1.5 Pro | 480p / 720p / 1080p | 2–12 秒 |
| Grok | Imagine / Imagine 1.5 | 480p / 720p / 1080p | 1–15 秒 |
| Veo | 3.1 Fast / Quality / Lite | 720p / 1080p | 8 秒 |
| Omni | Flash | 720p / 1080p | 4 / 6 / 8 / 10 秒 |

模型约束在服务端再次校验；Grok 1.5 必须提供参考图片。MV 工作室目前每个项目使用一张主体照片；底层供应商的多参考图、视频编辑等额外参数不属于此工作室首版界面。

演唱模式分为：叙事动作、人物演唱、音频参考驱动。普通人物演唱仅生成表演口型，不承诺逐字同步；音频参考会分割原歌曲并通过签名存储交给支持该输入的 Seedance 模型，成片仍需检查口型。模型没有公开强制逐字对嘴参数。

## 字幕与混音

- 自动字幕复用已存储的 Suno `aligned-lyrics` 时间轴；不存在时提交歌曲歌词对齐任务。
- 也可以上传或粘贴人工校对的 SRT。验证时间格式、范围与顺序。
- 对齐词按实际起止时间聚合成短句；FFmpeg / libass 烧录中文字幕。
- 原曲整体增益为 -12 至 +6 dB，加限幅。保留原曲人声与伴奏比例；没有分轨时不伪装成可单独调节人声。
- 视频模型生成的声音不会混入最终原曲。

## 本地启动（OrbStack）

```sh
npm run dev:mv
```

该命令先构建，再启动本地 API（8787）和前端（5174）。读取 `.env`，然后由 `.env.mv.local` 覆盖本机配置。后者被 Git 忽略。

当前本机复用 OrbStack 中的 PostgreSQL 和 Valkey；FFmpeg 使用已有 `ai-video-media-worker:latest` 镜像。所有 FFmpeg 子进程通过参数数组启动，不经过 Shell；渲染容器禁用网络。

相关配置（凭据只放服务端）：

```dotenv
MV_LOCAL_LIVE_ENABLED=true
MV_API_BASE_URL=https://open.mxapi.org
MV_API_KEY_FILE=/absolute/private/path/mxapi.key
MV_FFMPEG_DOCKER_IMAGE=ai-video-media-worker:latest
MV_WORK_DIR=/absolute/path/to/mv-work
MV_FONT_PATH=/absolute/path/to/chinese-font.ttf
MV_FONT_FAMILY=TheFontFamilyName
```

如果 FFmpeg 原生可执行，留空 `MV_FFMPEG_DOCKER_IMAGE`。应用 Dockerfile 已安装 FFmpeg 与 Noto CJK 字体。

`SUNO_API_KEY_FILE` 支持现有本地音乐直连模式；还需 `ALLOW_DEVELOPMENT_DIRECT_PROVIDER=true`。本地直连会实际使用 API 账户额度，UI 会显示该计费方式，不表示免费。

音频参考驱动需要可公开读取的限时签名素材地址：可以使用配置好的私有 S3 签名存储，也可以使用下文的本地只读素材中继。当前本机使用本地文件存储与已通过公网自检的只读签名素材中继，音频参考驱动、参考音频上传与续作已启用。生产环境仍应使用稳定的私有 S3 签名存储。

## 服务与持久性

- `015_mv_studio.sql`：私有参考图、MV 项目、JSON 分镜、版本、提交幂等键、Worker 租约。
- 写入前检查歌曲与照片的 owner。客户端只能看到同源资源地址。
- 乐观版本号防止两个窗口互相覆盖分镜。
- 每个账户最多同时生成两支 MV，每项目最多两个上游生成任务同时执行。
- 提交上游前保存 `submitting`；若网络结果未知，标记 `uncertain`，不会自动重复付费请求。
- Worker 扫描数据库恢复任务，租约防止重复领取；长合成续租。
- 合成不依赖浏览器保持打开。应用内 API 与 Worker 分离运行时，MV Worker 只随 Worker 角色启动。
- 成片按项目保存，发布到歌曲时另外存放副本，后续重制不会删除历史项目文件。

## 接口

- `GET /api/mv/catalog`
- `POST /api/mv/references`（multipart，image 字段）
- `GET /api/mv/references/:id`
- `GET /api/mv/projects`
- `POST /api/mv/projects`（需要 Idempotency-Key）
- `GET /api/mv/projects/:id`
- `PATCH /api/mv/projects/:id`（revision、shots、srt）
- `POST /api/mv/projects/:id/generate`（revision；可选 shotId）
- `POST /api/mv/projects/:id/render`（revision）
- `GET /api/mv/projects/:id/video`
- `GET /api/mv/projects/:id/subtitles`
- `GET /api/mv/projects/:id/shots/:shotId/video`

## 部署范围

本次视频执行器启用范围是**本地开发账户直连**。正式多用户部署仍需 ModelCross 发布媒体授权、请求级动态报价和结算合同；本项目不会在生产环境绕开它。生产环境可以查看和编辑分镜，但不会用商户永久密钥替代用户授权进行生成。新音乐动作同样需要 ModelCross 对应操作价格和网关路由才能在生产环境启用。

## 验证

- `server/test/platform/mv-studio.test.ts`：时长覆盖、模型限制、Provider payload、字幕时间与转义。
- `server/test/platform/mv-studio.postgres.test.ts`：真实 PostgreSQL owner 隔离、幂等、并发领取、提交结果未知保护。
- `server/test/platform/suno-current-contract.test.ts`：V6 / Max / 三种下载端点。
- `e2e/mv-studio.spec.ts`：桌面与 390px 手机模型切换、参考图、分镜保存、单镜生成、Axe 检查；付费请求由假接口拦截。
- `node scripts/verify-mv-render.mjs`：真实 OrbStack / FFmpeg、动态测试画面、音频、中文字幕与时长验证，零 Provider 调用。

官方契约来源：MXAPI 的 `/api-test` 与 `/api-guide`；参数按 2026-09-29 页面公开的 API 描述核对。模型名单与可用性仍可能由上游变更。

## 修复进度（2026-09-29）

- 独立镜头生成编号、镜头候选版本、裁剪/排序/拆分、历史成片和字幕重新合成。
- 新增按 API 文档标准费率的镜头估算与提交预算；这是提交控制，不是供应商结算保证。
- 暂停后续提交、已提交任务继续回收、只查询旧任务的恢复入口、管理员核对未知提交。
- 导入原曲对齐的人声/伴奏分轨、独立增益和 20 秒本地混音试听；自动分轨未冒充已接入。
- 局部静帧检测会标记疑似静止镜头，需预览确认。该检查不等同人脸一致性或精准口型检测。
- 参考音频改为 MP3；普通 Grok 模型移除 1080p。
- 可选的本地只读签名素材中继与 HTTPS 临时隧道，通道自检成功后才启用参考音频功能。


## 本次已验证的修复

### 编辑与版本

- 镜头可拖动或使用上下移动按钮调整顺序；可设置素材起点、裁剪长度并拆分已完成镜头。
- 重新生成使用新的 attempt 编号与幂等键，保留旧候选；同一次未知提交不会自动重复发送。
- 成片版本独立保存，字幕/混音/镜头修改显示“需要重新合成”，重新导出前自动保存编辑内容。
- 新增归档、恢复、删除项目及未使用参考照片的清理。项目删除通过已有存储清理队列回收所属素材，保留歌曲及已发布视频副本。

### 费用与运行状态

- 本地直连与 ModelCross 钱包计费分别显示。歌曲操作弹窗不再把实际 API 调用标成不扣费。
- 视频采用 2026-09-29 API Test 的标准文档费率估算，不计临时折扣；预算控制后续提交，最终仍以供应商实际结算为准。
- 生成前检查 API 鉴权、可用额度、渲染器和所需签名素材通道。模型单独标记“待实测”，账户鉴权通过不冒充逐模型生成验收。
- 已发出的任务继续查询与保存；暂停会阻止新镜头提交。轮询错误使用退避，连续失败后允许只查询已有任务恢复。
- 未知提交关联上游任务限管理员操作，不允许普通用户将任意商户任务关联为自己的素材。
- 生成轮询与视频合成由独立执行循环处理；MV 任务进入任务中心和侧栏进行中数量。

### 本地签名素材中继

`.env.mv.local` 中启用 `ASSET_RELAY_ENABLED=true` 和 `ASSET_RELAY_AUTO_TUNNEL=true` 后，`dev:mv` 使用本项目 `.tools/cloudflared` 启动临时 HTTPS 隧道。

- 固定目标是本地专用只读素材服务 `127.0.0.1:8790`；不代理应用的 `8787` / `5174`。
- 只接受 `/media/<加密签名票据>` 的 GET/HEAD，支持 Range。票据绑定单个对象及有效期。
- 不接受路径列目录、应用 API、写入或任意 URL 转发。
- 通道通过随机签名探测自检后才标记可用；隧道结束后清空地址并关闭外部素材可用性。
- 隧道与本地应用同生命周期，适用于本地开发；正式部署使用固定公网域名和私有对象存储。
- 本机 cloudflared 2026.9.3 来自 Cloudflare 官方 GitHub Release，下载时验证发布的 SHA-256。二进制仅保存在项目 `.tools/`，未安装到系统路径。

验证命令：

```sh
node scripts/verify-asset-relay.mjs
node scripts/verify-mv-render.mjs
```

素材通道测试只传送合成测试字节。混音测试使用 330 Hz / 660 Hz 测试音，验证人声 +6 dB、伴奏 -6 dB 后实际比例约 12 dB；不会使用真实歌曲测试音量，更不会调用付费生成。

### 尚不冒充可用的能力

MXAPI 本次公开合同未提供独立的自动人声分离和强制精准对嘴端点。当前提供的是上传分轨后的独立混音，以及 Seedance 音频参考生成。生产环境的 ModelCross 媒体授权/报价/结算、自动分轨模型和专用对嘴服务仍需要另行接通。


### 回归结果

- 327 项后端测试通过（包含真实 PostgreSQL 集成测试）。
- 178 项前端测试通过。
- 6 个桌面/手机浏览器流程通过；完成页面布局调整后，成片播放/下载的两个浏览器用例再次通过。
- 真实 FFmpeg 横屏 / 竖屏 + 音频 + 中文字幕合成通过。
- 独立分轨混音实测 12.03 dB 差值，目标为 12 dB。
- 公网签名素材通道的 Range、过期拒绝及应用接口隔离验证通过。
- 本轮没有发起新的付费歌曲或视频生成；12 个视频模型仍逐个标记真实生成待验收。

## 第二轮交付验收（2026-09-30）

- 本地/CI 对象存储从已失效的旧 MinIO 固定地址切换为固定 digest 的 RustFS S3 兼容镜像；Compose 服务名仍为 `minio`，保留现有端口、卷和环境变量兼容性。
- Bucket 初始化改用固定 digest 的 AWS CLI S3 API 调用，不依赖 MinIO Client 镜像；默认 Bucket 继续保持私有。
- `multer` 升级到 2.4.0；npm 锁文件固定 `qs` 6.16.0 与 `moment` 2.31.0，pnpm workspace overrides 同步固定这两个传递依赖。
- 生产依赖与完整依赖审计均为 0 个漏洞；pnpm 锁文件供应链检查通过。
- 最终隔离交付门：服务端 333 项、前端 178 项、浏览器 77 项通过 / 7 项按条件跳过；运行时镜像构建、MV 横竖屏渲染、中文字幕、分轨混音和签名素材中继均通过。
