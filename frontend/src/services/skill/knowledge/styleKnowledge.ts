/**
 * 风格知识库
 * 包含各种音乐风格的详细信息、组合推荐和规则
 */

import { StyleKnowledge, GenreInfo, StyleCombination, RecommendationRule } from '../types';

/**
 * 流派信息
 */
export const genreInfo: Record<string, GenreInfo> = {
  pop: {
    name: 'Pop',
    nameCn: '流行',
    description: '流行音乐，旋律朗朗上口，结构简单',
    characteristics: ['易于传唱', '结构简单', '旋律优美', '节奏明快'],
    bpmRange: [90, 130],
    suitableFor: ['日常听歌', '聚会', '运动', '驾车'],
    compatibleMoods: ['energetic', 'romantic', 'relaxing', 'happy'],
    exampleDescription: '一首轻快的流行歌曲，旋律优美，易于传唱',
  },
  rock: {
    name: 'Rock',
    nameCn: '摇滚',
    description: '摇滚音乐，充满力量和激情',
    characteristics: ['强劲节奏', '电吉他主导', '鼓点有力', '情感强烈'],
    bpmRange: [100, 160],
    suitableFor: ['运动', '派对', '释放压力'],
    compatibleMoods: ['energetic', 'intense', 'passionate'],
    exampleDescription: '一首充满力量的摇滚歌曲，电吉他主导，节奏强劲',
  },
  electronic: {
    name: 'Electronic',
    nameCn: '电子',
    description: '电子音乐，合成器和电子节拍为主',
    characteristics: ['合成器音色', '电子节拍', '氛围感强', '重复性强'],
    bpmRange: [120, 150],
    suitableFor: ['运动', '派对', '驾车', '工作'],
    compatibleMoods: ['energetic', 'relaxing', 'dreamy'],
    exampleDescription: '一首动感的电子音乐，合成器音色，节奏鲜明',
  },
  jazz: {
    name: 'Jazz',
    nameCn: '爵士',
    description: '爵士音乐，即兴演奏和复杂和弦',
    characteristics: ['即兴演奏', '复杂和弦', '摇摆节奏', '优雅氛围'],
    bpmRange: [60, 140],
    suitableFor: ['咖啡厅', '夜晚', '约会', '放松'],
    compatibleMoods: ['romantic', 'relaxing', 'nostalgic'],
    exampleDescription: '一首慵懒的爵士乐曲，钢琴即兴，氛围优雅',
  },
  classical: {
    name: 'Classical',
    nameCn: '古典',
    description: '古典音乐，严肃音乐传统',
    characteristics: ['管弦乐编制', '结构严谨', '情感丰富', '历史传承'],
    bpmRange: [40, 180],
    suitableFor: ['放松', '学习', '睡眠', '冥想'],
    compatibleMoods: ['peaceful', 'romantic', 'melancholic', 'epic'],
    exampleDescription: '一首优美的古典乐曲，弦乐编配，情感深邃',
  },
  folk: {
    name: 'Folk',
    nameCn: '民谣',
    description: '民谣音乐，质朴真挚，讲述故事',
    characteristics: ['木吉他为主', '歌词叙事性强', '质朴自然', '情感真挚'],
    bpmRange: [70, 120],
    suitableFor: ['夜晚', '旅行', '放松', '思考'],
    compatibleMoods: ['nostalgic', 'peaceful', 'melancholic', 'warm'],
    exampleDescription: '一首质朴的民谣歌曲，木吉他伴奏，讲述动人故事',
  },
  'hip-hop': {
    name: 'Hip-Hop',
    nameCn: '嘻哈',
    description: '嘻哈音乐，节奏感强，说唱为主',
    characteristics: ['强烈节拍', '说唱形式', '采样技术', '街头文化'],
    bpmRange: [80, 120],
    suitableFor: ['运动', '派对', '驾车'],
    compatibleMoods: ['energetic', 'confident', 'cool'],
    exampleDescription: '一首动感的嘻哈歌曲，强烈节拍，说唱流畅',
  },
  'r&b': {
    name: 'R&B',
    nameCn: '节奏蓝调',
    description: '节奏蓝调，情感细腻，节奏流畅',
    characteristics: ['灵魂唱腔', '节奏流畅', '情感丰富', '和声优美'],
    bpmRange: [60, 100],
    suitableFor: ['约会', '夜晚', '放松'],
    compatibleMoods: ['romantic', 'sensual', 'relaxing'],
    exampleDescription: '一首浪漫的R&B歌曲，灵魂唱腔，情感细腻',
  },
  country: {
    name: 'Country',
    nameCn: '乡村',
    description: '乡村音乐，美国南方风格',
    characteristics: ['吉他伴奏', '歌词叙事', '乡村气息', '温暖亲切'],
    bpmRange: [80, 130],
    suitableFor: ['驾车', '旅行', '放松'],
    compatibleMoods: ['relaxing', 'nostalgic', 'warm', 'happy'],
    exampleDescription: '一首温暖的乡村歌曲，吉他伴奏，讲述生活故事',
  },
  blues: {
    name: 'Blues',
    nameCn: '蓝调',
    description: '蓝调音乐，情感深沉，12小节结构',
    characteristics: ['12小节结构', '情感深沉', '吉他技巧', '忧郁气质'],
    bpmRange: [60, 100],
    suitableFor: ['夜晚', '独处', '思考'],
    compatibleMoods: ['melancholic', 'soulful', 'nostalgic'],
    exampleDescription: '一首深沉的蓝调歌曲，吉他独奏，情感真挚',
  },
  reggae: {
    name: 'Reggae',
    nameCn: '雷鬼',
    description: '雷鬼音乐，牙买加风情',
    characteristics: ['反拍节奏', '低音厚重', '轻松氛围', '加勒比风情'],
    bpmRange: [60, 90],
    suitableFor: ['度假', '海边', '放松'],
    compatibleMoods: ['relaxing', 'happy', 'chill'],
    exampleDescription: '一首轻松的雷鬼歌曲，反拍节奏，加勒比风情',
  },
  metal: {
    name: 'Metal',
    nameCn: '金属',
    description: '金属音乐，重型音色，技术性强',
    characteristics: ['重型吉他', '快速鼓点', '强烈音墙', '技术性高'],
    bpmRange: [100, 200],
    suitableFor: ['运动', '释放压力'],
    compatibleMoods: ['intense', 'energetic', 'powerful'],
    exampleDescription: '一首激烈的金属歌曲，重型吉他，快速节奏',
  },
  soul: {
    name: 'Soul',
    nameCn: '灵魂乐',
    description: '灵魂音乐，情感深沉，源于福音',
    characteristics: ['灵魂唱腔', '情感深沉', '和声丰富', '福音根源'],
    bpmRange: [60, 110],
    suitableFor: ['约会', '放松', '夜晚'],
    compatibleMoods: ['romantic', 'soulful', 'warm'],
    exampleDescription: '一首深情的灵魂乐，灵魂唱腔，情感真挚',
  },
  funk: {
    name: 'Funk',
    nameCn: '放克',
    description: '放克音乐，律动感强，节奏复杂',
    characteristics: ['律动感强', '贝斯主导', '节奏复杂', '舞曲风格'],
    bpmRange: [90, 130],
    suitableFor: ['派对', '舞蹈', '运动'],
    compatibleMoods: ['energetic', 'fun', 'groovy'],
    exampleDescription: '一首律动感的放克歌曲，贝斯主导，节奏复杂',
  },
};

