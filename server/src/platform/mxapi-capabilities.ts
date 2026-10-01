export type MxapiCapabilityField = {
  name: string;
  type: string;
  required: boolean;
  description: string;
  defaultValue?: string;
  options?: string[];
};

export type MxapiCapabilityDefinition = {
  id: string;
  category: 'NANO' | 'GPT' | '即梦' | 'Seedance视频' | 'Grok' | 'Veo' | '商品套图' | '系统通用';
  title: string;
  description: string;
  method: 'GET' | 'POST';
  path: string;
  identifier: string | null;
  operationCode: string | null;
  pricingKind: 'fixed' | 'dynamic' | 'free' | 'deprecated';
  providerPoints: number | null;
  fallbackCredits: number | null;
  implemented: boolean;
  fields: MxapiCapabilityField[];
  result: string;
  note?: string;
};

const field = (
  name: string,
  type: string,
  required: boolean,
  description: string,
  options: Partial<Pick<MxapiCapabilityField, 'defaultValue' | 'options'>> = {},
): MxapiCapabilityField => ({ name, type, required, description, ...options });

const asyncImageResult = 'data.task_id；查询完成后 result.images[] 返回图片 URL，失败返回 error_msg / points_refunded';
const asyncVideoResult = 'data.task_id；查询完成后返回 status / video_url / points_cost / points_refunded';
const imageFields = [
  field('prompt', 'string', true, '文本提示词'),
  field('reference_images', 'string[]', false, '参考图片 URL 数组', { defaultValue: '[]' }),
];
const nanoFields = [
  field('prompt', 'string', true, '文本提示词'),
  field('image_size', '1K | 2K | 4K', false, '图片分辨率', { defaultValue: '1K' }),
  field('aspect_ratio', 'string', false, '1:1、3:4、4:3、3:2、2:3、9:16、16:9、21:9'),
  field('reference_images', 'string[]', false, '参考图片 URL 数组', { defaultValue: '[]' }),
  field('header:X-Channel', 'string', false, '通道标识符；不传使用 default'),
];
const seedanceFields = [
  field('content', 'array', true, 'text / image_url / video_url / audio_url；role 支持首帧、尾帧和多模态参考'),
  field('resolution', 'string', false, '输出分辨率', { defaultValue: '720p', options: ['480p', '720p', '1080p'] }),
  field('ratio', 'string', false, '视频宽高比', { defaultValue: 'adaptive' }),
  field('duration', 'number', false, '输出秒数；不同模型为 4–15、4–30 或 -1 智能选择'),
  field('generate_audio', 'boolean', false, '是否生成音频', { defaultValue: 'false' }),
  field('return_last_frame', 'boolean', false, '是否返回末帧', { defaultValue: 'false' }),
  field('tools', 'array', false, '工具配置，例如 web_search', { defaultValue: '[]' }),
  field('header:X-Channel', 'string', false, '通道标识符；不传使用 default'),
];

