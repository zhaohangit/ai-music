import { useState, useEffect, useRef, useCallback } from 'react';
import { musicApi, MusicInfo } from '../services/api';
import { useAppStore } from './useMusicStore';

// Polling configuration
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLL_DURATION = 300000; // 5 minutes

// Return type for the hook
interface UseStatusPollingReturn {
  isPolling: boolean;
  progress: number;
  status: 'idle' | 'processing' | 'complete' | 'error';
  startPolling: (taskId: string) => void;
  stopPolling: () => void;
}

/**
 * Hook for polling music generation status
 * Polls the API every 5 seconds until status is 'complete' or 'error'
 * Handles timeout after 5 minutes
 */
export const useStatusPolling = (): UseStatusPollingReturn => {
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');

  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const updateMusicGenerationProgress = useAppStore(
    (state) => state.updateMusicGenerationProgress
  );
  const completeMusicGeneration = useAppStore((state) => state.completeMusicGeneration);
  const failMusicGeneration = useAppStore((state) => state.failMusicGeneration);

  // Calculate progress based on elapsed time
  const updateProgress = useCallback(() => {
    if (!startTimeRef.current) return;

    const elapsed = Date.now() - startTimeRef.current;
    const calculatedProgress = Math.min((elapsed / MAX_POLL_DURATION) * 100, 95);
    setProgress(calculatedProgress);
    updateMusicGenerationProgress(calculatedProgress);
  }, [updateMusicGenerationProgress]);

  // Stop polling and clean up
  const stopPolling = useCallback(() => {
    setIsPolling(false);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    startTimeRef.current = null;
  }, []);

  // Poll the status API
  const pollStatus = useCallback(async (taskId: string) => {
    try {
      const response = await musicApi.getStatus(taskId);

      if (response.success && response.data) {
        const musicInfo = response.data;

        switch (musicInfo.status) {
          case 'processing':
            updateProgress();
            break;

          case 'complete':
            setProgress(100);
            updateMusicGenerationProgress(100);
            completeMusicGeneration(musicInfo);
            setStatus('complete');
            stopPolling();
            break;

          case 'error':
            failMusicGeneration('Music generation failed');
            setStatus('error');
            stopPolling();
            break;
        }
      } else {
        // API returned error response
        failMusicGeneration('Failed to fetch status');
        setStatus('error');
        stopPolling();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      failMusicGeneration(errorMessage);
      setStatus('error');
      stopPolling();
    }
  }, [updateProgress, updateMusicGenerationProgress, completeMusicGeneration, failMusicGeneration, stopPolling]);

  // Start polling for a task
  const startPolling = useCallback((taskId: string) => {
    // Clean up any existing polling
    if (intervalRef.current || timeoutRef.current) {
      stopPolling();
    }

    setIsPolling(true);
    setStatus('processing');
    setProgress(0);
    startTimeRef.current = Date.now();

    // Set up timeout for max duration
    timeoutRef.current = setTimeout(() => {
      failMusicGeneration('Music generation timeout');
      setStatus('error');
      stopPolling();
    }, MAX_POLL_DURATION);

    // Start polling interval
    intervalRef.current = setInterval(() => {
      pollStatus(taskId);
    }, POLL_INTERVAL);

    // Initial poll
    pollStatus(taskId);
  }, [pollStatus, stopPolling, failMusicGeneration]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    isPolling,
    progress,
    status,
    startPolling,
    stopPolling,
  };
};

export default useStatusPolling;
