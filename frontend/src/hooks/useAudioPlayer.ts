import { useRef, useState, useEffect, useCallback } from 'react';

interface UseAudioPlayerReturn {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  audioRef: React.RefObject<HTMLAudioElement>;
  analyser: AnalyserNode | null;
  audioContext: AudioContext | null;
}

export const useAudioPlayer = (audioUrl?: string): UseAudioPlayerReturn => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const isInitializedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Initialize Web Audio API
  const initializeAudioContext = useCallback(() => {
    if (isInitializedRef.current || !audioRef.current) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('Web Audio API not supported');
        return;
      }

      const context = new AudioContextClass();
      audioContextRef.current = context;

      const analyser = context.createAnalyser();
      analyser.fftSize = 256; // Good balance between detail and performance
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = context.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(context.destination);
      sourceRef.current = source;

      isInitializedRef.current = true;
    } catch (error) {
      console.error('Failed to initialize Web Audio API:', error);
    }
  }, []);

  // Play
  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    // Initialize audio context on first user interaction
    if (!isInitializedRef.current) {
      initializeAudioContext();
    }

    // Resume audio context if suspended (browser autoplay policy)
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    audio.play()
      .then(() => setIsPlaying(true))
      .catch((error) => {
        console.error('Failed to play audio:', error);
        setIsPlaying(false);
      });
  }, [audioUrl, initializeAudioContext]);

  // Pause
  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    setIsPlaying(false);
  }, []);

  // Seek
  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  // Set volume
  const setVolume = useCallback((volume: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Volume should be between 0 and 1
    audio.volume = Math.max(0, Math.min(1, volume));
  }, []);

  // Handle time update
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    play,
    pause,
    seek,
    setVolume,
    currentTime,
    duration,
    isPlaying,
    audioRef,
    analyser: analyserRef.current,
    audioContext: audioContextRef.current,
  };
};

export default useAudioPlayer;
