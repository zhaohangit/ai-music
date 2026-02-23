import { Router, Request, Response } from 'express';
import { success, fail } from '../utils/response';
import { asyncHandler, lyricsGenerationLimiter } from '../middleware';
import { validateLyricsGeneration, validateStyleRecommendation } from '../middleware/validator';
import glmService from '../services/glmService';
import musicOrchestrator from '../services/musicOrchestrator';
import logger from '../utils/logger';

const router = Router();

/**
 * @route POST /api/lyrics/generate
 * @desc 生成歌词
 * @access Public
 */
router.post('/generate',
  lyricsGenerationLimiter,
  validateLyricsGeneration,
  asyncHandler(async (req: Request, res: Response) => {
    const { idea, style, mood } = req.body;

    logger.info('Lyrics generation request', {
      idea: idea?.substring(0, 50),
      style,
      mood
    });

    try {
      const result = await glmService.generateLyrics(idea, style || '流行', mood || '温暖');

      return success(res, {
        title: result.title,
        lyrics: result.lyrics,
        style,
        mood
      });
    } catch (error: any) {
      logger.error('Lyrics generation failed', { error: error.message });

      // Return mock data when API fails (for development/testing)
      if (process.env.NODE_ENV === 'development') {
        logger.info('Returning mock lyrics data');

        // Detect language from the idea - if contains Chinese characters, use Chinese
        const isChineseInput = /[\u4e00-\u9fff]/.test(idea || '');
        const isChineseStyle = /国风|古风|中文|中国/.test(style || '');

        // Generate varied mock lyrics based on style, mood, and idea
        const randomId = Math.random().toString(36).substr(2, 6);
        let mockTitle: string;
        let mockLyrics: string;

        // Extract keywords from the idea for more personalized lyrics
        const ideaKeywords = idea ? idea.slice(0, 20) : '';
        const titleBase = ideaKeywords || `${style || '流行'}旋律`;

        if (isChineseInput || isChineseStyle) {
          // Chinese style lyrics with variation
          const moodWords: Record<string, string> = {
            'energetic': '热血沸腾',
            'romantic': '温柔浪漫',
            'relaxing': '悠然自得',
            'dreamy': '如梦似幻',
            'intense': '激情澎湃',
            'melancholic': '淡淡忧伤',
            'peaceful': '宁静祥和',
            'epic': '宏大壮阔',
            'playful': '俏皮欢快'
          };
          const moodWord = moodWords[mood?.toLowerCase() || ''] || mood || '温暖';

          const styleWords: Record<string, string> = {
            'electronic': '电子节拍',
            'pop': '流行旋律',
            'rock': '摇滚节拍',
            'classical': '古典韵味',
            'jazz': '爵士风情',
            'hiphop': '说唱节奏',
            'hip-hop': '说唱节奏',
            'country': '乡村民谣',
            'rnb': '节奏蓝调'
          };
          const styleWord = styleWords[style?.toLowerCase() || ''] || style || '流行';

          // Generate title based on the idea
          mockTitle = `${titleBase} - ${styleWord}之曲`;

          // Varied lyrics templates
          const verseVariations = [
            `夜色渐浓星光闪
${moodWord}的心情在蔓延
每一个音符都在诉说
关于梦想的故事永不灭`,
            `晨曦微露阳光照
新的一天已经开始
让${styleWord}带我们飞翔
心中的旋律永不停止`,
            `风吹过脸庞的时候
想起了那些美好时光
${moodWord}的感觉涌上心头
这首歌唱出我们的梦想`,
            `城市的霓虹在闪烁
节奏在心中不停跳动
${styleWord}伴随着我们前行
每一步都充满力量与希望`
          ];

          const chorusVariations = [
            `这是我们共同的时刻
感受音乐感受脉搏
让旋律带我们远航
这是梦想启航的地方`,
            `跟随节拍一起舞动
释放心中的所有热情
${moodWord}的力量在涌动
让音乐成为我们永恒的梦`,
            `让歌声穿越云层
让旋律传遍四方
这就是我们的${styleWord}时光
永远闪耀永不消散`
          ];

          const bridgeVariations = [
            `紧握这一瞬间
感受${moodWord}的力量
让旋律带我们飞翔
向着更远的地方`,
            `时光匆匆不停歇
但音乐永不会改变
这就是我们的歌
永远在心中回响`,
            `抬头仰望星空
梦想就在前方
用${styleWord}书写传奇
这就是我们的篇章`
          ];

          const selectedVerse = verseVariations[Math.floor(Math.random() * verseVariations.length)];
          const selectedChorus = chorusVariations[Math.floor(Math.random() * chorusVariations.length)];
          const selectedBridge = bridgeVariations[Math.floor(Math.random() * bridgeVariations.length)];

          mockLyrics = `[Intro]
${styleWord} melody begins to play

[Verse 1]
${selectedVerse}

[Chorus]
${selectedChorus}

[Verse 2]
时光流转不停歇
每个瞬间都值得纪念
用歌声记录下这感受
让${moodWord}永远流传

[Chorus]
${selectedChorus}

[Bridge]
${selectedBridge}

[Chorus]
${selectedChorus}

[Outro]
音乐永不停歇...`;
        } else {
          // English style lyrics with variation
          const moodWords: Record<string, string> = {
            'energetic': 'energetic',
            'romantic': 'romantic',
            'relaxing': 'peaceful',
            'dreamy': 'dreamy',
            'intense': 'intense',
            'melancholic': 'melancholic',
            'peaceful': 'serene',
            'epic': 'epic',
            'playful': 'playful'
          };
          const moodWord = moodWords[mood?.toLowerCase() || ''] || mood || 'warm';

          mockTitle = `${titleBase} - ${style || 'Pop'} Dream`;

          const verseVariations = [
            `The night is young, the stars align
${moodWord.charAt(0).toUpperCase() + moodWord.slice(1)} feelings fill the air tonight
Every note tells a story true
Of dreams and hopes for me and you`,
            `Morning breaks with golden light
A brand new day is shining bright
Let ${style?.toLowerCase() || 'music'} guide us on our way
The melody will always stay`,
            `When the wind blows soft and free
I think of all we're meant to be
${moodWord.charAt(0).toUpperCase() + moodWord.slice(1)} moments fill my heart
This song is where our journey starts`,
            `City lights are glowing bright
The rhythm keeps us moving through the night
${style?.toLowerCase() || 'Music'} leads us to new heights
Every step feels so alive and right`
          ];

          const chorusVariations = [
            `This is our moment, this is our time
Feel the rhythm, feel the rhyme
Let the music set us free
This is where we're meant to be`,
            `Dancing to the beat so strong
Where we know we all belong
${moodWord.charAt(0).toUpperCase() + moodWord.slice(1)} energy takes flight
Making everything feel right`,
            `Let the melody carry us high
Underneath the open sky
This is our ${style?.toLowerCase() || 'song'} to sing
The joy that music brings`
          ];

          const bridgeVariations = [
            `Take my hand and hold on tight
We'll make it through the darkest night
Feel the ${moodWord} energy
Setting our spirits free`,
            `Time moves on but we remain
Connected by this sweet refrain
This is our song, our story told
More precious far than any gold`,
            `Look up at the stars above
Dreams are made of faith and love
With ${style?.toLowerCase() || 'music'} as our guiding light
We'll reach new heights tonight`
          ];

          const selectedVerse = verseVariations[Math.floor(Math.random() * verseVariations.length)];
          const selectedChorus = chorusVariations[Math.floor(Math.random() * chorusVariations.length)];
          const selectedBridge = bridgeVariations[Math.floor(Math.random() * bridgeVariations.length)];

          mockLyrics = `[Intro]
${style?.toLowerCase() || 'Melody'} begins to play

[Verse 1]
${selectedVerse}

[Chorus]
${selectedChorus}

[Verse 2]
Time flows on without an end
Every moment's worth the wait
Captured in a melody
The feelings that we create

[Chorus]
${selectedChorus}

[Bridge]
${selectedBridge}

[Chorus]
${selectedChorus}

[Outro]
The music never ends...`;
        }

        return success(res, {
          title: mockTitle,
          lyrics: mockLyrics,
          style: style || 'Pop',
          mood: mood || 'Warm'
        });
      }

      return fail(res, 3002, `歌词生成失败: ${error.message}`, 500);
    }
  })
);

