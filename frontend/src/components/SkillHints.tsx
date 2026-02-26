import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Lightbulb, Info, AlertTriangle, X, Sparkles } from 'lucide-react';
import { useSkill } from '../contexts/SkillContext';

const HintsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
`;

const HintCard = styled.div<{ $type: 'info' | 'tip' | 'warning' }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: ${props => {
    switch (props.$type) {
      case 'tip': return 'linear-gradient(135deg, rgba(250, 45, 72, 0.05), rgba(252, 60, 68, 0.05))';
      case 'warning': return 'rgba(255, 149, 0, 0.08)';
      default: return 'rgba(0, 122, 255, 0.05)';
    }
  }};
  border: 1px solid ${props => {
    switch (props.$type) {
      case 'tip': return 'rgba(250, 45, 72, 0.15)';
      case 'warning': return 'rgba(255, 149, 0, 0.2)';
      default: return 'rgba(0, 122, 255, 0.1)';
    }
  }};
  border-radius: 12px;
  position: relative;
  animation: slideIn 0.3s ease;

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const HintIcon = styled.div<{ $type: 'info' | 'tip' | 'warning' }>`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: ${props => {
    switch (props.$type) {
      case 'tip': return 'rgba(250, 45, 72, 0.1)';
      case 'warning': return 'rgba(255, 149, 0, 0.15)';
      default: return 'rgba(0, 122, 255, 0.1)';
    }
  }};
  color: ${props => {
    switch (props.$type) {
      case 'tip': return '#FA2D48';
      case 'warning': return '#FF9500';
      default: return '#007AFF';
    }
  }};
`;

const HintContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const HintTitle = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: #1D1D1F;
  margin-bottom: 4px;
`;

const HintText = styled.div`
  font-size: 0.8125rem;
  color: #6E6E73;
  line-height: 1.5;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #86868B;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #1D1D1F;
  }
`;

const SkillStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(250, 45, 72, 0.05);
  border: 1px solid rgba(250, 45, 72, 0.1);
  border-radius: 8px;
  font-size: 0.75rem;
  color: #86868B;
`;

const SkillName = styled.span`
  color: #FA2D48;
  font-weight: 500;
`;

/**
 * 技能提示组件 - 显示当前页面的技能提示
 */
export const SkillHints: React.FC = () => {
  const { t } = useTranslation();
  const { hints, loading, skillContext, dismissHint } = useSkill();

  if (loading) return null;

  return (
    <HintsContainer>
      {/* 技能状态指示器 */}
      {skillContext && (
        <SkillStatus>
          <Sparkles size={14} color="#FA2D48" />
          <span>
            {t('skills.skillActive', '技能已激活')}: <SkillName>{skillContext.name}</SkillName>
          </span>
        </SkillStatus>
      )}

      {/* 提示卡片 */}
      {hints.map(hint => (
        <HintCard key={hint.id} $type={hint.type}>
          <HintIcon $type={hint.type}>
            {hint.type === 'tip' && <Lightbulb size={18} />}
            {hint.type === 'warning' && <AlertTriangle size={18} />}
            {hint.type === 'info' && <Info size={18} />}
          </HintIcon>
          <HintContent>
            <HintTitle>{hint.title}</HintTitle>
            <HintText>{hint.content}</HintText>
          </HintContent>
          <CloseButton onClick={() => dismissHint(hint.id)}>
            <X size={14} />
          </CloseButton>
        </HintCard>
      ))}
    </HintsContainer>
  );
};

// 迷你提示按钮
const MiniHintButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(250, 45, 72, 0.08);
  border: 1px solid rgba(250, 45, 72, 0.12);
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 500;
  color: #FA2D48;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(250, 45, 72, 0.12);
  }
`;

/**
 * 迷你技能提示按钮 - 用于标题栏或操作栏
 */
export const SkillMiniHint: React.FC = () => {
  const { t } = useTranslation();
  const { hints, skillContext, showHint, activeHint, hideHint } = useSkill();

  if (!skillContext || hints.length === 0) return null;

  return (
    <>
      <MiniHintButton onClick={() => showHint(hints[0].id)}>
        <Lightbulb size={14} />
        {t('skills.viewTips', '查看技巧')}
      </MiniHintButton>

      {activeHint && (
        <HintCard $type={activeHint.type} style={{ position: 'fixed', bottom: 20, right: 20, maxWidth: 360, zIndex: 1000 }}>
          <HintIcon $type={activeHint.type}>
            {activeHint.type === 'tip' && <Lightbulb size={18} />}
            {activeHint.type === 'warning' && <AlertTriangle size={18} />}
            {activeHint.type === 'info' && <Info size={18} />}
          </HintIcon>
          <HintContent>
            <HintTitle>{activeHint.title}</HintTitle>
            <HintText>{activeHint.content}</HintText>
          </HintContent>
          <CloseButton onClick={hideHint}>
            <X size={14} />
          </CloseButton>
        </HintCard>
      )}
    </>
  );
};

export default SkillHints;
