import axios, { AxiosInstance, AxiosError } from 'axios';

// API基础配置
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// 创建axios实例
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    // 可以在这里添加认证token
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error: AxiosError<any>) => {
    const message = error.response?.data?.error?.message || error.message || '请求失败';
    console.error('API Error:', message);
    return Promise.reject(new Error(message));
  }
);

// ============ 类型定义 ============

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: number;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

export interface MusicCreateParams {
  // Mode selection
  mode?: 'inspiration' | 'custom' | 'full_ai' | 'lyrics_only' | 'music_only';

  // Inspiration mode (simple description)
  gpt_description_prompt?: string;

  // Custom mode (detailed control)
  prompt?: string; // Lyrics for custom mode
  lyrics?: string;
  tags?: string;

  // Common parameters
  title?: string;
  mood?: string;
  llmProvider?: 'glm' | 'joybuilder';
  make_instrumental?: boolean;
  mv?: 'chirp-v3-0' | 'chirp-v3-5' | 'chirp-v4' | 'chirp-auk-turbo' | 'chirp-auk' | 'chirp-bluejay' | 'chirp-crow';
  negative_tags?: string;

  task?: 'generate' | 'extend' | 'cover' | 'remaster' | 'crop' | 'speed' | 'video' | 'wav';

  // Metadata - nested object according to API spec
  metadata?: {
    vocal_gender?: 'm' | 'f'; // 'm' = male, 'f' = female
    control_sliders?: {
      style_weight?: number; // 0-1 float
      weirdness_constraint?: number; // 0-1 float
    };
  };

  // Legacy support (for backward compatibility)
  instrumental?: boolean;
  vocal_gender?: 'm' | 'f';
  control_sliders?: {
    style_weight?: number;
    weirdness_constraint?: number;
  };
}

export interface MusicInfo {
  id: string;
  status: 'processing' | 'complete' | 'error';
  title?: string;
  audioUrl?: string;
  videoUrl?: string;
  imageUrl?: string;
  duration?: number;
  lyrics?: string;
  createdAt?: string;
  tags?: string[];
  mood?: string;
  isFavorite?: boolean;
  mode?: string;
  errorMessage?: string;
  errorMessageEn?: string;
  sunoId?: string;
}

export interface LyricsResult {
  title: string;
  lyrics: string;
}

export interface StyleRecommendation {
  tags: string[];
  mood: string;
  tempo: string;
}

export interface LLMStatus {
  defaultProvider: string;
  glmAvailable: boolean;
  joyBuilderAvailable: boolean;
  networkEnv: string;
}

export interface BalanceInfo {
  balance: number;
  currency: string;
  message: string;
}

export interface ExtendParams {
  clipId: string;
  continueAt?: number;
  prompt?: string;
  lyrics?: string;
  tags?: string;
  title?: string;
}

export interface AlignedLyricsParams {
  sunoId: string;
  lyrics: string;
}

export interface RemasterParams {
  clipId: string;
  modelName?: 'chirp-carp' | 'chirp-bass' | 'chirp-up';
  variationCategory?: 'subtle' | 'normal' | 'high';
}

export interface CropParams {
  clipId: string;
  cropStartS: number;
  cropEndS: number;
}

export interface SpeedParams {
  clipId: string;
  speedMultiplier: 0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;
  keepPitch?: boolean;
  title?: string;
}

// ============ API 方法 ============