/**
 * @route POST /api/lyrics/enhance
 * @desc 增强提示词
 * @access Public
 */
router.post('/enhance',
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt } = req.body;

    if (!prompt) {
      return fail(res, 1001, '提示词不能为空', 400);
    }

    try {
      const enhancedPrompt = await glmService.enhancePrompt(prompt);

      return success(res, {
        originalPrompt: prompt,
        enhancedPrompt
      });
    } catch (error: any) {
      logger.error('Prompt enhancement failed', { error: error.message });
      return fail(res, 3002, `提示词增强失败: ${error.message}`, 500);
    }
  })
);

/**
 * @route POST /api/lyrics/polish
 * @desc 润色歌词
 * @access Public
 */
router.post('/polish',
  asyncHandler(async (req: Request, res: Response) => {
    const { lyrics, style } = req.body;

    if (!lyrics) {
      return fail(res, 1001, '歌词不能为空', 400);
    }

    try {
      const polishedLyrics = await musicOrchestrator.polishLyrics(lyrics, style || '流行');

      return success(res, {
        originalLyrics: lyrics,
        polishedLyrics,
        style
      });
    } catch (error: any) {
      logger.error('Lyrics polishing failed', { error: error.message });
      return fail(res, 3002, `歌词润色失败: ${error.message}`, 500);
    }
  })
);

/**
 * @route POST /api/lyrics/recommend-style
 * @desc 智能风格推荐
 * @access Public
 */
router.post('/recommend-style',
  validateStyleRecommendation,
  asyncHandler(async (req: Request, res: Response) => {
    const { description } = req.body;

    try {
      const result = await glmService.recommendStyle(description);

      return success(res, {
        description,
        recommendedTags: result.tags,
        mood: result.mood,
        tempo: result.tempo
      });
    } catch (error: any) {
      logger.error('Style recommendation failed', { error: error.message });
      return fail(res, 3002, `风格推荐失败: ${error.message}`, 500);
    }
  })
);

export default router;
