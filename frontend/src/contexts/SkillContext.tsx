import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { skillsApi, SkillContext as SkillContextType } from '../services/api';

interface SkillAction {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  action: () => void;
}

interface SkillHint {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'tip' | 'warning';
}

interface SkillContextValue {
  // 技能上下文
  skillContext: SkillContextType | null;
  loading: boolean;
  error: string | null;

  // 技能提示 (UI 提示模式)
  hints: SkillHint[];
  activeHint: SkillHint | null;
  showHint: (hintId: string) => void;
  hideHint: () => void;
  dismissHint: (hintId: string) => void;

  // 技能操作 (功能增强模式)
  actions: SkillAction[];
  registerAction: (action: SkillAction) => void;
  unregisterAction: (actionId: string) => void;
  executeAction: (actionId: string) => void;

  // AI 上下文 (AI 上下文模式)
  getAIContext: () => string;

  // 刷新技能
  refresh: () => Promise<void>;
}

const SkillContextInstance = createContext<SkillContextValue | null>(null);

interface SkillProviderProps {
  page: string;
  children: React.ReactNode;
}

export const SkillProvider: React.FC<SkillProviderProps> = ({ page, children }) => {
  const [skillContext, setSkillContext] = useState<SkillContextType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<SkillHint[]>([]);
  const [activeHint, setActiveHint] = useState<SkillHint | null>(null);
  const [dismissedHints, setDismissedHints] = useState<Set<string>>(new Set());
  const [actions, setActions] = useState<SkillAction[]>([]);

  // 加载技能上下文
  const loadSkillContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await skillsApi.getContext(page);
      if (response.success && response.data) {
        setSkillContext(response.data);

        // 解析技能内容中的提示
        const parsedHints = parseHintsFromContent(response.data.content);
        setHints(parsedHints);

        console.log(`[Skill] Loaded context for ${page}:`, response.data.name);
      } else {
        setSkillContext(null);
        setHints([]);
      }
    } catch (err: any) {
      console.warn('[Skill] Failed to load context:', err);
      setError(err.message || 'Failed to load skill context');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadSkillContext();
  }, [loadSkillContext]);

  // 从技能内容中解析提示
  const parseHintsFromContent = (content: string): SkillHint[] => {
    const hintList: SkillHint[] = [];

    // 解析 ## Tips 或 ## 提示 部分
    const tipsMatch = content.match(/##\s*(Tips|提示|Hints)\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (tipsMatch) {
      const tipsContent = tipsMatch[2];
      const tipLines = tipsContent.split('\n').filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'));

      tipLines.forEach((line, index) => {
        const tipText = line.replace(/^[-*]\s*/, '').trim();
        if (tipText) {
          hintList.push({
            id: `tip-${index}`,
            title: `提示 ${index + 1}`,
            content: tipText,
            type: 'tip'
          });
        }
      });
    }

    // 解析 ## Examples 或 ## 示例 部分
    const examplesMatch = content.match(/##\s*(Examples|示例)\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (examplesMatch) {
      hintList.push({
        id: 'examples',
        title: '使用示例',
        content: '查看技能文档中的示例来获得更好的效果',
        type: 'info'
      });
    }

    // 解析 ## Parameters 或 ## 参数 部分作为提示
    const paramsMatch = content.match(/##\s*(Parameters|参数|Arguments)\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (paramsMatch) {
      hintList.push({
        id: 'parameters',
        title: '参数说明',
        content: '请参考技能文档中的参数说明来优化您的输入',
        type: 'info'
      });
    }

    // 如果没有解析到任何提示，添加默认提示
    if (hintList.length === 0 && content.length > 100) {
      hintList.push({
        id: 'default',
        title: '技能提示',
        content: '此页面已加载专业技能上下文，AI 会根据技能指导优化生成结果',
        type: 'info'
      });
    }

    return hintList;
  };

  // 显示提示
  const showHint = useCallback((hintId: string) => {
    const hint = hints.find(h => h.id === hintId);
    if (hint && !dismissedHints.has(hintId)) {
      setActiveHint(hint);
    }
  }, [hints, dismissedHints]);

  // 隐藏提示
  const hideHint = useCallback(() => {
    setActiveHint(null);
  }, []);

  // 关闭提示 (不再显示)
  const dismissHint = useCallback((hintId: string) => {
    setDismissedHints(prev => new Set([...prev, hintId]));
    setActiveHint(null);
  }, []);

  // 注册操作
  const registerAction = useCallback((action: SkillAction) => {
    setActions(prev => {
      const exists = prev.find(a => a.id === action.id);
      if (exists) {
        return prev.map(a => a.id === action.id ? action : a);
      }
      return [...prev, action];
    });
  }, []);

  // 注销操作
  const unregisterAction = useCallback((actionId: string) => {
    setActions(prev => prev.filter(a => a.id !== actionId));
  }, []);

  // 执行操作
  const executeAction = useCallback((actionId: string) => {
    const action = actions.find(a => a.id === actionId);
    if (action) {
      action.action();
    }
  }, [actions]);

  // 获取 AI 上下文字符串
  const getAIContext = useCallback((): string => {
    if (!skillContext) return '';

    return `[Skill Context: ${skillContext.name}]\n${skillContext.description}\n\n${skillContext.content}`;
  }, [skillContext]);

  // 刷新
  const refresh = useCallback(async () => {
    await loadSkillContext();
  }, [loadSkillContext]);

  const value: SkillContextValue = {
    skillContext,
    loading,
    error,
    hints: hints.filter(h => !dismissedHints.has(h.id)),
    activeHint,
    showHint,
    hideHint,
    dismissHint,
    actions,
    registerAction,
    unregisterAction,
    executeAction,
    getAIContext,
    refresh,
  };

  return (
    <SkillContextInstance.Provider value={value}>
      {children}
    </SkillContextInstance.Provider>
  );
};

// Hook to use skill context
export const useSkill = (): SkillContextValue => {
  const context = useContext(SkillContextInstance);
  if (!context) {
    throw new Error('useSkill must be used within a SkillProvider');
  }
  return context;
};

// Hook for pages that optionally use skill context
export const useOptionalSkill = (): SkillContextValue | null => {
  return useContext(SkillContextInstance);
};

export default SkillContextInstance;
