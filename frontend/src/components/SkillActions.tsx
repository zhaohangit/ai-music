import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Zap, Wand2, Music, Mic, FileText, Sliders, Sparkles, Dice5, Lightbulb, Palette } from 'lucide-react';
import { useSkill } from '../contexts/SkillContext';

const ActionsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'outline' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  border-radius: 10px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  ${props => {
    switch (props.$variant) {
      case 'primary':
        return `
          background: linear-gradient(135deg, #FA2D48, #FC3C44);
          color: white;
          box-shadow: 0 2px 8px rgba(250, 45, 72, 0.25);

          &:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(250, 45, 72, 0.35);
          }
        `;
      case 'secondary':
        return `
          background: rgba(250, 45, 72, 0.08);
          color: #FA2D48;
          border: 1px solid rgba(250, 45, 72, 0.15);

          &:hover {
            background: rgba(250, 45, 72, 0.12);
          }
        `;
      default:
        return `
          background: #FFFFFF;
          color: #1D1D1F;
          border: 1px solid rgba(0, 0, 0, 0.08);

          &:hover {
            background: #F5F5F7;
          }
        `;
    }
  }}

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const ActionIcon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const QuickActionsPanel = styled.div`
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 20px;
`;

const PanelTitle = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: #1D1D1F;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
`;

const ActionCard = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: ${props => props.$variant === 'primary'
    ? 'linear-gradient(135deg, rgba(250, 45, 72, 0.1), rgba(252, 60, 68, 0.05))'
    : '#FAFAFA'};
  border: 1px solid ${props => props.$variant === 'primary'
    ? 'rgba(250, 45, 72, 0.2)'
    : 'rgba(0, 0, 0, 0.05)'};
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${props => props.$variant === 'primary'
      ? 'linear-gradient(135deg, rgba(250, 45, 72, 0.15), rgba(252, 60, 68, 0.1))'
      : 'rgba(250, 45, 72, 0.05)'};
    border-color: rgba(250, 45, 72, 0.2);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const CardIcon = styled.div<{ $primary?: boolean }>`
  width: 40px;
  height: 40px;
  background: ${props => props.$primary
    ? 'linear-gradient(135deg, #FA2D48, #FC3C44)'
    : 'rgba(250, 45, 72, 0.1)'};
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.$primary ? 'white' : '#FA2D48'};
`;

const CardLabel = styled.span`
  font-size: 0.8125rem;
  font-weight: 500;
  color: #1D1D1F;
  text-align: center;
`;

const CardDescription = styled.span`
  font-size: 0.6875rem;
  color: #86868B;
  text-align: center;
  line-height: 1.4;
`;

// 模板选择器样式
const TemplateModal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const TemplateContent = styled.div`
  background: white;
  border-radius: 20px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
`;

const TemplateTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TemplateList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const TemplateItem = styled.button`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  background: #F5F5F7;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(250, 45, 72, 0.05);
    border-color: rgba(250, 45, 72, 0.2);
  }
`;

const TemplateIcon = styled.div`
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #FA2D48, #FC3C44);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
`;

const TemplateText = styled.div`
  flex: 1;
`;

const TemplateName = styled.div`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1D1D1F;
  margin-bottom: 4px;
`;

const TemplateDesc = styled.div`
  font-size: 0.8125rem;
  color: #86868B;
  line-height: 1.4;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  background: #F5F5F7;
  border: none;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6E6E73;

  &:hover {
    background: #E8E8ED;
  }
