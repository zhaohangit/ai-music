import { Router, Request, Response } from 'express';
import axios from 'axios';
import { success, fail, paginated } from '../utils/response';
import { asyncHandler, musicGenerationLimiter } from '../middleware';
import { validateMusicCreation } from '../middleware/validator';
import musicOrchestrator from '../services/musicOrchestrator';
import sunoService from '../services/sunoService';
import { musicStore, MusicTrack } from '../services/musicStore';
import { LLMProvider } from '../types/errors';
import logger from '../utils/logger';

const router = Router();

/**
 * @route GET /api/music/list
 * @desc Get all music tracks with pagination
 * @access Public
 */
router.get('/list',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const status = req.query.status as string | undefined;
    const favoritesOnly = req.query.favoritesOnly === 'true';

    if (page < 1 || pageSize < 1 || pageSize > 100) {
      return fail(res, 1001, 'Invalid pagination parameters', 400);
    }

    const result = musicStore.getTracks({ page, pageSize, status, favoritesOnly });

    return paginated(res, result.items, page, pageSize, result.pagination.total);
  })
);

/**
 * @route GET /api/music/history
 * @desc Get generation history (completed tracks)
 * @access Public
 */
router.get('/history',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    if (page < 1 || pageSize < 1 || pageSize > 100) {
      return fail(res, 1001, 'Invalid pagination parameters', 400);
    }

    const result = musicStore.getHistory({ page, pageSize });

    return paginated(res, result.items, page, pageSize, result.pagination.total);
  })
);

/**
 * @route GET /api/music/balance
 * @desc 查询Suno API积分余额
 * @access Public
 */
router.get('/balance',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const balance = await sunoService.getPointsBalance();

      return success(res, {
        balance,
        currency: 'points',
        message: balance > 0 ? `剩余积分: ${balance}` : '积分已用尽，请充值'
      });
    } catch (error: any) {
      logger.error('Balance query failed', { error: error.message });
      return fail(res, 2002, `余额查询失败: ${error.message}`, 500);
    }
  })
);

/**
 * @route GET /api/music/llm-status
 * @desc 获取LLM服务状态
 * @access Public
 */
