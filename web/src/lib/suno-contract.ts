export type SunoContractField = {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  condition?: string;
  wire?: string;
};

export type SunoContractEndpoint = {
  id: string;
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
  fields: SunoContractField[];
  result: string;
  ui: string;
  route: "create" | "tasks" | "library" | "settings";
};

const f = (
  name: string,
  type: string,
  required: boolean,
  options: Partial<SunoContractField> = {},
): SunoContractField => ({ name, type, required, ...options });

/** Browser-safe, key-free projection of docs/mxapi-suno-v2-contract.md. */
export const SUNO_V2_CONTRACT: SunoContractEndpoint[] = [
  {
    id: "generate",
    method: "POST",
    path: "/api/v2/music/generate",
    title: "双版本音乐生成",
    description:
      "灵感、自定义歌词、纯音乐，以及 extend / upload_extend / cover 三种任务模式。",
    fields: [
      f("gpt_description_prompt", "string", false, {
        condition: "灵感模式",
        wire: "description",
      }),
      f("prompt", "string", false, {
        condition: "自定义歌词模式",
        wire: "lyrics",
      }),
      f("tags", "string", false, {
        condition: "自定义歌词模式",
        wire: "style",
      }),
      f("negative_tags", "string", false, { wire: "negativeTags" }),
      f("mv", "string", false, {
        condition: "Provider 可选；MuseFlow 服务端按模型目录归一化",
        wire: "model",
      }),
      f("title", "string", false, { wire: "title" }),
      f("make_instrumental", "boolean", false, {
        condition: "Provider 可选；MuseFlow 默认归一化为 false",
        wire: "instrumental",
      }),
      f("task", "string", false, {
        condition: "extend | upload_extend | cover",
        wire: "操作对话框",
      }),
      f("continue_clip_id", "string", false, {
        condition: "extend / upload_extend",
        wire: "作品 customId",
      }),
      f("continue_at", "number", false, {
        condition: "extend / upload_extend",
        wire: "续作起点（秒）",
      }),
      f("cover_clip_id", "string", false, {
        condition: "cover",
        wire: "作品 customId",
      }),
      f("metadata.is_max_mode", "boolean", false, { wire: "isMaxMode；双倍费用独立报价" }),
      f("metadata.control_sliders.aug_creativity", "number 0..4", false, { wire: "augCreativity" }),
      f("metadata", "object", false, {
        condition: "V4.5+；包含下方高级字段",
        wire: "服务端按 UI 参数组装",
      }),
      f("metadata.create_mode", "simple | custom", false, {
        condition: "V4.5+；由创作模式映射",
        wire: "灵感 / 自定义模式",
      }),
      f("metadata.vocal_gender", "m | f", false, {
        condition: "非纯音乐且模型支持声线",
        wire: "男声 / 女声",
      }),
      f("metadata.control_sliders.style_weight", "number 0..1", false, {
        condition: "V4.5+",
        wire: "风格强度",
      }),
      f("metadata.control_sliders.weirdness_constraint", "number 0..1", false, {
        condition: "V4.5+",
        wire: "创意度",
      }),
      f("metadata.control_sliders.audio_weight", "number 0..1", false, {
        condition: "上传音频续作或上传音频翻唱",
        wire: "参考音频权重",
      }),
      f("metadata.can_control_sliders", "string[]", false, {
        condition: "V4.5+；服务端按实际发送滑杆派生",
        wire: "能力声明（非用户输入）",
      }),
    ],
    result: "data.task_ids（两个 Provider task id）",
    ui: "创作工作台 + 作品详情的续写/翻唱对话框",
    route: "create",
  },
  {
    id: "sound",
    method: "POST",
    path: "/api/v2/music/sound",
    title: "音效生成",
    description: "Suno V5 / V5.5 音效双版本生成，字段与文档逐项对应。",
    fields: [
      f("title", "string ≤ 100", true, { wire: "音效标题" }),
      f("tags", "string ≤ 1000", true, { wire: "音效风格与描述" }),
      f("mv", "chirp-crow | chirp-fenix", true, { wire: "音效模型" }),
      f("tempo", "number", false, { defaultValue: "99", wire: "BPM" }),
      f("key", "string", false, { defaultValue: "D", wire: "调性" }),
      f("loop", "boolean", false, { defaultValue: "true", wire: "无缝循环" }),
    ],
    result: "data.task_ids（两个 Provider task id）",
    ui: "创作工作台 → 音效",
    route: "create",
  },
  {
    id: "task",
    method: "GET",
    path: "/api/v2/music/task?id=…",
    title: "单任务查询",
    description: "查询单个 Provider task 的状态、文件、积分成本与退款信息。",
    fields: [f("id", "string", true, { wire: "任务中心查询框" })],
    result:
      "data.id / task_id / result.status / result.custom_id / fileInfo / extend / points_cost / points_refunded",
    ui: "任务中心 → 文档查询面板",
    route: "tasks",
  },
  {
    id: "tasks",
    method: "GET",
    path: "/api/v2/music/tasks?ids=…&page=…&size=…",
    title: "批量任务查询",
    description:
      "按逗号分隔的 Provider task id 分页查询，只返回当前账号拥有的任务。",
    fields: [
      f("ids", "comma-separated string", true, { wire: "任务 ID 列表" }),
      f("page", "integer", false, { defaultValue: "1", wire: "页码" }),
      f("size", "integer", false, { defaultValue: "10", wire: "每页数量" }),
    ],
    result: "items / total / page / pageSize",
    ui: "任务中心 → 文档查询面板",
    route: "tasks",
  },
  {
    id: "upload",
    method: "POST",
    path: "/api/v2/music/upload",
    title: "参考音频上传",
    description:
      "由 MuseFlow 先写入私有 OSS，再由服务端生成 Provider 可访问的签名 URL。",
    fields: [
      f("audio_url", "https URL", true, { wire: "私有上传后端托管" }),
      f("copyrightAudio", "boolean", false, {
        defaultValue: "false",
        wire: "版权音频声明",
      }),
    ],
    result: "data.task_id",
    ui: "创作工作台 → 参考音频 / 设置 → 私有参考音频",
    route: "create",
  },
  {
    id: "whole-song",
    method: "POST",
    path: "/api/v2/music/whole-song",
    title: "完整歌曲",
    description: "将已完成片段扩展成完整歌曲，不覆盖原作。",
    fields: [f("clip_id", "string", true, { wire: "作品 customId" })],
    result: "data.task_id",
    ui: "作品详情 → 继续创作 → 完整歌曲",
    route: "library",
  },
  {
    id: "aligned-lyrics",
    method: "POST",
    path: "/api/v2/music/aligned-lyrics",
    title: "逐字对齐歌词",
    description: "按歌词文本生成带时间戳的 alignment 资产。",
    fields: [
      f("lyrics", "string", true, { wire: "对齐歌词文本" }),
      f("suno_id", "string", true, { wire: "作品 customId" }),
    ],
    result:
      "extend JSON：state / alignment[word,start_s,end_s,success,p_align]",
    ui: "作品详情 → AI 与媒体资产 → 逐字歌词",
    route: "library",
  },
  {
    id: "upsample",
    method: "POST",
    path: "/api/v2/music/upsample",
    title: "高清重制",
    description:
      "按模型映射提交 V4–V5.5 Remaster；V5/V5.5 可选择 variation_category。",
    fields: [
      f("clip_id", "string", true, { wire: "作品 customId" }),
      f(
        "model_name",
        "chirp-up | chirp-bass | chirp-carp | chirp-flounder",
        true,
        { wire: "由作品模型映射" },
      ),
      f("variation_category", "subtle | normal | high", false, {
        condition: "V5 / V5.5",
        wire: "变化程度",
      }),
    ],
    result: "data.task_ids（两个 Provider task id）",
    ui: "作品详情 → 继续创作 → 高清重制",
    route: "library",
  },
  {
    id: "video",
    method: "POST",
    path: "/api/v2/music/video",
    title: "音乐视频",
    description: "用 Provider 数字记录 id 与 Suno custom id 创建视频资产。",
    fields: [
      f("task_id", "positive integer", true, { wire: "作品 providerRecordId" }),
      f("suno_id", "string", true, { wire: "作品 customId" }),
    ],
    result: "extend JSON：video_url",
    ui: "作品详情 → AI 与媒体资产 → 音乐视频",
    route: "library",
  },
  {
    id: "convert-wav",
    method: "POST",
    path: "/api/v2/music/download-wav",
    title: "WAV 转换",
    description: "创建无损 WAV 资产；Provider 地址不会暴露给浏览器。",
    fields: [
      f("suno_id", "string", true, { wire: "作品 customId" }),
    ],
    result: "extend JSON：wav_file_url",
    ui: "作品详情 → AI 与媒体资产 → WAV",
    route: "library",
  },
  ...(["mp3", "m4a"] as const).map(format => ({
    id: `download-${format}`, method: "POST" as const, path: `/api/v2/music/download-${format}`,
    title: `${format.toUpperCase()} 下载`, description: "通过 custom_id 创建下载任务，并保存为私有资产。",
    fields: [f("suno_id", "string", true, { wire: "作品 customId" })],
    result: `extend JSON：${format}_file_url`, ui: "作品详情 → AI 与媒体资产", route: "library" as const,
  })),
  {
    id: "crop",
    method: "POST",
    path: "/api/v2/music/crop",
    title: "裁剪片段",
    description: "按起止秒数创建新版本，结束时间必须严格大于开始时间。",
    fields: [
      f("clip_id", "string", true, { wire: "作品 customId" }),
      f("crop_start_s", "number ≥ 0", true, { wire: "开始秒数" }),
      f("crop_end_s", "number > crop_start_s", true, { wire: "结束秒数" }),
    ],
    result: "data.task_id",
    ui: "作品详情 → 编辑与版本 → 裁剪",
    route: "library",
  },
  {
    id: "speed",
    method: "POST",
    path: "/api/v2/music/speed",
    title: "变速",
    description: "只允许文档列出的倍率，可选保持音高与新标题。",
    fields: [
      f("clip_id", "string", true, { wire: "作品 customId" }),
      f("speed_multiplier", "0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2", true, {
        wire: "速度倍率",
      }),
      f("keep_pitch", "boolean", false, {
        defaultValue: "true",
        wire: "保持原音高",
      }),
      f("title", "string", false, { wire: "新版本标题" }),
    ],
    result: "data.task_id",
    ui: "作品详情 → 编辑与版本 → 变速",
    route: "library",
  },
  {
    id: "points-balance",
    method: "GET",
    path: "/api/v2/points/balance",
    title: "Provider 积分余额",
    description:
      "读取部署商户的 MXAPI V2 积分余额，仅供管理员健康诊断，不代表用户钱包。",
    fields: [],
    result: "data.remaining_points",
    ui: "设置 → 模型连接 → Provider 诊断",
    route: "settings",
  },
  {
    id: "points-logs",
    method: "GET",
    path: "/api/v2/points/logs?page=…&pageSize=…",
    title: "Provider 积分日志",
    description: "分页读取部署商户的 MXAPI V2 积分变动记录，仅供管理员对账。",
    fields: [
      f("page", "integer ≥ 1", false, {
        defaultValue: "1",
        wire: "Provider 诊断页码",
      }),
      f("pageSize", "integer 1..100", false, {
        defaultValue: "20",
        wire: "Provider 诊断每页数量",
      }),
    ],
    result: "data.list / data.pagination（page、pageSize、total、totalPages）",
    ui: "设置 → 模型连接 → Provider 诊断",
    route: "settings",
  },
];

export const SUNO_V2_ENDPOINT_COUNT = 14;