/**
 * 风格组合推荐
 */
export const styleCombinations: StyleCombination[] = [
  {
    genres: ['pop', 'electronic'],
    moods: ['energetic'],
    description: '电子流行，适合派对和运动',
    useCases: ['运动', '派对', '驾车'],
    popularity: 90,
  },
  {
    genres: ['jazz', 'classical'],
    moods: ['romantic', 'relaxing'],
    description: '优雅浪漫，适合约会和放松',
    useCases: ['约会', '晚餐', '放松'],
    popularity: 75,
  },
  {
    genres: ['folk', 'pop'],
    moods: ['nostalgic', 'warm'],
    description: '民谣流行，适合夜晚和思考',
    useCases: ['夜晚', '旅行', '思考'],
    popularity: 80,
  },
  {
    genres: ['rock', 'electronic'],
    moods: ['energetic', 'intense'],
    description: '电子摇滚，充满能量',
    useCases: ['运动', '派对', '释放压力'],
    popularity: 85,
  },
  {
    genres: ['r&b', 'soul'],
    moods: ['romantic', 'sensual'],
    description: '灵魂R&B，浪漫细腻',
    useCases: ['约会', '夜晚', '放松'],
    popularity: 88,
  },
  {
    genres: ['hip-hop', 'electronic'],
    moods: ['energetic', 'cool'],
    description: '电子嘻哈，潮流时尚',
    useCases: ['运动', '派对', '驾车'],
    popularity: 82,
  },
  {
    genres: ['country', 'folk'],
    moods: ['relaxing', 'warm'],
    description: '乡村民谣，温暖质朴',
    useCases: ['驾车', '旅行', '放松'],
    popularity: 70,
  },
  {
    genres: ['jazz', 'hip-hop'],
    moods: ['cool', 'relaxing'],
    description: '爵士嘻哈，优雅放松',
    useCases: ['咖啡厅', '工作', '放松'],
    popularity: 72,
  },
  {
    genres: ['electronic', 'classical'],
    moods: ['dreamy', 'epic'],
    description: '电子古典，史诗氛围',
    useCases: ['电影', '游戏', '冥想'],
    popularity: 65,
  },
  {
    genres: ['reggae', 'pop'],
    moods: ['relaxing', 'happy'],
    description: '雷鬼流行，轻松愉快',
    useCases: ['海边', '度假', '派对'],
    popularity: 68,
  },
];

