import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  External,
  Refresh,
  Search,
  Sparkle,
  Spinner,
} from "./Icons";
import { useI18n } from "../i18n";
import {
  SUNO_V2_CONTRACT,
  SUNO_V2_ENDPOINT_COUNT,
  type SunoContractEndpoint,
} from "../lib/suno-contract";
import type { MxapiCapabilityProfile } from "../types";
import type { View } from "./Sidebar";

interface Props {
  capabilities?: MxapiCapabilityProfile[];
  error?: string | null;
  loading?: boolean;
  onRetry?: () => void;
  onNavigate: (view: View) => void;
}

type Category = "all" | "Suno" | MxapiCapabilityProfile["category"];

const CONTRACT_EN: Record<string, string> = {
  双版本音乐生成: "Two-version music generation",
  "灵感、自定义歌词、纯音乐，以及 extend / upload_extend / cover 三种任务模式。":
    "Inspiration, custom lyrics, instrumental mode, plus extend / upload_extend / cover task modes.",
  灵感模式: "Inspiration mode",
  自定义歌词模式: "Custom lyrics mode",
  "Provider 可选；MuseFlow 服务端按模型目录归一化":
    "Optional Provider field; normalized server-side from the model catalog",
  "Provider 可选；MuseFlow 默认归一化为 false":
    "Optional Provider field; MuseFlow defaults it to false",
  操作对话框: "Action dialog",
  "作品 customId": "Track customId",
  "续作起点（秒）": "Continuation point (seconds)",
  "V4.5+；包含下方高级字段": "V4.5+; includes the advanced fields below",
  "服务端按 UI 参数组装": "Assembled server-side from the UI",
  "V4.5+；由创作模式映射": "V4.5+; mapped from the creation mode",
  "灵感 / 自定义模式": "Inspiration / custom mode",
  非纯音乐且模型支持声线: "Non-instrumental and supported by the model",
  "男声 / 女声": "Male / female vocal",
  风格强度: "Style strength",
  创意度: "Creativity",
  上传音频续作或上传音频翻唱: "Uploaded-audio continuation or cover",
  参考音频权重: "Reference audio weight",
  "V4.5+；服务端按实际发送滑杆派生":
    "V4.5+; derived server-side from the sliders sent",
  "能力声明（非用户输入）": "Capability declaration (not user input)",
  "data.task_ids（两个 Provider task id）":
    "data.task_ids (two Provider task ids)",
  "创作工作台 + 作品详情的续写/翻唱对话框":
    "Workbench + extend/cover dialogs in track details",
  音效生成: "Sound-effect generation",
  "Suno V5 / V5.5 音效双版本生成，字段与文档逐项对应。":
    "Two-version Suno V5 / V5.5 sound generation with fields matching the contract.",
  音效标题: "Sound title",
  音效风格与描述: "Sound style & description",
  音效模型: "Sound model",
  调性: "Key",
  无缝循环: "Seamless loop",
  "创作工作台 → 音效": "Workbench → Sound effects",
  单任务查询: "Single-task query",
  "查询单个 Provider task 的状态、文件、积分成本与退款信息。":
    "Query one Provider task status, files, credit cost and refund information.",
  任务中心查询框: "Task center query field",
  "任务中心 → 文档查询面板": "Task center → contract query panel",
  批量任务查询: "Batch task query",
  "按逗号分隔的 Provider task id 分页查询，只返回当前账号拥有的任务。":
    "Paginate comma-separated Provider task ids; only tasks owned by this account are returned.",
  "任务 ID 列表": "Task ID list",
  页码: "Page",
  每页数量: "Page size",
  参考音频上传: "Reference audio upload",
  "由 MuseFlow 先写入私有 OSS，再由服务端生成 Provider 可访问的签名 URL。":
    "MuseFlow writes to private OSS first, then the server creates a signed URL for the Provider.",
  私有上传后端托管: "Managed by the private upload backend",
  版权音频声明: "Copyright-audio declaration",
  "创作工作台 → 参考音频 / 设置 → 私有参考音频":
    "Workbench → Reference audio / Settings → Private reference audio",
  完整歌曲: "Whole song",
  "将已完成片段扩展成完整歌曲，不覆盖原作。":
    "Expand a completed clip into a whole song without overwriting the original.",
  "作品详情 → 继续创作 → 完整歌曲":
    "Track details → Continue creating → Whole song",
  逐字对齐歌词: "Word-aligned lyrics",
  "按歌词文本生成带时间戳的 alignment 资产。":
    "Generate a timestamped alignment asset from lyric text.",
  对齐歌词文本: "Lyrics to align",
  "作品详情 → AI 与媒体资产 → 逐字歌词":
    "Track details → AI & media assets → Aligned lyrics",
  高清重制: "Remaster",
  "按模型映射提交 V4–V5.5 Remaster；V5/V5.5 可选择 variation_category。":
    "Submit a V4–V5.5 remaster by model mapping; V5/V5.5 can choose variation_category.",
  由作品模型映射: "Mapped from the track model",
  变化程度: "Variation",
  "作品详情 → 继续创作 → 高清重制":
    "Track details → Continue creating → Remaster",
  音乐视频: "Music video",
  "用 Provider 数字记录 id 与 Suno custom id 创建视频资产。":
    "Create a video asset from the Provider numeric record id and Suno custom id.",
  "作品 providerRecordId": "Track providerRecordId",
  "作品详情 → AI 与媒体资产 → 音乐视频":
    "Track details → AI & media assets → Music video",
  "WAV 转换": "WAV conversion",
  "创建无损 WAV 资产；Provider 地址不会暴露给浏览器。":
    "Create a lossless WAV asset without exposing the Provider URL to the browser.",
  "作品详情 → AI 与媒体资产 → WAV": "Track details → AI & media assets → WAV",
  裁剪片段: "Crop clip",
  "按起止秒数创建新版本，结束时间必须严格大于开始时间。":
    "Create a new version from start and end seconds; end must be greater than start.",
  开始秒数: "Start seconds",
  结束秒数: "End seconds",
  "作品详情 → 编辑与版本 → 裁剪": "Track details → Edit & versions → Crop",
  变速: "Speed",
  "只允许文档列出的倍率，可选保持音高与新标题。":
    "Only documented multipliers are allowed, with optional pitch preservation and a new title.",
  速度倍率: "Speed multiplier",
  保持原音高: "Preserve pitch",
  新版本标题: "New title",
  "作品详情 → 编辑与版本 → 变速": "Track details → Edit & versions → Speed",
  "Provider 积分余额": "Provider credit balance",
  "读取部署商户的 MXAPI V2 积分余额，仅供管理员健康诊断，不代表用户钱包。":
    "Read deployment merchant MXAPI V2 credits for administrator diagnostics; this is not the user wallet.",
  "设置 → 模型连接 → Provider 诊断":
    "Settings → Model connection → Provider diagnostics",
  "Provider 积分日志": "Provider credit logs",
  "分页读取部署商户的 MXAPI V2 积分变动记录，仅供管理员对账。":
    "Paginate deployment merchant MXAPI V2 credit changes for administrator reconciliation.",
  "Provider 诊断页码": "Provider diagnostics page",
  "Provider 诊断每页数量": "Provider diagnostics page size",
};