router.get('/llm-status',
  asyncHandler(async (req: Request, res: Response) => {
    const status = musicOrchestrator.getConfigInfo();

    return success(res, {
      ...status,
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * @route POST /api/music/batch-status
 * @desc 批量查询音乐生成状态
 * @access Public
 */
router.post('/batch-status',
  asyncHandler(async (req: Request, res: Response) => {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return fail(res, 1001, '请提供有效的任务ID数组', 400);
    }

    if (ids.length > 50) {
      return fail(res, 1001, '单次最多查询50个任务', 400);
    }

    try {
      // 从Suno API批量查询
      const results = await sunoService.getMusicByIds(ids);

      // 更新本地存储
      for (const result of results) {
        const existingTrack = musicStore.getTrack(result.id);
        if (existingTrack) {
          musicStore.updateTrack(result.id, {
            status: result.status as 'processing' | 'complete' | 'error',
            audioUrl: result.audio_url,
            videoUrl: result.video_url,
            imageUrl: result.image_url,
            duration: result.duration,
            lyrics: result.lyrics
          });
        }
      }

      return success(res, {
        total: results.length,
        items: results.map(r => ({
          id: r.id,
          status: r.status,
          title: r.title,
          audioUrl: r.audio_url,
          videoUrl: r.video_url,
          imageUrl: r.image_url,
          duration: r.duration
        }))
      });
    } catch (error: any) {
      logger.error('Batch status query failed', { error: error.message });
      return fail(res, 2002, `批量查询失败: ${error.message}`, 500);
    }
  })
);

/**
 * @route POST /api/music/extend
 * @desc 歌曲续写
 * @access Public
 */
router.post('/extend',
  musicGenerationLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { clipId, continueAt, prompt, lyrics, tags, title } = req.body;

    if (!clipId) {
      return fail(res, 1001, '请提供要续写的歌曲ID (clipId)', 400);
    }

    logger.info('Music extend request', {
      clipId,
      continueAt,
      hasPrompt: !!prompt,
      hasLyrics: !!lyrics,
      tags
    });

    try {
      const result = await sunoService.createCustom({
        title: title || 'Extended Song',
        lyrics: lyrics || prompt,
        tags: tags,
        model: 'chirp-v3-5',
        continueClipId: clipId,
        continueAt: continueAt ? String(continueAt) : undefined
      });

      // 存储续写任务
      const taskId = result.id;
      musicStore.setTrack({
        id: taskId,
        title: title || 'Extended Song',
        status: 'processing',
        tags: tags ? tags.split(',').map((t: string) => t.trim()) : [],
        createdAt: new Date().toISOString(),
        isFavorite: false,
        mode: 'extend',
        lyrics: lyrics || prompt
      });

      logger.info('Extend task created', { taskId, clipId });

      return success(res, {
        taskId,
        id: taskId,
        status: 'processing',
        title: title || 'Extended Song',
        clipId,
        continueAt,
        message: '歌曲续写任务已创建'
      });
    } catch (error: any) {
      logger.error('Music extend failed', { error: error.message });

      const errorMessage = error.message || '';
      if (errorMessage.includes('余额') || errorMessage.includes('balance')) {
        return fail(res, 2002, 'Suno API 余额不足，请充值后重试', 402);
      }

      return fail(res, 2002, `歌曲续写失败: ${errorMessage}`, 500);
    }
  })
);

/**
 * @route DELETE /api/music/:id
 * @desc Delete a music track
 * @access Public
 */
router.delete('/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      return fail(res, 1001, 'Track ID is required', 400);
    }

    const deleted = musicStore.deleteTrack(id);

    if (!deleted) {
      return fail(res, 2004, 'Track not found', 404);
    }

    return success(res, { id, message: 'Track deleted successfully' });
  })
);

/**
 * @route PUT /api/music/:id
 * @desc Update a music track (title, tags, etc.)
 * @access Public
 */
router.put('/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, tags, mood, lyrics } = req.body;

    if (!id) {
      return fail(res, 1001, 'Track ID is required', 400);
    }

    // Build updates object with only provided fields
    const updates: Partial<Omit<MusicTrack, 'id' | 'createdAt'>> = {};

    if (title !== undefined) updates.title = title;
    if (tags !== undefined) {
      updates.tags = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : []);
    }
    if (mood !== undefined) updates.mood = mood;
    if (lyrics !== undefined) updates.lyrics = lyrics;

    if (Object.keys(updates).length === 0) {
      return fail(res, 1001, 'No valid fields to update', 400);
    }

    const updatedTrack = musicStore.updateTrack(id, updates);

    if (!updatedTrack) {
      return fail(res, 2004, 'Track not found', 404);
    }

    return success(res, { track: updatedTrack, message: 'Track updated successfully' });
  })
);

/**
 * @route POST /api/music/:id/favorite
 * @desc Toggle favorite status
 * @access Public
 */
router.post('/:id/favorite',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      return fail(res, 1001, 'Track ID is required', 400);
    }

    const track = musicStore.toggleFavorite(id);

    if (!track) {
      return fail(res, 2004, 'Track not found', 404);
    }

    return success(res, { track, message: `Track ${track.isFavorite ? 'added to' : 'removed from'} favorites` });
  })
);

/**
 * @route GET /api/music/download/:id
 * @desc 下载音乐文件
 * @access Public
 */