/**
 * 推荐规则
 */
export const recommendationRules: RecommendationRule[] = [
  // 主题相关规则
  {
    when: { theme: ['夏天', 'summer', 'sunshine', '阳光'] },
    suggest: {
      genres: ['pop', 'electronic'],
      moods: ['energetic', 'relaxing'],
      reason: '夏天的感觉，充满活力或轻松惬意',
    },
    confidence: 0.88,
  },
  {
    when: { theme: ['爱情', 'love', 'romantic', '浪漫', '恋爱'] },
    suggest: {
      genres: ['pop', 'r&b', 'ballad'],
      moods: ['romantic', 'melancholic', 'sweet'],
      reason: '浪漫的情歌，表达爱意',
    },
    confidence: 0.92,
  },
  {
    when: { theme: ['友情', 'friendship', '朋友'] },
    suggest: {
      genres: ['pop', 'folk'],
      moods: ['warm', 'nostalgic', 'happy'],
      reason: '温暖的友情之歌',
    },
    confidence: 0.85,
  },
  {
    when: { theme: ['回忆', 'memory', 'nostalgia', '过去', '怀旧'] },
    suggest: {
      genres: ['folk', 'classical', 'jazz'],
      moods: ['nostalgic', 'melancholic', 'peaceful'],
      reason: '回忆往昔，情感深沉',
    },
    confidence: 0.87,
  },
  {
    when: { theme: ['梦想', 'dream', '希望'] },
    suggest: {
      genres: ['pop', 'rock'],
      moods: ['hopeful', 'energetic', 'powerful'],
      reason: '追逐梦想，充满力量',
    },
    confidence: 0.86,
  },
  {
    when: { theme: ['夜晚', 'night', '月光'] },
    suggest: {
      genres: ['jazz', 'r&b', 'electronic'],
      moods: ['romantic', 'relaxing', 'dreamy'],
      reason: '夜晚的氛围，浪漫或梦幻',
    },
    confidence: 0.84,
  },
  {
    when: { theme: ['旅行', 'travel', '公路', '远方'] },
    suggest: {
      genres: ['folk', 'country', 'rock'],
      moods: ['relaxing', 'hopeful', 'free'],
      reason: '旅途的感觉，自由放松',
    },
    confidence: 0.83,
  },

  // 场景相关规则
  {
    when: { scene: ['运动', 'workout', 'exercise', '跑步', '健身'] },
    suggest: {
      genres: ['electronic', 'hip-hop', 'rock'],
      moods: ['energetic', 'intense', 'powerful'],
      reason: '适合运动的节奏，激励人心',
    },
    confidence: 0.90,
  },
  {
    when: { scene: ['海边', 'beach', '沙滩'] },
    suggest: {
      genres: ['reggae', 'pop', 'electronic'],
      moods: ['relaxing', 'happy', 'chill'],
      reason: '海边的氛围，轻松惬意',
    },
    confidence: 0.88,
  },
  {
    when: { scene: ['驾车', 'driving', '开车'] },
    suggest: {
      genres: ['pop', 'rock', 'country'],
      moods: ['relaxing', 'energetic', 'happy'],
      reason: '适合驾车的节奏',
    },
    confidence: 0.85,
  },
  {
    when: { scene: ['派对', 'party', '聚会', '舞蹈'] },
    suggest: {
      genres: ['electronic', 'pop', 'hip-hop'],
      moods: ['energetic', 'fun', 'dance'],
      reason: '派对的氛围，充满活力',
    },
    confidence: 0.89,
  },
  {
    when: { scene: ['睡前', 'sleep', '睡眠', '放松'] },
    suggest: {
      genres: ['classical', 'ambient', 'folk'],
      moods: ['relaxing', 'peaceful', 'dreamy'],
      reason: '舒缓的节奏，帮助入睡',
    },
    confidence: 0.87,
  },
  {
    when: { scene: ['咖啡厅', 'cafe', '咖啡'] },
    suggest: {
      genres: ['jazz', 'folk', 'indie'],
      moods: ['relaxing', 'chill', 'peaceful'],
      reason: '咖啡厅的氛围，优雅放松',
    },
    confidence: 0.84,
  },
  {
    when: { scene: ['约会', 'date', '晚餐'] },
    suggest: {
      genres: ['jazz', 'r&b', 'soul'],
      moods: ['romantic', 'sensual', 'warm'],
      reason: '浪漫的约会氛围',
    },
    confidence: 0.88,
  },

  // 情绪相关规则
  {
    when: { mood: ['欢快', 'happy', '快乐', '开心'] },
    suggest: {
      genres: ['pop', 'electronic', 'folk'],
      moods: ['energetic', 'happy', 'fun'],
      reason: '欢快的节奏，传递快乐',
    },
    confidence: 0.86,
  },
  {
    when: { mood: ['悲伤', 'sad', '忧郁', '难过'] },
    suggest: {
      genres: ['ballad', 'blues', 'classical'],
      moods: ['melancholic', 'soulful', 'emotional'],
      reason: '表达悲伤的情感',
    },
    confidence: 0.85,
  },
  {
    when: { mood: ['激昂', 'energetic', '激情', '力量'] },
    suggest: {
      genres: ['rock', 'metal', 'electronic'],
      moods: ['energetic', 'powerful', 'intense'],
      reason: '充满力量和激情',
    },
    confidence: 0.87,
  },
  {
    when: { mood: ['放松', 'relaxing', '轻松', 'chill'] },
    suggest: {
      genres: ['jazz', 'folk', 'ambient'],
      moods: ['relaxing', 'peaceful', 'chill'],
      reason: '轻松舒缓的氛围',
    },
    confidence: 0.84,
  },
];

/**
 * 完整的风格知识库
 */
export const styleKnowledge: StyleKnowledge = {
  genres: genreInfo,
  combinations: styleCombinations,
  rules: recommendationRules,
};

export default styleKnowledge;
