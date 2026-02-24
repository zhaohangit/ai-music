import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
  Book,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Music,
  DollarSign,
  Clock,
  Video,
  FileAudio,
  Scissors,
  Gauge,
  Upload,
  Wand2,
  RefreshCw,
  FileText,
  Mic
} from 'lucide-react';

const DocsContainer = styled.div`
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const DocsHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const DocsTitle = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const DocsSubtitle = styled.p`
  font-size: 1rem;
  color: #8B8B9F;
  margin: 0;
`;

const ApiCard = styled.div`
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s ease;

  &:hover {
    border-color: rgba(102, 126, 234, 0.3);
  }
`;

const ApiCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.03);
  }
`;

const ApiHeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const ApiIcon = styled.div<{ $color: string }>`
  width: 44px;
  height: 44px;
  background: ${props => props.$color};
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
`;

const ApiInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ApiName = styled.h3`
  font-size: 1.0625rem;
  font-weight: 600;
  color: #FFFFFF;
  margin: 0;
`;

const ApiDescription = styled.p`
  font-size: 0.875rem;
  color: #8B8B9F;
  margin: 0;
`;

const ApiHeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const PriceTag = styled.span<{ $free?: boolean }>`
  padding: 4px 12px;
  background: ${props => props.$free ? 'rgba(16, 185, 129, 0.2)' : 'rgba(102, 126, 234, 0.2)'};
  border-radius: 20px;
  color: ${props => props.$free ? '#10B981' : '#667EEA'};
  font-size: 0.8125rem;
  font-weight: 600;
`;

const MethodTag = styled.span<{ $method: string }>`
  padding: 4px 10px;
  background: ${props => {
    switch (props.$method) {
      case 'GET': return 'rgba(16, 185, 129, 0.2)';
      case 'POST': return 'rgba(59, 130, 246, 0.2)';
      default: return 'rgba(107, 114, 128, 0.2)';
    }
  }};
  border-radius: 6px;
  color: ${props => {
    switch (props.$method) {
      case 'GET': return '#10B981';
      case 'POST': return '#3B82F6';
      default: return '#6B7280';
    }
  }};
  font-size: 0.75rem;
  font-weight: 700;
  font-family: 'Monaco', 'Consolas', monospace;
`;

const ApiCardBody = styled.div<{ $expanded: boolean }>`
  max-height: ${props => props.$expanded ? '2000px' : '0'};
  overflow: hidden;
  transition: max-height 0.3s ease;
`;

const ApiContent = styled.div`
  padding: 0 24px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
`;

const SectionTitle = styled.h4`
  font-size: 0.875rem;
  font-weight: 600;
  color: #9B9BB0;
  margin: 20px 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ParamsTable = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ParamRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 10px;
`;

const ParamName = styled.code`
  font-size: 0.875rem;
  color: #667EEA;
  font-family: 'Monaco', 'Consolas', monospace;
  min-width: 140px;
`;

const ParamInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ParamType = styled.span`
  font-size: 0.75rem;
  color: #F59E0B;
  font-family: 'Monaco', 'Consolas', monospace;
`;

const ParamDesc = styled.span`
  font-size: 0.875rem;
  color: #8B8B9F;
`;

const RequiredBadge = styled.span`
  padding: 2px 6px;
  background: rgba(239, 68, 68, 0.2);
  border-radius: 4px;
  color: #EF4444;
  font-size: 0.6875rem;
  font-weight: 600;
`;

const CodeBlock = styled.div`
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 10px;
  padding: 16px;
  overflow-x: auto;
`;

const Code = styled.pre`
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 0.8125rem;
  color: #E5E7EB;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
`;

const CopyButton = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 6px;
  color: #8B8B9F;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #FFFFFF;
  }
`;

const EndpointUrl = styled.code`
  display: inline-block;
  padding: 8px 14px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 0.875rem;
  color: #667EEA;
  margin-bottom: 16px;