router.get('/download/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      return fail(res, 1001, 'Track ID is required', 400);
    }

    let track = musicStore.getTrack(id);
    let audioUrl: string | undefined;
    let trackTitle: string = 'track';

    // If track not in local store, try to fetch from Suno API
    if (!track || !track.audioUrl) {
      try {
        logger.info('Track not in local store, fetching from Suno API', { id });
        const sunoTrack = await sunoService.getMusicById(id);

        if (sunoTrack && sunoTrack.audio_url) {
          audioUrl = sunoTrack.audio_url;
          trackTitle = sunoTrack.title || 'track';

          // Store/update the track in local store for future use
          if (track) {
            musicStore.updateTrack(id, {
              audioUrl: sunoTrack.audio_url,
              title: sunoTrack.title,
              status: sunoTrack.status as 'processing' | 'complete' | 'error',
              duration: sunoTrack.duration,
              lyrics: sunoTrack.lyrics
            });
          } else {
            musicStore.setTrack({
              id,
              title: sunoTrack.title || 'Untitled Track',
              status: (sunoTrack.status as 'processing' | 'complete' | 'error') || 'complete',
              tags: [],
              createdAt: sunoTrack.created_at || new Date().toISOString(),
              audioUrl: sunoTrack.audio_url,
              duration: sunoTrack.duration,
              lyrics: sunoTrack.lyrics,
              isFavorite: false
            });
          }
        }
      } catch (error: any) {
        logger.error('Failed to fetch track from Suno API', { id, error: error.message });
      }
    } else {
      audioUrl = track.audioUrl;
      trackTitle = track.title;
    }

    if (!audioUrl) {
      return fail(res, 2005, 'Audio URL not available for this track', 404);
    }

    try {
      logger.info('Downloading track', { id, title: trackTitle, audioUrl });

      // Fetch the audio file from the external URL
      const response = await axios.get(audioUrl, {
        responseType: 'arraybuffer',
        timeout: 60000, // 60 seconds timeout
      });

      // Set headers for file download
      const filename = `${trackTitle || 'track'}.mp3`;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Length', response.data.length);

      // Send the audio data
      return res.send(Buffer.from(response.data));
    } catch (error: any) {
      logger.error('Download failed', { id, error: error.message });
      return fail(res, 2006, `Download failed: ${error.message}`, 500);
    }
  })
);

/**
 * @route GET /api/music/:id
 * @desc Get a single track by ID
 * @access Public
 */
router.get('/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      return fail(res, 1001, 'Track ID is required', 400);
    }

    const track = musicStore.getTrack(id);

    if (!track) {
      return fail(res, 2004, 'Track not found', 404);
    }

    return success(res, track);
  })
);

/**
 * @route POST /api/music/create
 * @desc 创建歌曲
 * @access Public
 */
