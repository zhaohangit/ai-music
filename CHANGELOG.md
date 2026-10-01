## 2026-09-29 · MV 第一轮完善

- 修正本地 API 计费提示，加入分镜费用估算、提交预算及账户额度检查。
- 新增镜头候选版本、重新生成、裁剪、排序、拆分、字幕重新合成和历史成片。
- 新增分轨导入、独立人声/伴奏增益、20 秒混音试听及真实音量验证。
- 修正 Seedance 参考音频为 MP3、Grok 普通模型的分辨率限制。
- 新增只读签名素材中继，启用本地音频参考驱动与 Suno 参考音频工作流。
- 新增暂停后续提交、退避查询、异常任务核对恢复、MV 任务中心、项目归档与素材清理。
- 本地静帧检测提示人工检查；生产化媒体计费、自动分轨与专用精准对嘴仍待接入。

## 2026-09-29 · MV 工作室

- 加入歌曲到 MV 的完整本地创作流程：参考人物、12 个视频模型、动态分镜、独立镜头生成、字幕与 FFmpeg 合成。
- 私有 MV 项目、owner 隔离、版本控制、幂等和持久 Worker 租约；结果未知不自动重发付费请求。
- 成片回填歌曲视频资产，同时保留项目历史文件。
- 更新 Suno V6 / Wild / Mini、Max 独立报价、创造力增强、MP3 / M4A / WAV 下载端点。
- 明确本地 API 账户实际计费及正式部署需要的 ModelCross 媒体合同。

# Changelog

## Unreleased — 2026-08-29

### 生产稳定性与生成数量

- 修复 MXAPI 完成任务返回 `fileInfo.mp3Url=/api/forbidden` 时误判为失败；优先使用 `media_urls` 中真实可播放的 Suno CDN 音频，避免任务卡在“已预留”且无法结算。
- 生产资产白名单补充 MXAPI/Suno 已观察到的音频与封面 CDN 主机，并继续拒绝控制面占位地址。
- 创作台新增生成数量选择（1 首或 2 首）。MXAPI 单次上游请求仍固定创建两个任务；选择 1 首时 MuseFlow 仅保留首个结果，同时在界面明确展示双任务成本边界。
- ModelCross AI Relay 对 429/5xx 增加有界退避重试，认证和参数错误仍立即失败。

## v0.2.0 — 2026-08-25

### MXAPI API Test 合同补齐

- 新增独立双版本音效创作：`POST /api/v2/music/sound`，完整映射 `title / tags / mv / tempo / key / loop`，只允许 Suno V5/V5.5，并由独立 `sound_pair` 动态报价。
- 上传音频 Extend/Cover 的参考音频权重改为 `metadata.control_sliders.audio_weight`，并同步生成 `metadata.can_control_sliders`。
- V4.5+ 生成请求补齐 `metadata.create_mode=simple|custom`；`metadata.can_control_sliders` 仅声明实际发送的滑杆，包含音频权重时同步加入 `audio_weight`。
- `audio_weight` 同时按目标模型能力显示与发送：V4.5+ 可调，V4/V3.5/V3 的 Upload Extend/Cover Wire 完全省略该字段。
- Provider 余额改用实时 V2 文档中的 `GET /api/v2/points/balance`，并补齐只读分页 `GET /api/v2/points/logs`；歌词对齐兼容 `complete` 与 `aligned` 完成状态。
- V3/V3.5 Remaster fail closed；V4/V4.5/V5/V5.5 使用显式 Remaster Wire 模型映射。
- 变速标题恢复为文档规定的可选语义：浏览器留空、服务端显示继承原作品名，但 Provider Wire 完全省略 `title`。
- 首页恢复独立纵向滚动，工作台继续使用固定视口与内部滚动；音效表单补充响应式、键盘和无障碍交互。

### 账户与计费语义

- 用户作品、任务和退款状态统一使用 ModelCross 的批次预计积分、实际结算与账单状态。
- 作品卡和详情直接投影 `billing_status / estimated_credits / settled_credits`，不会用 Provider `points_cost` 兜底。
- MXAPI 的 `remaining_points / points_cost / points_refunded` 明确归类为部署商户成本，只保留在管理员诊断与 Provider 对账；普通 Track API 和页面均不再投影或冒充用户钱包积分。
- ModelCross 本地联调目录扩展为 18 个操作码；`sound_pair=20` 仅为不实扣预览价，生产售价必须由正式运营目录配置。

## v0.1.0 — 2026-08-25

MuseFlow 首个 Suno / MXAPI 版本。

### 创作与作品库

- 支持灵感与自定义两种创作模式，以及纯音乐、排除风格、声线、风格强度和创意度。
- 支持 Suno V3 至 V5.5；每次提交固定创建两个独立任务和两个本地作品。
- 新增真实任务进度、双版本分组、搜索筛选、详情抽屉、参数复用、下载和完整 MP3 播放器。
- 新增 Extend、Cover 和 Remaster；后续操作使用每首歌独立的 `custom_id`。
- 早期版本曾直接展示 MXAPI 商户余额和任务点数；v0.2.0 起已改为 ModelCross 用户账单口径。

### 服务端接入

- 接入 MXAPI Suno V2 异步生成、单任务/批量查询、余额和 Remaster 接口。
- 分离本地 Track ID、MXAPI `task_id` 与 Suno `custom_id`，并从同批结果中精确匹配歌曲。
- 后台批量轮询、错误退避、重启恢复和原子 JSON 持久化；刷新或重启不会重新提交任务。
- 音频与封面采用大小受限的原子下载；下载失败时可经同源受控代理读取远程资产。
- API Key 仅保存在服务端环境变量或权限为 `0600` 的设置文件中，不返回浏览器。

### UI 与部署

- 将桌面端界面重构为 MuseFlow 中文深色音乐工作台，并明确标注非 Suno 官方产品。
- 提供 Fake MXAPI 开发模式，不访问真实服务、不消耗积分。
- 默认服务和 Docker 端口仅绑定 `127.0.0.1`；对外部署前必须增加反向代理鉴权。
- 保留 MIT 许可的原始工程来源声明。
