import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MusicInfo, LyricsResult } from '../services/api';

// ============ 类型定义 ============

interface MusicGenerationState {
  status: 'idle' | 'generating' | 'complete' | 'error';
  taskId: string | null;
  progress: number;
  result: MusicInfo | null;
  error: string | null;
}

interface LyricsGenerationState {
  status: 'idle' | 'generating' | 'complete' | 'error';
  result: LyricsResult | null;
  error: string | null;
}

interface AppState {
  // 用户偏好
  language: string;
  setLanguage: (lang: string) => void;

  // 当前播放
  currentTrack: MusicInfo | null;
  isPlaying: boolean;
  setCurrentTrack: (track: MusicInfo | null) => void;
  setIsPlaying: (playing: boolean) => void;

  // 播放进度 (用于同步不同组件)
  currentTime: number;
  duration: number;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  seek: (time: number) => void;
  seekListener: ((time: number) => void) | null;
  setSeekListener: (listener: ((time: number) => void) | null) => void;

  // 音乐生成状态
  musicGeneration: MusicGenerationState;
  startMusicGeneration: (taskId: string) => void;
  updateMusicGenerationProgress: (progress: number) => void;
  completeMusicGeneration: (result: MusicInfo) => void;
  failMusicGeneration: (error: string) => void;
  resetMusicGeneration: () => void;

  // 歌词生成状态
  lyricsGeneration: LyricsGenerationState;
  startLyricsGeneration: () => void;
  completeLyricsGeneration: (result: LyricsResult) => void;
  failLyricsGeneration: (error: string) => void;
  resetLyricsGeneration: () => void;

  // 历史记录
  recentTracks: MusicInfo[];
  addToRecentTracks: (track: MusicInfo) => void;
  clearRecentTracks: () => void;

  // 用户积分
  credits: number;
  setCredits: (credits: number) => void;
  deductCredits: (amount: number) => void;
}

// ============ Store ============

const initialMusicGenerationState: MusicGenerationState = {
  status: 'idle',
  taskId: null,
  progress: 0,
  result: null,
  error: null,
};

const initialLyricsGenerationState: LyricsGenerationState = {
  status: 'idle',
  result: null,
  error: null,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // 用户偏好
      language: 'zh-CN',
      setLanguage: (lang) => set({ language: lang }),

      // 当前播放
      currentTrack: null,
      isPlaying: false,
      setCurrentTrack: (track) => set({ currentTrack: track }),
      setIsPlaying: (playing) => set({ isPlaying: playing }),

      // 播放进度
      currentTime: 0,
      duration: 0,
      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set({ duration: duration }),
      seek: (time) => {
        set({ currentTime: time });
        // 通知 BottomPlayer 执行 seek
        const listener = useAppStore.getState().seekListener;
        if (listener) {
          listener(time);
        }
      },
      seekListener: null,
      setSeekListener: (listener) => set({ seekListener: listener }),

      // 音乐生成状态
      musicGeneration: initialMusicGenerationState,
      startMusicGeneration: (taskId) =>
        set({
          musicGeneration: {
            ...initialMusicGenerationState,
            status: 'generating',
            taskId,
          },
        }),
      updateMusicGenerationProgress: (progress) =>
        set((state) => ({
          musicGeneration: { ...state.musicGeneration, progress },
        })),
      completeMusicGeneration: (result) =>
        set((state) => ({
          musicGeneration: {
            ...state.musicGeneration,
            status: 'complete',
            result,
          },
          // 自动添加到最近播放
          recentTracks: [result, ...state.recentTracks.slice(0, 9)],
        })),
      failMusicGeneration: (error) =>
        set((state) => ({
          musicGeneration: {
            ...state.musicGeneration,
            status: 'error',
            error,
          },
        })),
      resetMusicGeneration: () =>
        set({ musicGeneration: initialMusicGenerationState }),

      // 歌词生成状态
      lyricsGeneration: initialLyricsGenerationState,
      startLyricsGeneration: () =>
        set({
          lyricsGeneration: {
            ...initialLyricsGenerationState,
            status: 'generating',
          },
        }),
      completeLyricsGeneration: (result) =>
        set((state) => ({
          lyricsGeneration: {
            ...state.lyricsGeneration,
            status: 'complete',
            result,
          },
        })),
      failLyricsGeneration: (error) =>
        set((state) => ({
          lyricsGeneration: {
            ...state.lyricsGeneration,
            status: 'error',
            error,
          },
        })),
      resetLyricsGeneration: () =>
        set({ lyricsGeneration: initialLyricsGenerationState }),

      // 历史记录
      recentTracks: [],
      addToRecentTracks: (track) =>
        set((state) => ({
          recentTracks: [track, ...state.recentTracks.slice(0, 19)],
        })),
      clearRecentTracks: () => set({ recentTracks: [] }),

      // 用户积分
      credits: 500,
      setCredits: (credits) => set({ credits }),
      deductCredits: (amount) =>
        set((state) => ({ credits: Math.max(0, state.credits - amount) })),
    }),
    {
      name: 'music-ai-storage',
      partialize: (state) => ({
        language: state.language,
        recentTracks: state.recentTracks,
        credits: state.credits,
      }),
    }
  )
);

export default useAppStore;
