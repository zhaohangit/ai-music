import logger from '../utils/logger';

/**
 * Music Track interface
 */
export interface MusicTrack {
  id: string;
  title: string;
  status: 'processing' | 'complete' | 'error';
  tags: string[];
  mood?: string;
  createdAt: string;
  audioUrl?: string;
  videoUrl?: string;
  imageUrl?: string;
  duration?: number;
  lyrics?: string;
  isFavorite: boolean;
  llmUsed?: string;
  mode?: string;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page: number;
  pageSize: number;
  status?: string;
  favoritesOnly?: boolean;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * In-memory store for music tracks
 * This provides session-persistent storage without a database
 */
class MusicStore {
  private tracks: Map<string, MusicTrack> = new Map();

  /**
   * Add or update a track
   */
  setTrack(track: MusicTrack): void {
    this.tracks.set(track.id, track);
    logger.info('Track stored', { id: track.id, title: track.title, status: track.status });
  }

  /**
   * Get a track by ID
   */
  getTrack(id: string): MusicTrack | undefined {
    return this.tracks.get(id);
  }

  /**
   * Get all tracks with pagination and filtering
   */
  getTracks(options: PaginationOptions): PaginatedResult<MusicTrack> {
    const { page = 1, pageSize = 20, status, favoritesOnly } = options;

    let tracks = Array.from(this.tracks.values());

    // Filter by status if specified
    if (status) {
      tracks = tracks.filter(t => t.status === status);
    }

    // Filter by favorites if specified
    if (favoritesOnly) {
      tracks = tracks.filter(t => t.isFavorite);
    }

    // Sort by createdAt (newest first)
    tracks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = tracks.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedTracks = tracks.slice(startIndex, endIndex);

    return {
      items: paginatedTracks,
      pagination: {
        page,
        pageSize,
        total,
        totalPages
      }
    };
  }

  /**
   * Get generation history (completed tracks)
   */
  getHistory(options: Omit<PaginationOptions, 'status'>): PaginatedResult<MusicTrack> {
    return this.getTracks({ ...options, status: 'complete' });
  }

  /**
   * Delete a track
   */
  deleteTrack(id: string): boolean {
    const deleted = this.tracks.delete(id);
    if (deleted) {
      logger.info('Track deleted', { id });
    }
    return deleted;
  }

  /**
   * Update a track
   */
  updateTrack(id: string, updates: Partial<Omit<MusicTrack, 'id' | 'createdAt'>>): MusicTrack | null {
    const track = this.tracks.get(id);
    if (!track) {
      return null;
    }

    const updatedTrack = { ...track, ...updates };
    this.tracks.set(id, updatedTrack);
    logger.info('Track updated', { id, updates });
    return updatedTrack;
  }

  /**
   * Toggle favorite status
   */
  toggleFavorite(id: string): MusicTrack | null {
    const track = this.tracks.get(id);
    if (!track) {
      return null;
    }

    const updatedTrack = { ...track, isFavorite: !track.isFavorite };
    this.tracks.set(id, updatedTrack);
    logger.info('Track favorite toggled', { id, isFavorite: updatedTrack.isFavorite });
    return updatedTrack;
  }

  /**
   * Get all track IDs
   */
  getAllIds(): string[] {
    return Array.from(this.tracks.keys());
  }

  /**
   * Get store stats
   */
  getStats(): { total: number; processing: number; complete: number; error: number; favorites: number } {
    const tracks = Array.from(this.tracks.values());
    return {
      total: tracks.length,
      processing: tracks.filter(t => t.status === 'processing').length,
      complete: tracks.filter(t => t.status === 'complete').length,
      error: tracks.filter(t => t.status === 'error').length,
      favorites: tracks.filter(t => t.isFavorite).length
    };
  }

  /**
   * Clear all tracks (useful for testing)
   */
  clear(): void {
    this.tracks.clear();
    logger.info('Music store cleared');
  }
}

// Export singleton instance
export const musicStore = new MusicStore();
export default musicStore;

// 不再初始化 demo 数据，只使用真实的 API 数据