router.post('/create',
  musicGenerationLimiter,
  validateMusicCreation,
  asyncHandler(async (req: Request, res: Response) => {
    const { mode, prompt, title, lyrics, tags, mood, llmProvider, mv, instrumental, negativeTags, metadata } = req.body;

    logger.info('Music creation request', {
      mode,
      prompt: prompt?.substring(0, 50),
      title,
      llmProvider,
      instrumental,
      tags,
      mood,
      hasLyrics: !!lyrics,
      lyricsLength: lyrics?.length || 0,
      lyricsPreview: lyrics?.substring(0, 200) || 'N/A',
    });

    // Guard: this open.suno.cn account frequently rejects V5 with "Failed model quick validation".
    // Prevent consuming points on a task that will immediately fail.
    if (mv === 'chirp-v5' || mv === 'v5') {
      return fail(res, 1001, '当前 Suno 账号暂不支持 V5（会触发 Failed model quick validation）。请切换到 V4 或 V4-5 后重试。', 400);
    }

    // Helper function to create and store a track
    const createAndStoreTrack = (taskId: string, trackData: Partial<MusicTrack>): MusicTrack => {
      const track: MusicTrack = {
        id: taskId,
        title: trackData.title || 'Untitled Track',
        status: trackData.status || 'processing',
        tags: trackData.tags || [],
        mood: trackData.mood,
        createdAt: trackData.createdAt || new Date().toISOString(),
        audioUrl: trackData.audioUrl,
        videoUrl: trackData.videoUrl,
        imageUrl: trackData.imageUrl,
        duration: trackData.duration,
        lyrics: trackData.lyrics,
        isFavorite: false,
        llmUsed: trackData.llmUsed,
        mode: trackData.mode
      };
      musicStore.setTrack(track);
      return track;
    };

    // Helper function to generate a meaningful title from lyrics or prompt
    const generateTitle = (lyricsText?: string, promptText?: string, styleText?: string): string => {
      if (title) return title;

      // Try to extract meaningful title from lyrics
      if (lyricsText) {
        // Look for Chinese phrases in lyrics
        const chineseMatches = lyricsText.match(/[\u4e00-\u9fff]{2,6}/g);
        if (chineseMatches && chineseMatches.length > 0) {
          // Pick a meaningful phrase (prefer longer ones)
          const meaningfulPhrase = chineseMatches.sort((a, b) => b.length - a.length)[0];
          return `${meaningfulPhrase}`;
        }

        // Look for English phrases
        const lines = lyricsText.split('\n').filter((line: string) =>
          line.trim() && !line.startsWith('[') && line.length > 10 && line.length < 50
        );
        if (lines.length > 0) {
          const randomLine = lines[Math.floor(Math.random() * lines.length)].trim();
          const words = randomLine.split(' ').slice(0, 4).join(' ');
          return `${words}`;
        }
      }

      // Fall back to prompt
      if (promptText) {
        const words = promptText.split(' ').slice(0, 4).join(' ');
        return `${words} - ${styleText || 'AI'}`;
      }

      return `${styleText || 'Pop'} - AI Generated`;
    };

    try {
      // 自定义模式 - 使用用户提供的参数（可以有或没有歌词）
      if (mode === 'custom') {
        // Build prompt from description, tags, and mood if no lyrics
        const customPrompt = lyrics
          ? undefined
          : `${prompt || ''} ${tags ? `Style: ${tags}` : ''} ${mood ? `Mood: ${mood}` : ''}`.trim();

        const result = await sunoService.createCustom({
          title: title || `${mood || ''} ${tags || 'Pop'}`.trim(),
          lyrics: lyrics || undefined,
          tags: tags,
          description: customPrompt,
          model: mv || 'v3.5',
          instrumental,
          negativeTags,
          metadata,
        });

        createAndStoreTrack(result.id, {
          title: title || `${mood || ''} ${tags || 'AI Generated'}`.trim(),
          status: (result.status === 'error' ? 'processing' : result.status) || 'processing',
          tags: tags ? tags.split(',').map((t: string) => t.trim()) : (tags ? [tags] : []),
          lyrics,
          mood,
          mode
        });

        return success(res, {
          taskId: result.id,
          status: result.status,
          message: '音乐生成任务已创建'
        });
      }

      // 灵感模式 - 直接调用Suno
      if (mode === 'inspiration' && prompt) {
        const result = await sunoService.createWithPrompt(prompt, mv, instrumental, negativeTags, metadata);

        createAndStoreTrack(result.id, {
          title: result.title || 'Inspiration Track',
          status: (result.status === 'error' ? 'processing' : result.status) || 'processing',
          tags: prompt.split(' ').slice(0, 3),
          mode
        });

        return success(res, {
          taskId: result.id,
          status: result.status,
          message: '音乐生成任务已创建'
        });
      }

      // AI全流程模式
      if (mode === 'full_ai' || mode === 'lyrics_only' || mode === 'music_only') {
        const result = await musicOrchestrator.createMusicWithAI({
          idea: prompt || '',
          style: tags,
          mood,
          mode,
          llmProvider: llmProvider as LLMProvider,
          title,
          lyrics,
          tags
        });

        if (result.taskId) {
          createAndStoreTrack(result.taskId, {
            title: result.title,
            status: result.status as 'processing' | 'complete' | 'error',
            tags: result.style,
            mood: result.mood,
            lyrics: result.lyrics,
            llmUsed: result.llmUsed,
            mode
          });
        }

        return success(res, {
          taskId: result.taskId,
          title: result.title,
          lyrics: result.lyrics,
          style: result.style,
          mood: result.mood,
          llmUsed: result.llmUsed,
          status: result.status
        });
      }

      // 默认：灵感模式
      if (!mode && prompt) {
        const result = await sunoService.createWithPrompt(prompt, mv, instrumental, negativeTags, metadata);

        createAndStoreTrack(result.id, {
          title: result.title || 'AI Generated Track',
          status: (result.status === 'error' ? 'processing' : result.status) || 'processing',
          tags: prompt.split(' ').slice(0, 3),
          mode: 'inspiration'
        });

        return success(res, {
          taskId: result.id,
          status: result.status,
          message: '音乐生成任务已创建'
        });
      }

      return fail(res, 1001, '请提供有效的生成参数', 400);
    } catch (error: any) {
      logger.error('Music creation failed', { error: error.message, stack: error.stack });

      // 检查是否是余额不足错误
      const errorMessage = error.message || '';
      const isBalanceError = errorMessage.includes('余额') ||
                            errorMessage.includes('balance') ||
                            errorMessage.includes('insufficient') ||
                            errorMessage.includes('points') ||
                            errorMessage.includes('积分') ||
                            error.code === 'INSUFFICIENT_BALANCE';

      if (isBalanceError) {
        return fail(res, 2002, 'Suno API 余额不足，请充值后重试。错误详情: ' + errorMessage, 402);
      }

      // 检查是否是认证错误
      const isAuthError = errorMessage.includes('认证') ||
                         errorMessage.includes('auth') ||
                         errorMessage.includes('401') ||
                         errorMessage.includes('403') ||
                         error.code === 'AUTH_FAILED';

      if (isAuthError) {
        return fail(res, 2002, 'Suno API 认证失败，请检查 API Key 配置。错误详情: ' + errorMessage, 401);
      }

      // 检查是否是网络错误
      const isNetworkError = errorMessage.includes('网络') ||
                            errorMessage.includes('network') ||
                            errorMessage.includes('ECONNREFUSED') ||
                            errorMessage.includes('ETIMEDOUT') ||
                            errorMessage.includes('timeout');

      if (isNetworkError) {
        return fail(res, 2002, 'Suno API 网络连接失败，请检查网络或 API 地址配置。错误详情: ' + errorMessage, 503);
      }

      // 不再返回 mock 数据，直接返回错误信息
      return fail(res, 2002, `音乐生成失败: ${errorMessage}`, 500);
    }
  })
);