`;

interface ApiItem {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  iconColor: string;
  method: 'GET' | 'POST';
  endpoint: string;
  price: string;
  isFree: boolean;
  params?: { name: string; type: string; required?: boolean; description: string }[];
  responseBody?: string;
  notes?: string[];
}

const apiItems: ApiItem[] = [
  {
    id: 'balance',
    name: '查询积分余额',
    description: '查询当前商户的积分余额，此接口不消耗积分',
    icon: <DollarSign size={22} />,
    iconColor: 'linear-gradient(135deg, #10B981, #059669)',
    method: 'GET',
    endpoint: '/api/music/balance',
    price: '免费',
    isFree: true,
    responseBody: `{
  "success": true,
  "data": {
    "balance": 1000,
    "currency": "points",
    "message": "剩余积分: 1000"
  }
}`
  },
  {
    id: 'generate',
    name: '生成音乐',
    description: '核心接口。支持灵感模式、自定义模式、延长、翻唱功能。一次生成两首歌。',
    icon: <Music size={22} />,
    iconColor: 'linear-gradient(135deg, #667EEA, #764BA2)',
    method: 'POST',
    endpoint: '/api/music/create',
    price: '0.36¥/次',
    isFree: false,
    params: [
      { name: 'mode', type: 'string', description: '模式：inspiration(灵感), custom(自定义), full_ai' },
      { name: 'prompt', type: 'string', description: '音乐描述或歌词内容' },
      { name: 'title', type: 'string', description: '歌名 (V4限80字，V5限100字)' },
      { name: 'tags', type: 'string', description: '音乐风格 (如: pop, rock)' },
      { name: 'mv', type: 'string', description: '模型版本: v3.5, v4, v4.5, v5' },
      { name: 'instrumental', type: 'boolean', description: '是否纯音乐 (无歌词)' },
      { name: 'llmProvider', type: 'string', description: 'LLM提供商: glm, joybuilder' },
    ],
    responseBody: `{
  "success": true,
  "data": {
    "taskId": "199824",
    "status": "processing",
    "message": "音乐生成任务已创建"
  }
}`
  },
  {
    id: 'extend',
    name: '歌曲续写',
    description: '从指定位置继续创作歌曲',
    icon: <Scissors size={22} />,
    iconColor: 'linear-gradient(135deg, #F59E0B, #D97706)',
    method: 'POST',
    endpoint: '/api/music/extend',
    price: '0.36¥/次',
    isFree: false,
    params: [
      { name: 'clipId', type: 'string', required: true, description: '被延长的歌曲ID' },
      { name: 'continueAt', type: 'number', description: '从第几秒开始延长' },
      { name: 'lyrics', type: 'string', description: '续写部分的歌词' },
      { name: 'tags', type: 'string', description: '风格标签' },
      { name: 'title', type: 'string', description: '续写后歌名' },
    ],
    responseBody: `{
  "success": true,
  "data": {
    "taskId": "199824",
    "status": "processing",
    "message": "歌曲续写任务已创建"
  }
}`
  },
  {
    id: 'cover',
    name: '翻唱',
    description: '基于已有歌曲创建翻唱版本',
    icon: <Mic size={22} />,
    iconColor: 'linear-gradient(135deg, #EC4899, #BE185D)',
    method: 'POST',
    endpoint: '/api/music/cover',
    price: '0.36¥/次',
    isFree: false,
    params: [
      { name: 'cover_clip_id', type: 'string', required: true, description: '原歌曲ID' },
      { name: 'prompt', type: 'string', description: '歌词内容' },
      { name: 'tags', type: 'string', description: '风格标签' },
    ],
  },
  {
    id: 'status',
    name: '查询音乐任务',
    description: '查询音乐生成任务的状态和结果',
    icon: <Clock size={22} />,
    iconColor: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
    method: 'GET',
    endpoint: '/api/music/status/:id',
    price: '免费',
    isFree: true,
    params: [
      { name: 'id', type: 'string', required: true, description: '任务ID (路径参数)' },
    ],
    responseBody: `{
  "success": true,
  "data": {
    "id": "199824",
    "status": "complete",
    "title": "My Song",
    "audioUrl": "https://...",
    "videoUrl": "https://...",
    "imageUrl": "https://...",
    "duration": 180
  }
}`,
    notes: ['status: processing(生成中), complete(成功), error(失败)']
  },
  {
    id: 'batch-status',
    name: '批量查询音乐任务',
    description: '批量查询多个音乐生成任务的状态',
    icon: <RefreshCw size={22} />,
    iconColor: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    method: 'POST',
    endpoint: '/api/music/batch-status',
    price: '免费',
    isFree: true,
    params: [
      { name: 'ids', type: 'string[]', required: true, description: '任务ID数组 (最多50个)' },
    ],
  },
  {
    id: 'whole-song',
    name: '获取整首歌',
    description: '合并多个片段为完整歌曲',
    icon: <FileAudio size={22} />,
    iconColor: 'linear-gradient(135deg, #06B6D4, #0891B2)',
    method: 'POST',
    endpoint: '/api/music/whole-song/:clipId',
    price: '0.01¥/次',
    isFree: false,
    params: [
      { name: 'clipId', type: 'string', required: true, description: 'Suno音乐ID (路径参数)' },
    ],
  },
  {
    id: 'aligned-lyrics',
    name: '获取歌词时间戳',
    description: '获取歌词的时间戳对齐信息（卡拉OK功能）',
    icon: <FileText size={22} />,
    iconColor: 'linear-gradient(135deg, #84CC16, #65A30D)',
    method: 'POST',
    endpoint: '/api/music/aligned-lyrics',
    price: '0.01¥/次',
    isFree: false,
    params: [
      { name: 'sunoId', type: 'string', required: true, description: 'Suno音乐ID (必须是已完成的歌曲)' },
      { name: 'lyrics', type: 'string', required: true, description: '歌词内容' },
    ],
    notes: ['返回的alignment数组包含每个字的开始和结束时间']
  },
  {
    id: 'remaster',
    name: 'Remaster音乐',
    description: '提升现有音乐的音质，一次生成两首歌',
    icon: <Wand2 size={22} />,
    iconColor: 'linear-gradient(135deg, #F97316, #EA580C)',
    method: 'POST',
    endpoint: '/api/music/remaster',
    price: '0.36¥/次',
    isFree: false,
    params: [
      { name: 'clipId', type: 'string', required: true, description: 'Suno音乐ID' },
      { name: 'modelName', type: 'string', description: '模型: v5=chirp-carp, v4.5=chirp-bass, v4=chirp-up' },
      { name: 'variationCategory', type: 'string', description: '变化程度: subtle, normal, high (仅V5)' },
    ],
  },
  {
    id: 'video',
    name: '生成音乐视频',
    description: '为音乐生成配套视频',
    icon: <Video size={22} />,
    iconColor: 'linear-gradient(135deg, #EF4444, #DC2626)',
    method: 'POST',
    endpoint: '/api/music/video',
    price: '0.01¥/次',
    isFree: false,
    params: [
      { name: 'taskId', type: 'string', required: true, description: '任务ID' },
      { name: 'sunoId', type: 'string', required: true, description: 'Suno音乐ID' },
    ],
  },
  {
    id: 'wav',
    name: '转WAV格式',
    description: '将音乐转换为高质量WAV格式',
    icon: <FileAudio size={22} />,
    iconColor: 'linear-gradient(135deg, #14B8A6, #0D9488)',
    method: 'POST',
    endpoint: '/api/music/convert-wav',
    price: '0.01¥/次',
    isFree: false,
    params: [
      { name: 'taskId', type: 'string', required: true, description: '任务ID' },
      { name: 'sunoId', type: 'string', required: true, description: 'Suno音乐ID' },
    ],
  },
  {
    id: 'crop',
    name: '裁剪音乐',
    description: '裁剪音乐片段',
    icon: <Scissors size={22} />,
    iconColor: 'linear-gradient(135deg, #A855F7, #9333EA)',
    method: 'POST',
    endpoint: '/api/music/crop',
    price: '0.01¥/次',
    isFree: false,
    params: [
      { name: 'clipId', type: 'string', required: true, description: 'Suno音乐ID' },
      { name: 'cropStartS', type: 'number', required: true, description: '裁剪开始时间（秒）' },
      { name: 'cropEndS', type: 'number', required: true, description: '裁剪结束时间（秒）' },
    ],
  },
  {
    id: 'speed',
    name: '调整音乐速度',
    description: '调整音乐播放速度',
    icon: <Gauge size={22} />,
    iconColor: 'linear-gradient(135deg, #6366F1, #4F46E5)',
    method: 'POST',
    endpoint: '/api/music/speed',
    price: '0.01¥/次',
    isFree: false,
    params: [
      { name: 'clipId', type: 'string', required: true, description: 'Suno音乐ID' },
      { name: 'speedMultiplier', type: 'number', required: true, description: '速度倍数: 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2' },
      { name: 'keepPitch', type: 'boolean', description: '是否保持高音' },
      { name: 'title', type: 'string', description: '歌名' },
    ],
  },
  {
    id: 'upload',
    name: '上传参考音频',
    description: '上传参考音频用于后续操作（延长、翻唱等）',
    icon: <Upload size={22} />,
    iconColor: 'linear-gradient(135deg, #22C55E, #16A34A)',
    method: 'POST',
    endpoint: '/api/music/upload',
    price: '0.01¥/次',
    isFree: false,
    params: [
      { name: 'audio_url', type: 'string', required: true, description: '音频文件URL' },
    ],
  },
];

export const ApiDocsView: React.FC = () => {
  const { t } = useTranslation();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(['generate']));
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleItem = (id: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <DocsContainer>
      <DocsHeader>
        <DocsTitle>
          <Book size={28} color="#667EEA" />
          Suno API 文档
        </DocsTitle>
        <DocsSubtitle>
          AI音乐生成平台API接口说明，支持音乐生成、续写、翻唱、视频生成等功能
        </DocsSubtitle>
      </DocsHeader>

      {apiItems.map((item) => (
        <ApiCard key={item.id}>
          <ApiCardHeader onClick={() => toggleItem(item.id)}>
            <ApiHeaderLeft>
              <ApiIcon $color={item.iconColor}>
                {item.icon}
              </ApiIcon>
              <ApiInfo>
                <ApiName>{item.name}</ApiName>
                <ApiDescription>{item.description}</ApiDescription>
              </ApiInfo>
            </ApiHeaderLeft>
            <ApiHeaderRight>
              <MethodTag $method={item.method}>{item.method}</MethodTag>
              <PriceTag $free={item.isFree}>{item.price}</PriceTag>
              {expandedItems.has(item.id) ? (
                <ChevronDown size={20} color="#8B8B9F" />
              ) : (
                <ChevronRight size={20} color="#8B8B9F" />
              )}
            </ApiHeaderRight>
          </ApiCardHeader>

          <ApiCardBody $expanded={expandedItems.has(item.id)}>
            <ApiContent>
              <EndpointUrl>{item.endpoint}</EndpointUrl>

              {item.params && item.params.length > 0 && (
                <>
                  <SectionTitle>请求参数</SectionTitle>
                  <ParamsTable>
                    {item.params.map((param, idx) => (
                      <ParamRow key={idx}>
                        <ParamName>{param.name}</ParamName>
                        <ParamInfo>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ParamType>{param.type}</ParamType>
                            {param.required && <RequiredBadge>必填</RequiredBadge>}
                          </div>
                          <ParamDesc>{param.description}</ParamDesc>
                        </ParamInfo>
                      </ParamRow>
                    ))}
                  </ParamsTable>
                </>
              )}

              {item.responseBody && (
                <>
                  <SectionTitle>响应示例</SectionTitle>
                  <CodeBlock>
                    <CopyButton onClick={() => copyCode(item.responseBody!, item.id)}>
                      {copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}
                      {copiedId === item.id ? '已复制' : '复制'}
                    </CopyButton>
                    <Code>{item.responseBody}</Code>
                  </CodeBlock>
                </>
              )}

              {item.notes && item.notes.length > 0 && (
                <>
                  <SectionTitle>说明</SectionTitle>
                  <ul style={{ color: '#8B8B9F', fontSize: '0.875rem', paddingLeft: 20, margin: 0 }}>
                    {item.notes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </>
              )}
            </ApiContent>
          </ApiCardBody>
        </ApiCard>
      ))}
    </DocsContainer>
  );
};

export default ApiDocsView;