const contractText = (value: string, language: "zh-CN" | "en-US") =>
  language === "zh-CN" ? value : (CONTRACT_EN[value] ?? value);
const CATEGORY_EN: Record<string, string> = {
  即梦: "Jimeng",
  Seedance视频: "Seedance video",
  商品套图: "Product image sets",
  系统通用: "System",
};

const CAPABILITY_EN: Record<string, [string, string]> = {
  "nano-standard": [
    "Nano Banana standard image",
    "gemini-2.5-flash-image text-to-image and multi-image reference.",
  ],
  "nano-pro": [
    "Nano Banana Pro V2",
    "Supports 1K/2K/4K, custom ratios and reference images.",
  ],
  "nano-pro-legacy": [
    "Nano Banana Pro compatibility API",
    "Legacy synchronous Nano Pro entry; prefer /nano-pro for new integrations.",
  ],
  nano2: [
    "Nano Banana 2",
    "gemini-3.1-flash-image-preview with channel, resolution, ratio and reference-image support.",
  ],
  "nano2-lite": [
    "Nano Banana 2 Lite",
    "Lightweight image model with 1K output and up to 10 reference images.",
  ],
  "nano-task": [
    "Query NANO image task",
    "Query nano / nano-pro / nano2 task status.",
  ],
  "gpt-image-2": [
    "GPT Image 2",
    "Supports custom size, ratio, quality, resolution and reference images.",
  ],
  "gpt-image-task": [
    "Query GPT Image task",
    "Query GPT Image 2 status and image results.",
  ],
  "jimeng-40": [
    "Jimeng Image 4.0",
    "Seedream 4.0 with 2K/4K and reference-image support.",
  ],
  "jimeng-45": [
    "Jimeng Image 4.5",
    "Seedream 4.5 with 2K/4K and reference-image support.",
  ],
  "jimeng-50": [
    "Jimeng Image 5.0",
    "Seedream 5.0 with web search and JPEG/PNG output.",
  ],
  "jimeng-four-images": [
    "Jimeng 4.5 four-image API",
    "Legacy four-image concurrent endpoint.",
  ],
  "jimeng-draw-task": [
    "Query Jimeng image task",
    "Query draw-pro / draw-4-5 / draw-5-0 status.",
  ],
  "jimeng-video": [
    "Jimeng video generation",
    "Text-to-video, image-to-video and first/last frames controlled by content and text suffixes.",
  ],
  "seedance-20": [
    "Seedance 2.0",
    "Image, video and audio multimodal references with generated audio and last-frame output.",
  ],
  "seedance-25": [
    "Seedance 2.5",
    "Supports 4–30 seconds, video edit/extend, audio references and mp4/mov.",
  ],
  "seedance-fast": [
    "Seedance 2.0 Fast",
    "Low-latency version with 480p/720p and multimodal references.",
  ],
  "seedance-mini": [
    "Seedance 2.0 Mini",
    "Lightweight lower-cost version with 480p/720p.",
  ],
  "video-task": [
    "Query video task",
    "Query asynchronous Jimeng / Seedance video tasks.",
  ],
  "grok-video": [
    "Grok video generation",
    "Text-to-video, single-image and multi-image reference; priced by model, resolution and seconds.",
  ],
  "grok-extend": [
    "Grok video extension",
    "Generate 1–10 second continuation clips from an existing public video.",
  ],
  "grok-task": ["Query Grok task", "Query generation or extension tasks."],
  "veo-generate": [
    "Veo video generation",
    "Veo 3.1 text-to-video, image-to-video and multi-image fusion with dynamic channel/model pricing.",
  ],
  "veo2-fast": [
    "Veo 2 Fast fixed tier",
    "Fixed-cost Veo 2 Fast tier published by channel-points.",
  ],
  "veo3-fast": [
    "Veo 3 Fast fixed tier",
    "Fixed-cost Veo 3 Fast tier published by channel-points.",
  ],
  "veo-quality": [
    "Veo high-quality fixed tier",
    "Fixed-cost Veo 2/3 high-quality tier published by channel-points.",
  ],
  "veo-economy": [
    "Veo Economy fixed tier",
    "Fixed-cost Veo Economy tier published by channel-points.",
  ],
  "veo-task": ["Query Veo task", "Query Veo video results."],
  "product-selling-points": [
    "Generate product selling points",
    "Extract selling points from product information.",
  ],
  "product-plan": [
    "Generate product plan",
    "Generate product visual planning and shot directions.",
  ],
  "product-images": [
    "Generate product set",
    "Generate product images from a planning document.",
  ],
  "points-balance": [
    "Provider credit balance",
    "Deployment merchant cost diagnostics, not the user wallet.",
  ],
  "points-logs": [
    "Provider credit logs",
    "Deployment merchant Provider cost and refund records.",
  ],
  "temp-image-upload": [
    "Temporary image upload",
    "Provide temporary files for image/video references that require public URLs.",
  ],
};
const FIELD_DESCRIPTION_EN: Record<string, string> = {
  文本提示词: "Text prompt",
  "参考图片 URL 数组": "Reference image URL array",
  图片分辨率: "Image resolution",
  视频宽高比: "Video aspect ratio",
  "输出秒数；不同模型为 4–15、4–30 或 -1 智能选择":
    "Output seconds; model limits are 4–15, 4–30 or -1 for smart selection",
  是否生成音频: "Whether to generate audio",
  是否返回末帧: "Whether to return the last frame",
  "通道标识符；不传使用 default": "Channel identifier; default when omitted",
  "任务 ID": "Task ID",
  "视频任务 ID": "Video task ID",
  "商品标题、属性与描述": "Product title, attributes and description",
  商品信息: "Product information",
  参考图片: "Reference images",
  "垫图 URL 数组": "Reference image URL array",
  输出分辨率: "Output resolution",
  宽高比: "Aspect ratio",
  提示词: "Prompt",
  视频提示词: "Video prompt",
  联网搜索: "Web search",
  输出格式: "Output format",
  "1:1、3:4、4:3、3:2、2:3、9:16、16:9、21:9":
    "1:1, 3:4, 4:3, 3:2, 2:3, 9:16, 16:9, 21:9",
  "text / image_url / video_url / audio_url；role 支持首帧、尾帧和多模态参考":
    "text / image_url / video_url / audio_url; role supports first frame, last frame and multimodal references",
  "工具配置，例如 web_search": "Tool configuration, e.g. web_search",
  生成或编辑提示词: "Prompt for generation or editing",
  "16 的倍数；比例不超过 3:1；总像素 655360–8294400":
    "Multiple of 16; ratio no more than 3:1; total pixels 655360–8294400",
  预设宽高比: "Preset aspect ratio",
  渲染质量: "Render quality",
  分辨率档位: "Resolution tier",
  "参考图片 URL": "Reference image URL",
  图片尺寸: "Image size",
  旧模型名: "Legacy model name",
  "Seedance 1.0 Fast 或 1.5 Pro": "Seedance 1.0 Fast or 1.5 Pro",
  "text / image_url 内容数组": "text / image_url content array",
  "追加在 text 末尾": "Appended to the end of text",
  固定镜头: "Fixed camera",
  "1–15 秒；多图参考 1–10 秒":
    "1–15 seconds; 1–10 seconds with multi-image references",
  后续内容描述: "Description of the continuation",
  "最大 15 秒的视频输入": "Video input up to 15 seconds",
  扩展片段秒数: "Extension clip seconds",
  "veo31 / veo31-fast / 1080p 变体": "veo31 / veo31-fast / 1080p variants",
  "图片 URL 数组": "Image URL array",
  扩图到目标比例: "Extend image to target ratio",
  自动翻译提示词: "Translate prompt automatically",
  通道选择: "Channel selection",
  "Veo 2 Fast 模型": "Veo 2 Fast model",
  "Veo 3 Fast 模型": "Veo 3 Fast model",
  "Veo 高质量模型": "Veo high-quality model",
  "Veo Economy 模型": "Veo Economy model",
  已生成卖点: "Generated selling points",
  商品套图策划: "Product image-set plan",
  商品参考图: "Product reference images",
  "JPEG/PNG/GIF/WebP，单张最大 10MB": "JPEG/PNG/GIF/WebP, max 10MB per image",
};
const capabilityTitle = (
  capability: MxapiCapabilityProfile,
  language: "zh-CN" | "en-US",
) =>
  language === "zh-CN"
    ? capability.title
    : (CAPABILITY_EN[capability.id]?.[0] ?? capability.title);