/**
 * @route GET /api/music/status/:id
 * @desc 查询歌曲生成状态
 * @access Public
 */
router.get('/status/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      return fail(res, 1001, '任务ID不能为空', 400);
    }

    // 如果是 mock 任务，返回错误提示
    if (id.startsWith('mock_')) {
      return fail(res, 2002, 'Mock 任务无法查询真实状态。请配置正确的 Suno API 以生成真实音乐。', 400);
    }

    try {
      const result = await sunoService.getMusicById(id);

      // Update the track in store with the latest status
      const existingTrack = musicStore.getTrack(id);
      if (existingTrack) {
        musicStore.updateTrack(id, {
          status: result.status as 'processing' | 'complete' | 'error',
          audioUrl: result.audio_url,
          videoUrl: result.video_url,
          imageUrl: result.image_url,
          duration: result.duration,
          lyrics: result.lyrics,
          title: result.title || existingTrack.title,
          // 保存错误信息
          errorMessage: result.errormsg,
          errorMessageEn: result.errormsgEn,
          sunoId: result.custom_id,
        });
      }

      return success(res, {
        id: result.id,
        status: result.status,
        title: result.title,
        audioUrl: result.audio_url,
        videoUrl: result.video_url,
        imageUrl: result.image_url,
        duration: result.duration,
        lyrics: result.lyrics,
        createdAt: result.created_at,
        // Pass through Suno task failure details (if any)
        errorMessage: result.errormsg,
        errorMessageEn: result.errormsgEn,
        sunoId: result.custom_id,
      });
    } catch (error: any) {
      logger.error('Get music status failed', { id, error: error.message });

      // 如果是 mock 任务，返回错误提示
      if (id.startsWith('mock_')) {
        return fail(res, 2002, 'Mock 任务无法查询真实状态，请使用真实的 Suno API', 400);
      }

      // 不再返回 mock 数据，直接返回错误
      return fail(res, 2002, `查询失败: ${error.message}`, 500);
    }
  })
);