export const MXAPI_NON_MUSIC_CAPABILITIES: readonly MxapiCapabilityDefinition[] = [
  {
    id: 'nano-standard', category: 'NANO', title: 'Nano Banana 标准绘画', description: 'gemini-2.5-flash-image 文生图/多图参考。',
    method: 'POST', path: '/api/v2/nano', identifier: 'ai.draw', operationCode: 'image_nano_standard', pricingKind: 'fixed', providerPoints: 6, fallbackCredits: 24, implemented: false,
    fields: imageFields, result: asyncImageResult,
  },
  {
    id: 'nano-pro', category: 'NANO', title: 'Nano Banana Pro V2', description: '支持 1K/2K/4K、自定义比例和参考图。',
    method: 'POST', path: '/api/v2/nano-pro', identifier: 'ai.gemini3pro.v2', operationCode: 'image_nano_pro_v2', pricingKind: 'fixed', providerPoints: 20, fallbackCredits: 80, implemented: false,
    fields: nanoFields, result: asyncImageResult,
  },
  {
    id: 'nano-pro-legacy', category: 'NANO', title: 'Nano Banana Pro 兼容接口', description: '旧 Nano Pro 同步兼容入口；新接入优先使用 /nano-pro。',
    method: 'POST', path: '/api/v2/images/gemini3pro', identifier: 'ai.gemini3draw', operationCode: 'image_nano_pro_legacy', pricingKind: 'fixed', providerPoints: 18, fallbackCredits: 72, implemented: false,
    fields: nanoFields, result: '同步响应中的图片 URL / 图片数据；客户端超时建议至少 10 分钟', note: '兼容入口，保留价格和参数可见性。',
  },
  {
    id: 'nano2', category: 'NANO', title: 'Nano Banana 2', description: 'gemini-3.1-flash-image-preview，支持通道、分辨率、比例和参考图。',
    method: 'POST', path: '/api/v2/nano2', identifier: 'ai.nano2', operationCode: 'image_nano2', pricingKind: 'fixed', providerPoints: 20, fallbackCredits: 80, implemented: false,
    fields: nanoFields, result: asyncImageResult,
  },
  {
    id: 'nano2-lite', category: 'NANO', title: 'Nano Banana 2 Lite', description: '轻量绘画模型，仅 1K，最多 10 张参考图。',
    method: 'POST', path: '/api/v2/nano2-lite', identifier: 'ai.nano2.lite', operationCode: 'image_nano2_lite', pricingKind: 'fixed', providerPoints: 15, fallbackCredits: 60, implemented: false,
    fields: nanoFields.map((entry) => entry.name === 'image_size' ? { ...entry, type: '1K', defaultValue: '1K' } : entry), result: asyncImageResult,
  },
  {
    id: 'nano-task', category: 'NANO', title: '查询 NANO 绘画任务', description: '查询 nano / nano-pro / nano2 系列任务。',
    method: 'GET', path: '/api/v2/nano/task', identifier: null, operationCode: null, pricingKind: 'free', providerPoints: 0, fallbackCredits: 0, implemented: false,
    fields: [field('task_id', 'string', true, '内部任务 ID')], result: 'data.task_id / task_type / status / result.images[] / error_msg / created_at / updated_at',
  },
  {
    id: 'gpt-image-2', category: 'GPT', title: 'GPT Image 2', description: '支持自定义尺寸、比例、质量、分辨率和参考图。',
    method: 'POST', path: '/api/v2/gpt-image-2', identifier: 'ai.gptimage2', operationCode: 'image_gpt_2', pricingKind: 'fixed', providerPoints: 10, fallbackCredits: 40, implemented: false,
    fields: [field('prompt', 'string', true, '生成或编辑提示词'), field('image_size', 'WIDTHxHEIGHT', false, '16 的倍数；比例不超过 3:1；总像素 655360–8294400'), field('aspect_ratio', 'string', false, '预设宽高比', { defaultValue: '1:1' }), field('quality', 'low | medium | high | auto', false, '渲染质量', { defaultValue: 'auto' }), field('resolution', '1K | 2K | 4K', false, '分辨率档位', { defaultValue: '1K' }), field('reference_images', 'string[]', false, '参考图片 URL', { defaultValue: '[]' }), field('header:X-Channel', 'string', false, '通道标识符')], result: asyncImageResult,
  },
  {
    id: 'gpt-image-task', category: 'GPT', title: '查询 GPT Image 任务', description: '查询 GPT Image 2 任务状态和图片结果。',
    method: 'GET', path: '/api/v2/gpt-image/task', identifier: null, operationCode: null, pricingKind: 'free', providerPoints: 0, fallbackCredits: 0, implemented: false,
    fields: [field('task_id', 'string', true, '任务 ID')], result: 'data.task_id / task_type / status / result.images[] / created_at / updated_at',
  },
  {
    id: 'jimeng-40', category: '即梦', title: '即梦绘画 4.0', description: 'Seedream 4.0，支持 2K/4K 与参考图。',
    method: 'POST', path: '/api/v2/draw-pro', identifier: 'ai.drawpro', operationCode: 'image_jimeng_40', pricingKind: 'fixed', providerPoints: 16, fallbackCredits: 64, implemented: false,
    fields: [...imageFields, field('model', 'string', false, 'doubao-seedream-4-0-250828'), field('size', '2K | 4K', false, '图片尺寸', { defaultValue: '2K' })], result: asyncImageResult,
  },
  {
    id: 'jimeng-45', category: '即梦', title: '即梦绘画 4.5', description: 'Seedream 4.5，支持 2K/4K 与参考图。',
    method: 'POST', path: '/api/v2/draw-4-5', identifier: 'ai.draw45', operationCode: 'image_jimeng_45', pricingKind: 'fixed', providerPoints: 18, fallbackCredits: 72, implemented: false,
    fields: [...imageFields, field('model', 'string', false, 'doubao-seedream-4-5-251128'), field('size', '2K | 4K', false, '图片尺寸', { defaultValue: '2K' })], result: asyncImageResult,
  },
  {
    id: 'jimeng-50', category: '即梦', title: '即梦绘画 5.0', description: 'Seedream 5.0，支持联网搜索和 JPEG/PNG。',
    method: 'POST', path: '/api/v2/draw-5-0', identifier: 'ai.draw50', operationCode: 'image_jimeng_50', pricingKind: 'fixed', providerPoints: 25, fallbackCredits: 100, implemented: false,
    fields: [...imageFields, field('model', 'string', false, 'doubao-seedream-5-0-260128'), field('size', '2K | 3K', false, '图片尺寸', { defaultValue: '2K' }), field('web_search', 'boolean', false, '联网搜索', { defaultValue: 'false' }), field('output_format', 'jpeg | png', false, '输出格式', { defaultValue: 'jpeg' })], result: asyncImageResult,
  },
  {
    id: 'jimeng-four-images', category: '即梦', title: '即梦 4.5 四图', description: '旧四图并发接口。',
    method: 'POST', path: '/api/v2/draw-4-5-four-images', identifier: null, operationCode: null, pricingKind: 'deprecated', providerPoints: null, fallbackCredits: null, implemented: false,
    fields: [...imageFields, field('model', 'jimeng-4.5', false, '旧模型名')], result: asyncImageResult, note: '文档已标记下线，不提供执行入口。',
  },
  {
    id: 'jimeng-draw-task', category: '即梦', title: '查询即梦绘画任务', description: '查询 draw-pro / draw-4-5 / draw-5-0 状态。',
    method: 'GET', path: '/api/v2/draw/task', identifier: null, operationCode: null, pricingKind: 'free', providerPoints: 0, fallbackCredits: 0, implemented: false,
    fields: [field('task_id', 'string', true, '任务 ID')], result: 'data.task_id / task_type / status / result.images[] / error_msg',
  },
  {
    id: 'jimeng-video', category: '即梦', title: '即梦视频生成', description: '文生、图生、首尾帧；参数通过 content 和文本后缀控制。',
    method: 'POST', path: '/api/v2/video/generate', identifier: 'ai.video', operationCode: null, pricingKind: 'dynamic', providerPoints: 0, fallbackCredits: null, implemented: false,
    fields: [field('model', 'string', true, 'Seedance 1.0 Fast 或 1.5 Pro'), field('content', 'array', true, 'text / image_url 内容数组'), field('--ratio', 'string', false, '追加在 text 末尾', { defaultValue: '16:9' }), field('--rs', '480p | 720p | 1080p', false, '追加在 text 末尾', { defaultValue: '1080p' }), field('--dur', 'number 2..12', false, '追加在 text 末尾', { defaultValue: '5' })], result: asyncVideoResult, note: 'channel-points 为 0 代表按分辨率与秒数动态报价，不可按免费处理。',
  },
  {
    id: 'seedance-20', category: 'Seedance视频', title: 'Seedance 2.0', description: '图、视频、音频多模态参考，支持生成音频和末帧。',
    method: 'POST', path: '/api/v2/video/seedance2', identifier: 'ai.video.seedance2', operationCode: null, pricingKind: 'dynamic', providerPoints: 0, fallbackCredits: null, implemented: false,
    fields: seedanceFields, result: asyncVideoResult, note: '按 completion token、输入类型、分辨率和时长动态结算，再执行 4 倍售价策略。',
  },
  {
    id: 'seedance-25', category: 'Seedance视频', title: 'Seedance 2.5', description: '支持 4–30 秒、视频编辑/延长、纯音频参考和 mp4/mov。',
    method: 'POST', path: '/api/v2/video/seedance2-5', identifier: 'ai.video.seedance25', operationCode: null, pricingKind: 'dynamic', providerPoints: 0, fallbackCredits: null, implemented: false,
    fields: [...seedanceFields, field('camera_fixed', 'boolean', false, '固定镜头', { defaultValue: 'false' }), field('output_format', 'mp4 | mov', false, '输出格式', { defaultValue: 'mp4' })], result: asyncVideoResult,
  },
  {
    id: 'seedance-fast', category: 'Seedance视频', title: 'Seedance 2.0 Fast', description: '低延迟版本，支持 480p/720p 和多模态参考。',
    method: 'POST', path: '/api/v2/video/seedance2-fast', identifier: 'ai.video.seedance2fast', operationCode: null, pricingKind: 'dynamic', providerPoints: 0, fallbackCredits: null, implemented: false,
    fields: seedanceFields, result: asyncVideoResult,
  },
  {
    id: 'seedance-mini', category: 'Seedance视频', title: 'Seedance 2.0 Mini', description: '轻量低成本版本，支持 480p/720p。',
    method: 'POST', path: '/api/v2/video/seedance2-mini', identifier: 'ai.video.seedance2mini', operationCode: null, pricingKind: 'dynamic', providerPoints: 0, fallbackCredits: null, implemented: false,
    fields: seedanceFields, result: asyncVideoResult,
  },
  {
    id: 'video-task', category: 'Seedance视频', title: '查询视频任务', description: '查询即梦/Seedance 异步视频任务。',
    method: 'GET', path: '/api/v2/video/task', identifier: null, operationCode: null, pricingKind: 'free', providerPoints: 0, fallbackCredits: 0, implemented: false,
    fields: [field('task_id', 'string', true, '视频任务 ID')], result: 'data.task_id / status / video_url / points_cost / points_refunded',
  },
  {
    id: 'grok-video', category: 'Grok', title: 'Grok 视频生成', description: '文生、单图图生和多图参考；按模型、分辨率和秒数收费。',
    method: 'POST', path: '/api/v2/video/grok', identifier: 'ai.video.grok', operationCode: null, pricingKind: 'dynamic', providerPoints: 0, fallbackCredits: null, implemented: false,
    fields: [field('prompt', 'string', true, '视频提示词'), field('model', 'grok-imagine-video | grok-imagine-video-1.5', false, '模型', { defaultValue: 'grok-imagine-video' }), field('aspect_ratio', 'string', false, '宽高比', { defaultValue: '16:9' }), field('video_length', 'string', false, '1–15 秒；多图参考 1–10 秒', { defaultValue: '10' }), field('resolution_name', '480p | 720p | 1080p', false, '输出分辨率', { defaultValue: '720p' }), field('refer_images', 'string[]', false, '垫图 URL 数组', { defaultValue: '[]' }), field('header:X-Channel', 'string', false, '通道标识符')], result: asyncVideoResult,
  },
  {
    id: 'grok-extend', category: 'Grok', title: 'Grok 视频扩展', description: '基于已有公开视频生成 1–10 秒续写片段。',
    method: 'POST', path: '/api/v2/video/grok/extend', identifier: 'ai.video.grok.extend', operationCode: null, pricingKind: 'dynamic', providerPoints: 0, fallbackCredits: null, implemented: false,
    fields: [field('prompt', 'string', true, '后续内容描述'), field('video', '{ url: string }', true, '最大 15 秒的视频输入'), field('duration', 'number 1..10', false, '扩展片段秒数', { defaultValue: '6' }), field('header:X-Channel', 'string', false, '通道标识符')], result: asyncVideoResult,
  },
  {
    id: 'grok-task', category: 'Grok', title: '查询 Grok 任务', description: '查询生成或扩展任务。',
    method: 'GET', path: '/api/v2/video/grok/task', identifier: null, operationCode: null, pricingKind: 'free', providerPoints: 0, fallbackCredits: 0, implemented: false,
    fields: [field('task_id', 'string', true, '内部任务 ID')], result: 'data.status / job_id / video_id / video_url / proxy_url / quota / points_cost / points_refunded',
  },
  {
    id: 'veo-generate', category: 'Veo', title: 'Veo 视频生成', description: 'Veo 3.1 文生、图生与多图融合；通道+模型动态定价。',
    method: 'POST', path: '/api/v2/veo/generate', identifier: 'ai.veo', operationCode: null, pricingKind: 'dynamic', providerPoints: 0, fallbackCredits: null, implemented: false,
    fields: [field('model', 'string', true, 'veo31 / veo31-fast / 1080p 变体'), field('prompt', 'string', true, '视频提示词'), field('aspectRatio', '16:9 | 9:16', false, '宽高比', { defaultValue: '16:9' }), field('images', 'string[]', false, '图片 URL 数组', { defaultValue: '[]' }), field('enableExtendImg', 'boolean', false, '扩图到目标比例', { defaultValue: 'false' }), field('enableTranslation', 'boolean', false, '自动翻译提示词', { defaultValue: 'false' }), field('header:X-Channel', 'string', false, '通道选择')], result: asyncVideoResult,
  },
  {
    id: 'veo2-fast', category: 'Veo', title: 'Veo 2 Fast 固定价档', description: 'channel-points 发布的 Veo 2 Fast 固定成本档。',
    method: 'POST', path: '/api/v2/veo/generate', identifier: 'ai.veo.generate.veo2fast', operationCode: 'video_veo2_fast', pricingKind: 'fixed', providerPoints: 20, fallbackCredits: 80, implemented: false,
    fields: [field('model', 'string', true, 'Veo 2 Fast 模型'), field('prompt', 'string', true, '视频提示词'), field('aspectRatio', '16:9 | 9:16', false, '宽高比'), field('images', 'string[]', false, '参考图片')], result: asyncVideoResult,
  },
  {
    id: 'veo3-fast', category: 'Veo', title: 'Veo 3 Fast 固定价档', description: 'channel-points 发布的 Veo 3 Fast 固定成本档。',
    method: 'POST', path: '/api/v2/veo/generate', identifier: 'ai.veo.generate.veo3fast', operationCode: 'video_veo3_fast', pricingKind: 'fixed', providerPoints: 40, fallbackCredits: 160, implemented: false,
    fields: [field('model', 'string', true, 'Veo 3 Fast 模型'), field('prompt', 'string', true, '视频提示词'), field('aspectRatio', '16:9 | 9:16', false, '宽高比'), field('images', 'string[]', false, '参考图片')], result: asyncVideoResult,
  },
  {
    id: 'veo-quality', category: 'Veo', title: 'Veo 高质量固定价档', description: 'channel-points 发布的 Veo 2/3 高质量固定成本档。',
    method: 'POST', path: '/api/v2/veo/generate', identifier: 'ai.veo.generate.quality', operationCode: 'video_veo_quality', pricingKind: 'fixed', providerPoints: 180, fallbackCredits: 720, implemented: false,
    fields: [field('model', 'string', true, 'Veo 高质量模型'), field('prompt', 'string', true, '视频提示词'), field('aspectRatio', '16:9 | 9:16', false, '宽高比'), field('images', 'string[]', false, '参考图片')], result: asyncVideoResult,
  },
  {
    id: 'veo-economy', category: 'Veo', title: 'Veo Economy 固定价档', description: 'channel-points 发布的 Veo Economy 固定成本档。',
    method: 'POST', path: '/api/v2/veo/generate', identifier: 'ai.veo.generate.economy', operationCode: 'video_veo_economy', pricingKind: 'fixed', providerPoints: 50, fallbackCredits: 200, implemented: false,
    fields: [field('model', 'string', true, 'Veo Economy 模型'), field('prompt', 'string', true, '视频提示词'), field('aspectRatio', '16:9 | 9:16', false, '宽高比'), field('images', 'string[]', false, '参考图片')], result: asyncVideoResult,
  },
  {
    id: 'veo-task', category: 'Veo', title: '查询 Veo 任务', description: '查询 Veo 视频结果。',
    method: 'GET', path: '/api/v2/veo/task', identifier: null, operationCode: null, pricingKind: 'free', providerPoints: 0, fallbackCredits: 0, implemented: false,
    fields: [field('task_id', 'string', true, '任务 ID')], result: 'data.status / video_url / points_cost / points_refunded',
  },
  {
    id: 'product-selling-points', category: '商品套图', title: '生成商品卖点', description: '从商品信息提炼卖点。',
    method: 'POST', path: 'ModelCross 商品套图能力', identifier: 'ai.product.selling_points', operationCode: 'product_selling_points', pricingKind: 'fixed', providerPoints: 3, fallbackCredits: 12, implemented: false,
    fields: [field('product', 'object', true, '商品标题、属性与描述')], result: '结构化 selling_points[]',
  },
  {
    id: 'product-plan', category: '商品套图', title: '生成策划方案', description: '生成商品视觉策划和镜头方案。',
    method: 'POST', path: 'ModelCross 商品套图能力', identifier: 'ai.product.plan', operationCode: 'product_plan', pricingKind: 'fixed', providerPoints: 3, fallbackCredits: 12, implemented: false,
    fields: [field('product', 'object', true, '商品信息'), field('selling_points', 'array', false, '已生成卖点')], result: '结构化 plan / scenes[]',
  },
  {
    id: 'product-images', category: '商品套图', title: '生成商品套图', description: '按策划方案生成商品图片。',
    method: 'POST', path: 'ModelCross 商品套图能力', identifier: 'ai.product.images', operationCode: 'product_images', pricingKind: 'fixed', providerPoints: 22, fallbackCredits: 88, implemented: false,
    fields: [field('plan', 'object', true, '商品套图策划'), field('reference_images', 'string[]', false, '商品参考图')], result: '异步任务及 images[]',
  },
  {
    id: 'points-balance', category: '系统通用', title: 'Provider 积分余额', description: '部署商户成本诊断，不是用户钱包。',
    method: 'GET', path: '/api/v2/points/balance', identifier: null, operationCode: null, pricingKind: 'free', providerPoints: 0, fallbackCredits: 0, implemented: true,
    fields: [], result: 'data.remaining_points', note: '仅管理员诊断。',
  },
  {
    id: 'points-logs', category: '系统通用', title: 'Provider 积分日志', description: '部署商户 Provider 成本与退款记录。',
    method: 'GET', path: '/api/v2/points/logs', identifier: null, operationCode: null, pricingKind: 'free', providerPoints: 0, fallbackCredits: 0, implemented: true,
    fields: [field('page', 'integer ≥ 1', false, '页码', { defaultValue: '1' }), field('pageSize', 'integer 1..100', false, '每页数量', { defaultValue: '20' })], result: 'data.list / data.pagination', note: '仅管理员诊断。',
  },
  {
    id: 'temp-image-upload', category: '系统通用', title: '临时图片上传', description: '为需要公网 URL 的绘画/视频参考图提供临时文件。',
    method: 'POST', path: '/api/v2/upload/temp-image', identifier: null, operationCode: null, pricingKind: 'free', providerPoints: 0, fallbackCredits: 0, implemented: false,
    fields: [field('image', 'multipart file', true, 'JPEG/PNG/GIF/WebP，单张最大 10MB')], result: '临时图片 URL', note: 'AI Music Studio 实际文件应先写入私有 OSS，再由服务端签名，不直接暴露 Provider Key。',
  },
];

export const MXAPI_FIXED_OPERATION_REQUESTS = MXAPI_NON_MUSIC_CAPABILITIES.flatMap((capability) =>
  capability.operationCode && capability.fallbackCredits
    ? [{ action: capability.id, operationCode: capability.operationCode, fallbackCredits: capability.fallbackCredits }]
    : []);