export const musicApi = {
  /**
   * 创建歌曲
   */
  create: async (params: MusicCreateParams): Promise<ApiResponse<any>> => {
    return apiClient.post('/music/create', params);
  },

  /**
   * 查询歌曲状态
   */
  getStatus: async (id: string): Promise<ApiResponse<MusicInfo>> => {
    return apiClient.get(`/music/status/${id}`);
  },

  /**
   * 批量查询歌曲状态
   */
  getBatchStatus: async (ids: string[]): Promise<ApiResponse<{ total: number; items: MusicInfo[] }>> => {
    return apiClient.post('/music/batch-status', { ids });
  },

  /**
   * 获取歌曲列表
   */
  getList: async (page = 1, pageSize = 20, status?: string, favoritesOnly = false): Promise<ApiResponse<any>> => {
    return apiClient.get('/music/list', {
      params: { page, pageSize, status, favoritesOnly }
    });
  },

  /**
   * 获取历史记录
   */
  getHistory: async (page = 1, pageSize = 20): Promise<ApiResponse<MusicInfo[]>> => {
    return apiClient.get('/music/history', { params: { page, pageSize } });
  },

  /**
   * 获取单个歌曲详情
   */
  getById: async (id: string): Promise<ApiResponse<MusicInfo>> => {
    return apiClient.get(`/music/${id}`);
  },

  /**
   * 更新歌曲信息
   */
  update: async (id: string, data: {
    title?: string;
    tags?: string | string[];
    mood?: string;
    lyrics?: string;
  }): Promise<ApiResponse<MusicInfo>> => {
    return apiClient.put(`/music/${id}`, data);
  },

  /**
   * 删除歌曲
   */
  delete: async (id: string): Promise<ApiResponse<any>> => {
    return apiClient.delete(`/music/${id}`);
  },

  /**
   * 切换收藏状态
   */
  toggleFavorite: async (id: string): Promise<ApiResponse<{ isFavorite: boolean }>> => {
    return apiClient.post(`/music/${id}/favorite`);
  },

  /**
   * 等待生成完成
   */
  waitForCompletion: async (id: string, maxWait = 300000): Promise<ApiResponse<MusicInfo>> => {
    return apiClient.post(`/music/wait/${id}`, { maxWait });
  },

  /**
   * 上传音频（通过 URL）
   */
  uploadAudioUrl: async (audioUrl: string): Promise<ApiResponse<{ uploadId: string }>> => {
    return apiClient.post('/music/upload', { audio_url: audioUrl });
  },

  /**
   * 创建翻唱
   * @param params.cover_clip_id - 原歌曲的 suno ID (custom_id)，从上传任务完成后获取
   * @param params.prompt - 翻唱风格描述
   * @param params.tags - 风格标签
   * @param params.lyrics - 自定义歌词
   */
  createCover: async (params: {
    cover_clip_id: string;
    prompt?: string;
    tags?: string;
    lyrics?: string;
  }): Promise<ApiResponse<any>> => {
    return apiClient.post('/music/cover', params);
  },

  /**
   * 获取整首歌曲
   */
  getWholeSong: async (clipId: string): Promise<ApiResponse<{ taskId: string; status: string }>> => {
    return apiClient.post(`/music/whole-song/${clipId}`);
  },

  /**
   * 歌曲续写
   */
  extend: async (params: ExtendParams): Promise<ApiResponse<{ taskId: string; status: string }>> => {
    return apiClient.post('/music/extend', params);
  },

  /**
   * 查询积分余额
   */
  getBalance: async (): Promise<ApiResponse<BalanceInfo>> => {
    return apiClient.get('/music/balance');
  },

  /**
   * 获取LLM服务状态
   */
  getLLMStatus: async (): Promise<ApiResponse<LLMStatus>> => {
    return apiClient.get('/music/llm-status');
  },

  /**
   * 获取下载链接
   */
  getDownloadUrl: (id: string): string => {
    return `${API_BASE_URL}/music/download/${id}`;
  },

  /**
   * 下载音乐
   */
  download: async (id: string, filename?: string): Promise<void> => {
    const response = await apiClient.get(`/music/download/${id}`, {
      responseType: 'blob',
    });
    const blob = new Blob([response as any], { type: 'audio/mpeg' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `music-${id}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  /**
   * 获取歌词时间戳对齐（卡拉OK功能）
   */
  getAlignedLyrics: async (params: AlignedLyricsParams): Promise<ApiResponse<{ taskId: string; status: string }>> => {
    return apiClient.post('/music/aligned-lyrics', params);
  },

  /**
   * Remaster音乐 - 提升音质
   */
  remaster: async (params: RemasterParams): Promise<ApiResponse<{ taskIds: string[]; status: string }>> => {
    return apiClient.post('/music/remaster', params);
  },

  /**
   * 生成音乐视频
   */
  generateVideo: async (taskId: string, sunoId: string): Promise<ApiResponse<{ taskId: string; status: string }>> => {
    return apiClient.post('/music/video', { taskId, sunoId });
  },

  /**
   * 转换为WAV格式
   */
  convertToWav: async (taskId: string, sunoId: string): Promise<ApiResponse<{ taskId: string; status: string }>> => {
    return apiClient.post('/music/convert-wav', { taskId, sunoId });
  },

  /**
   * 裁剪音乐
   */
  crop: async (params: CropParams): Promise<ApiResponse<{ taskId: string; status: string }>> => {
    return apiClient.post('/music/crop', params);
  },

  /**
   * 调整音乐速度
   */
  adjustSpeed: async (params: SpeedParams): Promise<ApiResponse<{ taskId: string; status: string }>> => {
    return apiClient.post('/music/speed', params);
  },
};

export const lyricsApi = {
  /**
   * 生成歌词
   */
  generate: async (params: {
    idea: string;
    style?: string;
    mood?: string;
    llmProvider?: 'glm' | 'joybuilder';
  }): Promise<ApiResponse<LyricsResult>> => {
    return apiClient.post('/lyrics/generate', params);
  },

  /**
   * 增强提示词
   */
  enhance: async (prompt: string, llmProvider?: 'glm' | 'joybuilder'): Promise<ApiResponse<{ enhancedPrompt: string }>> => {
    return apiClient.post('/lyrics/enhance', { prompt, llmProvider });
  },

  /**
   * 润色歌词
   */
  polish: async (lyrics: string, style?: string, llmProvider?: 'glm' | 'joybuilder'): Promise<ApiResponse<{ polishedLyrics: string }>> => {
    return apiClient.post('/lyrics/polish', { lyrics, style, llmProvider });
  },

  /**
   * 风格推荐
   */
  recommendStyle: async (description: string, llmProvider?: 'glm' | 'joybuilder'): Promise<ApiResponse<StyleRecommendation>> => {
    return apiClient.post('/lyrics/recommend-style', { description, llmProvider });
  },
};

export const healthApi = {
  /**
   * 健康检查
   */
  check: async (): Promise<any> => {
    return apiClient.get('/health');
  },

  /**
   * 就绪检查
   */
  ready: async (): Promise<any> => {
    return apiClient.get('/health/ready');
  },

  /**
   * 存活检查
   */
  live: async (): Promise<any> => {
    return apiClient.get('/health/live');
  },
};

export default apiClient;