/**
 * @route POST /api/music/wait/:id
 * @desc 等待音乐生成完成
 * @access Public
 */
router.post('/wait/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { maxWait = 300000 } = req.body;

    if (!id) {
      return fail(res, 1001, '任务ID不能为空', 400);
    }

    try {
      const result = await sunoService.waitForCompletion(id, maxWait);

      // Update the track in store with completion data
      const existingTrack = musicStore.getTrack(id);
      if (existingTrack) {
        musicStore.updateTrack(id, {
          status: result.status as 'processing' | 'complete' | 'error',
          audioUrl: result.audio_url,
          videoUrl: result.video_url,
          imageUrl: result.image_url,
          duration: result.duration,
          lyrics: result.lyrics
        });
      }

      return success(res, {
        id: result.id,
        status: result.status,
        title: result.title,
        audioUrl: result.audio_url,
        videoUrl: result.video_url,
        imageUrl: result.image_url,
        duration: result.duration,
        lyrics: result.lyrics
      });
    } catch (error: any) {
      logger.error('Wait for completion failed', { id, error: error.message });

      // Mark as failed in store
      const existingTrack = musicStore.getTrack(id);
      if (existingTrack) {
        musicStore.updateTrack(id, { status: 'error' });
      }

      return fail(res, 2003, `等待超时: ${error.message}`, 500);
    }
  })
);

/**
 * @route POST /api/music/upload
 * @desc 上传音频（用于翻唱）- 通过URL
 * @access Public
 */
router.post('/upload',
  asyncHandler(async (req: Request, res: Response) => {
    const { audio_url } = req.body;

    if (!audio_url) {
      return fail(res, 1001, '请提供音频URL地址', 400);
    }

    try {
      const uploadId = await sunoService.uploadAudio(audio_url);

      return success(res, {
        uploadId,
        message: '音频上传任务已创建'
      });
    } catch (error: any) {
      logger.error('Audio upload failed', { error: error.message });
      return fail(res, 3001, `上传失败: ${error.message}`, 500);
    }
  })
);

/**
 * @route POST /api/music/cover
 * @desc 创建翻唱
 * @access Public
 */
router.post('/cover',
  musicGenerationLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    // 支持 upload_id 和 cover_clip_id 两种参数名
    const coverClipId = req.body.cover_clip_id || req.body.upload_id;
    const { prompt, tags, lyrics, negativeTags, metadata } = req.body;

    if (!coverClipId) {
      return fail(res, 1001, '翻唱歌曲ID (cover_clip_id 或 upload_id) 不能为空', 400);
    }

    logger.info('Cover creation request', {
      coverClipId,
      prompt: prompt?.substring(0, 50),
      tags,
      hasLyrics: !!lyrics,
      negativeTags,
      metadata
    });

    try {
      const result = await sunoService.createCover({
        coverClipId,
        prompt: lyrics || prompt,
        tags: tags,
        negativeTags,
        metadata,
      });

      // 存储翻唱任务到 musicStore
      const taskId = result.id || `cover_${Date.now()}`;
      const tagArray = tags ? tags.split(',').map((t: string) => t.trim()) : [];

      musicStore.setTrack({
        id: taskId,
        title: `Cover - ${tags || 'AI Style'}`,
        status: 'processing',
        tags: tagArray,
        createdAt: new Date().toISOString(),
        isFavorite: false,
        mode: 'cover',
        lyrics: lyrics || prompt
      });

      logger.info('Cover task created', { taskId, status: 'processing' });

      return success(res, {
        taskId,
        id: taskId,
        status: 'processing',
        title: `Cover - ${tags || 'AI Style'}`,
        tags: tagArray,
        message: '翻唱任务已创建'
      });
    } catch (error: any) {
      logger.error('Cover creation failed', { error: error.message });

      // 检查错误类型并返回适当的错误信息
      const errorMessage = error.message || '';
      if (errorMessage.includes('余额') || errorMessage.includes('balance') || errorMessage.includes('积分')) {
        return fail(res, 2002, 'Suno API 余额不足，请充值后重试。错误详情: ' + errorMessage, 402);
      }

      return fail(res, 2002, `翻唱创建失败: ${errorMessage}`, 500);
    }
  })
);