`;

// 图标映射
const iconMap: Record<string, React.ReactNode> = {
  'wand': <Wand2 size={20} />,
  'music': <Music size={20} />,
  'mic': <Mic size={20} />,
  'file-text': <FileText size={20} />,
  'sliders': <Sliders size={20} />,
  'sparkles': <Sparkles size={20} />,
  'dice': <Dice5 size={20} />,
  'lightbulb': <Lightbulb size={20} />,
  'palette': <Palette size={20} />,
  'zap': <Zap size={20} />,
};

// 灵感模板数据
const inspirationTemplates = [
  {
    id: 'summer-pop',
    name: '夏日清新流行',
    prompt: '一首轻快的夏日流行歌曲，节奏明快，旋律朗朗上口，充满阳光和活力的感觉',
    genre: 'Pop',
    mood: 'Energetic'
  },
  {
    id: 'night-jazz',
    name: '深夜爵士',
    prompt: '一首慵懒的深夜爵士乐曲，萨克斯独奏，钢琴伴奏，营造浪漫的夜晚氛围',
    genre: 'Jazz',
    mood: 'Romantic'
  },
  {
    id: 'dreamy-electronic',
    name: '梦幻电子',
    prompt: '一首空灵的电子音乐，合成器铺底，带有梦幻般的氛围感，适合冥想和放松',
    genre: 'Electronic',
    mood: 'Dreamy'
  },
  {
    id: 'epic-classical',
    name: '史诗古典',
    prompt: '一首宏大的古典交响乐，弦乐和铜管乐器交织，充满戏剧性和史诗感',
    genre: 'Classical',
    mood: 'Intense'
  },
  {
    id: 'street-hiphop',
    name: '街头说唱',
    prompt: '一首有力的嘻哈说唱歌曲，重低音鼓点，流畅的节奏，展现都市街头文化',
    genre: 'Hip-Hop',
    mood: 'Energetic'
  },
  {
    id: 'acoustic-ballad',
    name: '木吉他民谣',
    prompt: '一首温暖的木吉他民谣，简单的编曲，真挚的情感，讲述一个动人的故事',
    genre: 'Pop',
    mood: 'Relaxing'
  }
];

// 风格组合
const styleCombos = [
  { genres: ['Electronic', 'Pop'], moods: ['Dreamy', 'Energetic'] },
  { genres: ['Jazz', 'Classical'], moods: ['Romantic', 'Relaxing'] },
  { genres: ['Hip-Hop', 'Rock'], moods: ['Intense', 'Energetic'] },
  { genres: ['Pop', 'Classical'], moods: ['Romantic', 'Dreamy'] },
];

interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  variant?: 'primary' | 'secondary';
  onClick: () => void;
}

interface SkillQuickActionsProps {
  customActions?: QuickAction[];
}

/**
 * 技能快捷操作面板 - 显示基于技能的快捷操作
 */
export const SkillQuickActions: React.FC<SkillQuickActionsProps> = ({ customActions }) => {
  const { t } = useTranslation();
  const { skillContext, registerAction, executeAction } = useSkill();
  const [showTemplates, setShowTemplates] = useState(false);

  // 根据页面技能生成默认操作
  const getDefaultActions = (): QuickAction[] => {
    if (!skillContext) return [];

    const actions: QuickAction[] = [];

    // 创作页面 - 真正有用的快捷操作
    if (skillContext.name === 'music-create' || skillContext.name?.includes('create')) {
      actions.push(
        {
          id: 'quick-generate',
          label: t('skills.quickGenerate', '一键生成'),
          description: t('skills.quickGenerateDesc', '用当前描述直接生成'),
          icon: 'sparkles',
          variant: 'primary',
          onClick: () => {
            window.dispatchEvent(new CustomEvent('skill:quick-generate'));
          }
        },
        {
          id: 'inspiration-templates',
          label: t('skills.templates', '灵感模板'),
          description: t('skills.templatesDesc', '高质量创意模板'),
          icon: 'lightbulb',
          variant: 'secondary',
          onClick: () => {
            setShowTemplates(true);
          }
        },
        {
          id: 'random-style',
          label: t('skills.randomStyle', '随机风格'),
          description: t('skills.randomStyleDesc', '发现新的风格组合'),
          icon: 'dice',
          onClick: () => {
            window.dispatchEvent(new CustomEvent('skill:random-style'));
          }
        }
      );
    }

    // 翻唱页面 - 真正有用的快捷操作
    if (skillContext.name === 'ai-cover' || skillContext.name?.includes('cover')) {
      actions.push(
        {
          id: 'quick-upload',
          label: t('skills.quickUpload', '快速上传'),
          description: t('skills.quickUploadDesc', '上传音频开始翻唱'),
          icon: 'mic',
          variant: 'primary',
          onClick: () => {
            window.dispatchEvent(new CustomEvent('skill:quick-upload'));
          }
        },
        {
          id: 'hot-styles',
          label: t('skills.hotStyles', '热门风格'),
          description: t('skills.hotStylesDesc', '流行翻唱风格'),
          icon: 'palette',
          variant: 'secondary',
          onClick: () => {
            window.dispatchEvent(new CustomEvent('skill:hot-styles'));
          }
        },
        {
          id: 'style-mix',
          label: t('skills.styleMix', '风格融合'),
          description: t('skills.styleMixDesc', '混合多种风格'),
          icon: 'sliders',
          onClick: () => {
            window.dispatchEvent(new CustomEvent('skill:style-mixer'));
          }
        }
      );
    }

    return actions;
  };

  const actions = customActions || getDefaultActions();

  // 注册操作到上下文
  React.useEffect(() => {
    actions.forEach(action => {
      registerAction({
        id: action.id,
        label: action.label,
        description: action.description,
        action: action.onClick
      });
    });
  }, [actions, registerAction]);

  // 处理模板选择
  const handleTemplateSelect = (template: typeof inspirationTemplates[0]) => {
    window.dispatchEvent(new CustomEvent('skill:apply-template', {
      detail: template
    }));
    setShowTemplates(false);
  };

  if (actions.length === 0) return null;

  return (
    <>
      <QuickActionsPanel>
        <PanelTitle>
          <Zap size={16} color="#FA2D48" />
          {t('skills.quickActions', '快捷操作')}
        </PanelTitle>
        <ActionGrid>
          {actions.map(action => (
            <ActionCard
              key={action.id}
              $variant={action.variant}
              onClick={() => {
                executeAction(action.id);
                action.onClick();
              }}
            >
              <CardIcon $primary={action.variant === 'primary'}>
                {action.icon && iconMap[action.icon] ? iconMap[action.icon] : <Zap size={20} />}
              </CardIcon>
              <CardLabel>{action.label}</CardLabel>
              {action.description && <CardDescription>{action.description}</CardDescription>}
            </ActionCard>
          ))}
        </ActionGrid>
      </QuickActionsPanel>

      {/* 灵感模板选择弹窗 */}
      {showTemplates && (
        <TemplateModal onClick={() => setShowTemplates(false)}>
          <TemplateContent onClick={e => e.stopPropagation()}>
            <TemplateTitle>
              <Lightbulb size={20} color="#FA2D48" />
              {t('skills.templateTitle', '选择灵感模板')}
            </TemplateTitle>
            <TemplateList>
              {inspirationTemplates.map(template => (
                <TemplateItem
                  key={template.id}
                  onClick={() => handleTemplateSelect(template)}
                >
                  <TemplateIcon>
                    <Music size={18} />
                  </TemplateIcon>
                  <TemplateText>
                    <TemplateName>{template.name}</TemplateName>
                    <TemplateDesc>{template.prompt}</TemplateDesc>
                  </TemplateText>
                </TemplateItem>
              ))}
            </TemplateList>
          </TemplateContent>
        </TemplateModal>
      )}
    </>
  );
};

/**
 * 内联技能操作按钮 - 用于表单或操作栏
 */
export const SkillActionButtons: React.FC = () => {
  const { t } = useTranslation();
  const { actions, executeAction } = useSkill();

  if (actions.length === 0) return null;

  return (
    <ActionsContainer>
      {actions.map(action => (
        <ActionButton
          key={action.id}
          onClick={() => executeAction(action.id)}
          $variant="outline"
        >
          <ActionIcon>
            <Wand2 size={14} />
          </ActionIcon>
          {action.label}
        </ActionButton>
      ))}
    </ActionsContainer>
  );
};

// 导出模板数据供其他组件使用
export { inspirationTemplates, styleCombos };

export default SkillQuickActions;
