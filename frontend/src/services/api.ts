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
  mode?: 'inspiration' | 'custom' | 'full_ai' | 'lyrics_only' | 'music_only';
  prompt?: string;
  title?: string;
  lyrics?: string;
  tags?: string;
  mood?: string;
  llmProvider?: 'glm' | 'joybuilder';
  instrumental?: boolean;
  mv?: 'chirp-v3-5' | 'chirp-v4';
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
   * 获取歌曲列表
   */
  getList: async (page = 1, pageSize = 20): Promise<ApiResponse<any>> => {
    return apiClient.get('/music/list', { params: { page, pageSize } });
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
  uploadAudioUrl: async (audioUrl: string): Promise<ApiResponse<any>> => {
    return apiClient.post('/music/upload', { audio_url: audioUrl });
  },

  /**
   * 上传音频文件（本地文件，需要服务器支持）
   * @deprecated Suno API 需要 URL，请使用 uploadAudioUrl
   */
  upload: async (file: File): Promise<ApiResponse<any>> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/music/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /**
   * 创建翻唱
   */
  createCover: async (params: {
    upload_id: string;
    prompt?: string;
    tags?: string;
    lyrics?: string;
  }): Promise<ApiResponse<any>> => {
    return apiClient.post('/music/cover', params);
  },

  /**
   * 获取历史记录
   */
  getHistory: async (): Promise<ApiResponse<MusicInfo[]>> => {
    return apiClient.get('/music/history');
  },

  /**
   * 删除歌曲
   */
  delete: async (id: string): Promise<ApiResponse<any>> => {
    return apiClient.delete(`/music/${id}`);
  },

  /**
   * 更新歌曲信息
   */
  update: async (id: string, data: {
    title?: string;
    tags?: string;
    mood?: string;
  }): Promise<ApiResponse<MusicInfo>> => {
    return apiClient.put(`/music/${id}`, data);
  },

  /**
   * 切换收藏状态
   */
  toggleFavorite: async (id: string): Promise<ApiResponse<{ isFavorite: boolean }>> => {
    return apiClient.post(`/music/${id}/favorite`);
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
};

export const lyricsApi = {
  /**
   * 生成歌词
   */
  generate: async (params: {
    idea: string;
    style?: string;
    mood?: string;
  }): Promise<ApiResponse<LyricsResult>> => {
    return apiClient.post('/lyrics/generate', params);
  },

  /**
   * 增强提示词
   */
  enhance: async (prompt: string): Promise<ApiResponse<{ enhancedPrompt: string }>> => {
    return apiClient.post('/lyrics/enhance', { prompt });
  },

  /**
   * 润色歌词
   */
  polish: async (lyrics: string, style?: string): Promise<ApiResponse<{ polishedLyrics: string }>> => {
    return apiClient.post('/lyrics/polish', { lyrics, style });
  },

  /**
   * 风格推荐
   */
  recommendStyle: async (description: string): Promise<ApiResponse<StyleRecommendation>> => {
    return apiClient.post('/lyrics/recommend-style', { description });
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
};

export default apiClient;