/**
 * @route POST /api/music/whole-song/:clipId
 * @desc 获取整首歌曲（合并多个片段）
 * @access Public
 */
router.post('/whole-song/:clipId',
  asyncHandler(async (req: Request, res: Response) => {
    const { clipId } = req.params;

    if (!clipId) {
      return fail(res, 1001, '请提供歌曲片段ID', 400);
    }

    try {
      const taskId = await sunoService.getWholeSong(clipId);

      // 存储任务
      musicStore.setTrack({
        id: taskId,
        title: `Whole Song - ${clipId}`,
        status: 'processing',
        tags: [],
        createdAt: new Date().toISOString(),
        isFavorite: false,
        mode: 'whole-song'
      });

      return success(res, {
        taskId,
        clipId,
        status: 'processing',
        message: '整首歌曲生成任务已创建'
      });
    } catch (error: any) {
      logger.error('Whole song request failed', { error: error.message });
      return fail(res, 2002, `整首歌曲请求失败: ${error.message}`, 500);
    }
  })
);

/**
 * @route POST /api/music/aligned-lyrics
 * @desc 获取歌词时间戳对齐（卡拉OK功能）
 * @access Public
 */
router.post('/aligned-lyrics',
  asyncHandler(async (req: Request, res: Response) => {
    const { sunoId, lyrics } = req.body;

    if (!sunoId) {
      return fail(res, 1001, '请提供Suno音乐ID (sunoId)', 400);
    }

    if (!lyrics) {
      return fail(res, 1001, '请提供歌词内容 (lyrics)', 400);
    }

    try {
      const taskId = await sunoService.getAlignedLyrics(sunoId, lyrics);

      return success(res, {
        taskId,
        sunoId,
        status: 'processing',
        message: '歌词时间戳任务已创建，请使用taskId查询结果'
      });
    } catch (error: any) {
      logger.error('Aligned lyrics request failed', { error: error.message });
      return fail(res, 2002, `歌词时间戳请求失败: ${error.message}`, 500);
    }
  })
);

/**
 * @route POST /api/music/remaster
 * @desc Remaster音乐 - 提升音质
 * @access Public
 */
router.post('/remaster',
  musicGenerationLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { clipId, modelName, variationCategory } = req.body;

    if (!clipId) {
      return fail(res, 1001, '请提供Suno音乐ID (clipId)', 400);
    }

    try {
      const taskIds = await sunoService.remasterMusic(clipId, modelName, variationCategory);

      // 存储任务
      for (const taskId of taskIds) {
        musicStore.setTrack({
          id: taskId,
          title: `Remaster - ${clipId}`,
          status: 'processing',
          tags: [],
          createdAt: new Date().toISOString(),
          isFavorite: false,
          mode: 'remaster'
        });
      }

      return success(res, {
        taskIds,
        clipId,
        status: 'processing',
        message: 'Remaster任务已创建，一次生成两首歌曲'
      });
    } catch (error: any) {
      logger.error('Remaster request failed', { error: error.message });
      return fail(res, 2002, `Remaster请求失败: ${error.message}`, 500);
    }
  })
);

/**
 * @route POST /api/music/video
 * @desc 生成音乐视频
 * @access Public
 */
router.post('/video',
  musicGenerationLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { taskId, sunoId } = req.body;

    if (!taskId || !sunoId) {
      return fail(res, 1001, '请提供taskId和sunoId', 400);
    }

    try {
      const videoTaskId = await sunoService.generateMusicVideo(taskId, sunoId);

      return success(res, {
        taskId: videoTaskId,
        originalTaskId: taskId,
        sunoId,
        status: 'processing',
        message: '音乐视频生成任务已创建'
      });
    } catch (error: any) {
      logger.error('Music video request failed', { error: error.message });
      return fail(res, 2002, `音乐视频请求失败: ${error.message}`, 500);
    }
  })
);

