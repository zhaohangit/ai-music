import React, { useRef, useEffect, useState } from 'react';
import styled from 'styled-components';

const VisualizerContainer = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  height: 60px;
  width: 100%;
  padding: 0 10px;
`;

const VisualizerBar = styled.div<{ $height: number; $color: string }>`
  width: 6px;
  height: ${props => props.$height}px;
  background: ${props => props.$color};
  border-radius: 3px;
  transition: height 0.05s ease;
  min-height: 4px;
`;

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

// Gradient colors matching the app theme
const BAR_COLORS = [
  '#667EEA',
  '#764BA2',
  '#9D50BB',
  '#B852D1',
  '#D45EE8',
  '#F093FB',
  '#F5576C',
  '#F093FB',
  '#D45EE8',
  '#B852D1',
  '#9D50BB',
  '#764BA2',
  '#667EEA',
  '#5A6FD6',
  '#4E61CD',
  '#4253C4',
];

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyser, isPlaying }) => {
  const [barHeights, setBarHeights] = useState<number[]>(Array(16).fill(4));
  const animationFrameRef = useRef<number | undefined>(undefined);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!analyser || !isPlaying) {
      setBarHeights(Array(16).fill(4));
      return;
    }

    // Initialize data array if needed
    if (!dataArrayRef.current) {
      const bufferLength = analyser.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);
    }

    const dataArray = dataArrayRef.current;
    if (!dataArray) return;
    const bufferLength = analyser.frequencyBinCount;

    const animate = () => {
      analyser.getByteFrequencyData(dataArray as Uint8Array<ArrayBuffer>);

      // Calculate bar heights from frequency data
      // We'll use the lower frequency bands (bass and midrange) as they're more visually interesting
      const numBars = 16;
      const newHeights: number[] = [];

      for (let i = 0; i < numBars; i++) {
        // Map bar index to frequency bin index
        // We use a logarithmic-like distribution to focus on lower frequencies
        const binIndex = Math.floor((i / numBars) * bufferLength * 0.7);
        const value = dataArray[binIndex];

        // Convert to height (4px to 60px)
        const height = 4 + (value / 255) * 56;
        newHeights.push(height);
      }

      setBarHeights(newHeights);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyser, isPlaying]);

  return (
    <VisualizerContainer>
      {barHeights.map((height, index) => (
        <VisualizerBar
          key={index}
          $height={isPlaying ? height : 4}
          $color={BAR_COLORS[index % BAR_COLORS.length]}
        />
      ))}
    </VisualizerContainer>
  );
};

export default AudioVisualizer;