const capabilityDescription = (
  capability: MxapiCapabilityProfile,
  language: "zh-CN" | "en-US",
) =>
  language === "zh-CN"
    ? capability.description
    : (CAPABILITY_EN[capability.id]?.[1] ?? capability.description);
const capabilityFieldDescription = (
  value: string,
  language: "zh-CN" | "en-US",
) => (language === "zh-CN" ? value : (FIELD_DESCRIPTION_EN[value] ?? value));

export function SunoContractPage({
  capabilities = [],
  error = null,
  loading = false,
  onRetry,
  onNavigate,
}: Props) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [filter, setFilter] = useState("");
  const [method, setMethod] = useState<"all" | "GET" | "POST">("all");
  const [category, setCategory] = useState<Category>("all");
  const query = filter.trim().toLocaleLowerCase();
  const visibleSuno = useMemo(
    () =>
      SUNO_V2_CONTRACT.filter((endpoint) => {
        if (category !== "all" && category !== "Suno") return false;
        if (method !== "all" && endpoint.method !== method) return false;
        return (
          !query ||
          [
            endpoint.path,
            endpoint.title,
            contractText(endpoint.title, "en-US"),
            endpoint.description,
            contractText(endpoint.description, "en-US"),
            ...endpoint.fields.map((field) => field.name),
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query)
        );
      }),
    [category, method, query],
  );
  const visibleCapabilities = useMemo(
    () =>
      capabilities.filter((capability) => {
        if (category !== "all" && category !== capability.category)
          return false;
        if (method !== "all" && capability.method !== method) return false;
        return (
          !query ||
          [
            capability.category,
            capability.path,
            capability.title,
            capability.description,
            capability.identifier ?? "",
            capability.operationCode ?? "",
            ...capability.fields.map((field) => field.name),
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query)
        );
      }),
    [capabilities, category, method, query],
  );
  const total = SUNO_V2_ENDPOINT_COUNT + capabilities.length;
  const visibleCount = visibleSuno.length + visibleCapabilities.length;
  const categories: Category[] = [
    "all",
    "NANO",
    "GPT",
    "即梦",
    "Seedance视频",
    "Grok",
    "Veo",
    "Suno",
    "商品套图",
    "系统通用",
  ];

  return (
    <div className="page-scroll">
      <div className="mx-auto max-w-[1500px] p-5 lg:p-7">
        <header className="mb-6 rounded-3xl border border-accent/15 bg-gradient-to-br from-accent/[0.16] via-violet-500/[0.08] to-transparent p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span className="eyebrow">
                MXAPI V2 · MODELCROSS BILLING CATALOG
              </span>
              <h1 className="mt-2 text-2xl font-semibold text-main">
                {text("接口能力总览", "API capability overview")}
              </h1>
              <p className="mt-2 max-w-3xl text-xs leading-6 text-muted">
                {text(
                  "覆盖 NANO、GPT Image、即梦、Seedance、Grok、Veo、Suno 与系统接口。固定成本来自 channel-points 并由 ModelCross 发布 4 倍售价；动态视频必须按通道、token、分辨率和时长服务端报价，绝不会把 point_cost=0 当成免费。",
                  "Covers NANO, GPT Image, Jimeng, Seedance, Grok, Veo, Suno and system APIs. Fixed costs come from channel-points and ModelCross publishes a 4× price; dynamic video is quoted server-side by channel, tokens, resolution and duration, never treating point_cost=0 as free.",
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-right">
              <strong className="block text-2xl text-main">{total}</strong>
              <span className="text-[10px] text-muted">
                {text("个已登记端点", "registered endpoints")}
              </span>
              <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-emerald-300">
                <Check width={11} height={11} />{" "}
                {text(
                  "参数、结果与价格边界可检索",
                  "Parameters, results and price boundaries are searchable",
                )}
              </span>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => onNavigate("create")}
            >
              <Sparkle width={14} height={14} />{" "}
              {text("开始音乐创作", "Start creating")}
            </button>
            <a
              className="btn-ghost border !border-[var(--line)] text-xs"
              href="https://open.mxapi.org/api-test"
              target="_blank"
              rel="noreferrer"
            >
              <External width={13} height={13} />{" "}
              {text("API 测试文档", "API test docs")}
            </a>
            <a
              className="btn-ghost border !border-[var(--line)] text-xs"
              href="https://open.mxapi.org/api-guide"
              target="_blank"
              rel="noreferrer"
            >
              <External width={13} height={13} /> {text("使用指南", "Guide")}
            </a>
          </div>
        </header>

        {error && (
          <div
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-xs text-rose-300"
            role="alert"
          >
            <span>
              {error}
              {text(
                "。Suno 静态合同仍可查看，其它价格不会使用旧数据替代。",
                ". The static Suno contract remains available; other prices are not replaced with stale data.",
              )}
            </span>
            {onRetry && (
              <button
                type="button"
                className="btn-ghost border !border-rose-400/20"
                onClick={onRetry}
              >
                {text("重新同步", "Sync again")}
              </button>
            )}
          </div>
        )}
        {loading && (
          <div className="status-chip mb-5">
            <Spinner width={12} height={12} />{" "}
            {text(
              "正在读取 ModelCross 4 倍价格目录",
              "Reading the ModelCross 4× pricing catalog",
            )}
          </div>
        )}
        <section
          className="mb-4 flex gap-2 overflow-x-auto pb-1"
          aria-label={text("能力分类", "Capability categories")}
        >
          {categories.map((value) => (
            <button
              key={value}
              type="button"
              className={`capability-category-tab ${category === value ? "active" : ""}`}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {value === "all"
                ? text("全部能力", "All capabilities")
                : language === "en-US"
                  ? (CATEGORY_EN[value] ?? value)
                  : value}
            </button>
          ))}
        </section>
        <section
          className="mb-5 flex flex-wrap items-center gap-3"
          aria-label={text("接口筛选", "API filters")}
        >
          <label className="relative min-w-56 flex-1 md:max-w-lg">
            <Search
              width={14}
              height={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              className="field pl-9"
              aria-label={text("搜索接口或参数", "Search APIs or parameters")}
              placeholder={text(
                "搜索端点、参数、identifier 或 operation_code……",
                "Search endpoint, parameter, identifier or operation_code…",
              )}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          <div
            className="segmented"
            role="group"
            aria-label={text("请求方法", "Request method")}
          >
            <button
              type="button"
              className={method === "all" ? "active" : ""}
              aria-pressed={method === "all"}
              onClick={() => setMethod("all")}
            >
              {text("全部", "All")}
            </button>
            <button
              type="button"
              className={method === "POST" ? "active" : ""}
              aria-pressed={method === "POST"}
              onClick={() => setMethod("POST")}
            >
              POST
            </button>
            <button
              type="button"
              className={method === "GET" ? "active" : ""}
              aria-pressed={method === "GET"}
              onClick={() => setMethod("GET")}
            >
              GET
            </button>
          </div>
          <span className="text-[10px] text-muted">
            {text("显示", "Showing")} {visibleCount}/{total}
          </span>
        </section>

        {visibleCapabilities.length > 0 && (
          <section
            className="mb-5 grid gap-4 xl:grid-cols-2"
            aria-label="MXAPI 非音乐接口列表"
          >
            {visibleCapabilities.map((capability) => (
              <MxapiCapabilityCard
                key={capability.id}
                capability={capability}
                onNavigate={onNavigate}
              />
            ))}
          </section>
        )}
        {visibleSuno.length > 0 && (
          <section
            className="grid gap-4 xl:grid-cols-2"
            aria-label="Suno V2 接口列表"
          >
            {visibleSuno.map((endpoint) => (
              <ContractCard
                key={endpoint.id}
                endpoint={endpoint}
                onNavigate={onNavigate}
              />
            ))}
          </section>
        )}
        {!visibleCount && (
          <div className="empty-state !min-h-64">
            <Search width={22} height={22} />
            <h2>{text("没有匹配的接口", "No matching APIs")}</h2>
            <p>
              {text(
                "尝试搜索端点路径、参数名、identifier、operation_code，或清空筛选条件。",
                "Search by endpoint path, parameter name, identifier or operation_code, or clear the filters.",
              )}
            </p>
          </div>
        )}
        <footer className="mt-7 rounded-2xl border border-amber-400/15 bg-amber-400/[0.045] p-4 text-[11px] leading-5 text-amber-100/80">
          <strong className="text-amber-100">
            {text("执行边界", "Execution boundary")}
          </strong>
          <p className="mt-1">
            {text(
              "当前生产执行器已完整接入 Suno 和管理员成本诊断。NANO、GPT Image、即梦、Seedance、Grok 与 Veo 已登记文档和 4 倍价格；在 ModelCross 通用媒体执行网关、任务存储、OSS 持久化和按量结算全部完成前，不会伪装成可执行按钮。",
              "Suno and administrator diagnostics are connected. Local MV Studio supports video generation and assembly. NANO, GPT Image, Jimeng, Seedance, Grok and Veo have documented contracts and 4× prices; they will not be presented as executable until the ModelCross media gateway, task storage, OSS persistence and usage billing are complete.",
            )}
          </p>
        </footer>
      </div>
    </div>
  );
}

function MxapiCapabilityCard({
  capability,
  onNavigate,
}: {
  capability: MxapiCapabilityProfile;
  onNavigate: (view: View) => void;
}) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const pricingLabel =
    capability.pricingKind === "fixed"
      ? `${capability.providerPoints ?? "—"} Provider ${text("点", "points")} × ${capability.markupMultiplier} = ${capability.estimatedCredits ?? "—"} ${text("积分", "credits")}`
      : capability.pricingKind === "dynamic"
        ? text("动态服务端报价 × 4", "Dynamic server quote × 4")
        : capability.pricingKind === "free"
          ? text("查询免费", "Free query")
          : text("已下线", "Deprecated");
  const statusLabel = capability.executable
    ? text("可执行", "Executable")
    : capability.pricingKind === "deprecated"
      ? text("已下线", "Deprecated")
      : capability.pricingKind === "dynamic"
        ? text("动态报价", "Dynamic quote")
        : capability.pricingKind === "free"
          ? text("查询免费", "Free query")
          : capability.catalogAvailable
            ? text("价格已同步", "Price synced")
            : text("待接入", "Pending integration");
  return (
    <article className="surface-card overflow-hidden">
      <div className="border-b border-[var(--line)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`status-chip ${capability.method === "GET" ? "tone-accent" : "tone-success"}`}
              >
                {capability.method}
              </span>
              <span className="status-chip">{capability.category}</span>
              <code className="break-all text-[11px] text-main">
                {capability.path}
              </code>
            </div>
            <h2 className="mt-2 text-sm font-semibold text-main">
              {capabilityTitle(capability, language)}
            </h2>
            <p className="mt-1 text-[11px] leading-5 text-muted">
              {capabilityDescription(capability, language)}
            </p>
          </div>
          <span
            className={`status-chip ${capability.executable ? "tone-success" : capability.pricingKind === "deprecated" ? "tone-danger" : "tone-warning"}`}
          >
            {statusLabel}
          </span>
        </div>
        <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2">
          <div className="capability-contract-metric">
            <span>Provider identifier</span>
            <code>{capability.identifier ?? "—"}</code>
          </div>
          <div className="capability-contract-metric">
            <span>{text("ModelCross 售价", "ModelCross price")}</span>
            <strong>{pricingLabel}</strong>
          </div>
          {capability.operationCode && (
            <div className="capability-contract-metric sm:col-span-2">
              <span>operation_code / price_version</span>
              <code>
                {capability.operationCode} ·{" "}
                {capability.priceVersion ??
                  text("目录待发布", "Catalog pending")}
              </code>
            </div>
          )}
        </div>
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="label">
            {text("请求参数", "Request parameters")}（{capability.fields.length}
            ）
          </h3>
          <span className="text-[10px] text-muted">
            {text("入参原名保留", "Original names retained")}
          </span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="w-full min-w-[560px] text-left text-[10px]">
            <thead className="bg-[var(--surface-2)] text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">
                  {text("字段", "Field")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {text("类型", "Type")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {text("必填", "Required")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {text("默认/可选", "Default / options")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {text("说明", "Description")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {capability.fields.map((field) => (
                <tr key={field.name}>
                  <td className="px-3 py-2 font-mono text-main">
                    {field.name}
                  </td>
                  <td className="px-3 py-2 text-muted">{field.type}</td>
                  <td className="px-3 py-2">
                    {field.required ? (
                      <span className="text-rose-300">{text("是", "Yes")}</span>
                    ) : (
                      <span className="text-muted">{text("否", "No")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {field.defaultValue ?? field.options?.join(" / ") ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {capabilityFieldDescription(field.description, language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)]">
          <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold text-main">
            {text("响应与执行状态", "Response & execution status")}
          </summary>
          <div className="space-y-2 border-t border-[var(--line)] px-3 py-3 text-[10px] leading-5 text-muted">
            <p>
              <strong className="text-main">
                {text("响应：", "Response:")}
              </strong>
              {capability.result}
            </p>
            <p>
              <strong className="text-main">{text("状态：", "Status:")}</strong>
              {capability.reason ??
                capability.note ??
                text(
                  "已接入当前账号执行器",
                  "Connected to this account’s executor",
                )}
            </p>
            {capability.executable ? (
              <button
                type="button"
                className="btn-ghost border !border-[var(--line)] text-xs"
                onClick={() => onNavigate(capability.uiRoute ?? "settings")}
              >
                {capability.uiRoute === "mv" ? text("打开 MV 工作室", "Open MV Studio") : text("打开 Provider 诊断", "Open Provider diagnostics")}{" "}
                <ArrowRight width={12} height={12} />
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-warning">
                <Refresh width={11} height={11} />{" "}
                {text(
                  "等待 ModelCross 执行网关发布",
                  "Waiting for the ModelCross execution gateway",
                )}
              </span>
            )}
          </div>
        </details>
      </div>
    </article>
  );
}

function ContractCard({
  endpoint,
  onNavigate,
}: {
  endpoint: SunoContractEndpoint;
  onNavigate: (view: View) => void;
}) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const route =
    endpoint.route === "create"
      ? text("创作工作台", "Creation workbench")
      : endpoint.route === "tasks"
        ? text("任务中心", "Task center")
        : endpoint.route === "library"
          ? text("作品库 / 作品详情", "Library / track details")
          : text("设置 / Provider 诊断", "Settings / Provider diagnostics");
  return (
    <article className="surface-card overflow-hidden">
      <div className="border-b border-[var(--line)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`status-chip ${endpoint.method === "GET" ? "tone-accent" : "tone-success"}`}
              >
                {endpoint.method}
              </span>
              <span className="status-chip">Suno</span>
              <code className="break-all text-[11px] text-main">
                {endpoint.path}
              </code>
            </div>
            <h2 className="mt-2 text-sm font-semibold text-main">
              {contractText(endpoint.title, language)}
            </h2>
            <p className="mt-1 text-[11px] leading-5 text-muted">
              {contractText(endpoint.description, language)}
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost shrink-0 border !border-[var(--line)] text-[11px]"
            onClick={() => onNavigate(endpoint.route)}
          >
            {route} <ArrowRight width={12} height={12} />
          </button>
        </div>
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="label">
            {text("参数", "Parameters")}（{endpoint.fields.length}）
          </h3>
          <span className="text-[10px] text-muted">
            {text("服务端严格校验", "Strict server validation")}
          </span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="w-full min-w-[520px] text-left text-[10px]">
            <thead className="bg-[var(--surface-2)] text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">
                  {text("字段", "Field")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {text("类型", "Type")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {text("必填", "Required")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {text("默认 / 条件", "Default / condition")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {text("UI 映射", "UI mapping")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {endpoint.fields.map((field) => (
                <tr key={field.name}>
                  <td className="px-3 py-2 font-mono text-main">
                    {field.name}
                  </td>
                  <td className="px-3 py-2 text-muted">{field.type}</td>
                  <td className="px-3 py-2">
                    {field.required ? (
                      <span className="text-rose-300">{text("是", "Yes")}</span>
                    ) : (
                      <span className="text-muted">{text("否", "No")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {field.defaultValue ??
                      (field.condition
                        ? contractText(field.condition, language)
                        : "—")}
                  </td>
                  <td className="px-3 py-2 text-accent-soft">
                    {field.wire
                      ? contractText(field.wire, language)
                      : text("服务端生成", "Generated by server")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)]">
          <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold text-main">
            {text("结果与安全边界", "Results & security boundary")}
          </summary>
          <div className="space-y-2 border-t border-[var(--line)] px-3 py-3 text-[10px] leading-5 text-muted">
            <p>
              <strong className="text-main">{text("结果：", "Result:")}</strong>
              {contractText(endpoint.result, language)}
            </p>
            <p>
              <strong className="text-main">
                {text("入口：", "UI entry:")}
              </strong>
              {contractText(endpoint.ui, language)}
            </p>
            <p>
              {text(
                "任务、clip_id、Provider record id 均从当前账号的服务端作品记录派生，不能手动越权填写。",
                "Task, clip_id and Provider record ids are derived from this account’s server records and cannot be filled in to bypass access controls.",
              )}
            </p>
          </div>
        </details>
      </div>
    </article>
  );
}