/**
 * @route POST /api/music/convert-wav
 * @desc 转换为WAV格式
 * @access Public
 */
router.post('/convert-wav',
  asyncHandler(async (req: Request, res: Response) => {
    const { taskId, sunoId } = req.body;

    if (!taskId || !sunoId) {
      return fail(res, 1001, '请提供taskId和sunoId', 400);
    }

    try {
      const wavTaskId = await sunoService.convertToWav(taskId, sunoId);

      return success(res, {
        taskId: wavTaskId,
        originalTaskId: taskId,
        sunoId,
        status: 'processing',
        message: 'WAV格式转换任务已创建'
      });
    } catch (error: any) {
      logger.error('WAV conversion request failed', { error: error.message });
      return fail(res, 2002, `WAV转换请求失败: ${error.message}`, 500);
    }
  })
);

/**
 * @route POST /api/music/crop
 * @desc 裁剪音乐
 * @access Public
 */
router.post('/crop',
  asyncHandler(async (req: Request, res: Response) => {
    const { clipId, cropStartS, cropEndS } = req.body;

    if (!clipId) {
      return fail(res, 1001, '请提供Suno音乐ID (clipId)', 400);
    }

    if (cropStartS === undefined || cropEndS === undefined) {
      return fail(res, 1001, '请提供裁剪开始时间 (cropStartS) 和结束时间 (cropEndS)', 400);
    }

    if (cropStartS < 0 || cropEndS <= cropStartS) {
      return fail(res, 1001, '裁剪时间参数无效：cropEndS必须大于cropStartS，且cropStartS不能为负数', 400);
    }

    try {
      const cropTaskId = await sunoService.cropMusic(clipId, cropStartS, cropEndS);

      // 存储任务
      musicStore.setTrack({
        id: cropTaskId,
        title: `Crop - ${clipId}`,
        status: 'processing',
        tags: [],
        createdAt: new Date().toISOString(),
        isFavorite: false,
        mode: 'crop'
      });

      return success(res, {
        taskId: cropTaskId,
        clipId,
        cropStartS,
        cropEndS,
        status: 'processing',
        message: '裁剪任务已创建'
      });
    } catch (error: any) {
      logger.error('Crop request failed', { error: error.message });
      return fail(res, 2002, `裁剪请求失败: ${error.message}`, 500);
    }
  })
);

/**
 * @route POST /api/music/speed
 * @desc 调整音乐速度
 * @access Public
 */
router.post('/speed',
  asyncHandler(async (req: Request, res: Response) => {
    const { clipId, speedMultiplier, keepPitch, title } = req.body;

    if (!clipId) {
      return fail(res, 1001, '请提供Suno音乐ID (clipId)', 400);
    }

    if (!speedMultiplier) {
      return fail(res, 1001, '请提供速度倍数 (speedMultiplier)', 400);
    }

    const validSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
    if (!validSpeeds.includes(speedMultiplier)) {
      return fail(res, 1001, `无效的速度倍数，支持: ${validSpeeds.join(', ')}`, 400);
    }

    try {
      const speedTaskId = await sunoService.adjustSpeed(clipId, speedMultiplier, keepPitch, title);

      // 存储任务
      musicStore.setTrack({
        id: speedTaskId,
        title: title || `Speed ${speedMultiplier}x - ${clipId}`,
        status: 'processing',
        tags: [],
        createdAt: new Date().toISOString(),
        isFavorite: false,
        mode: 'speed'
      });

      return success(res, {
        taskId: speedTaskId,
        clipId,
        speedMultiplier,
        keepPitch: keepPitch || false,
        status: 'processing',
        message: '速度调整任务已创建'
      });
    } catch (error: any) {
      logger.error('Speed adjustment request failed', { error: error.message });
      return fail(res, 2002, `速度调整请求失败: ${error.message}`, 500);
    }
  })
);

export default router;
