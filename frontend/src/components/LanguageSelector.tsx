import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown } from 'lucide-react';

export interface LanguageSelectorProps {
  className?: string;
}

const SelectorContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const SelectorButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  color: #FFFFFF;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
  }

  svg {
    width: 18px;
    height: 18px;
  }

  .chevron {
    transition: transform 0.3s ease;

    &.open {
      transform: rotate(180deg);
    }
  }
`;

const DropdownMenu = styled.div<{ isOpen: boolean }>`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 160px;
  background: rgba(30, 30, 40, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  opacity: ${props => props.isOpen ? 1 : 0};
  visibility: ${props => props.isOpen ? 'visible' : 'hidden'};
  transform: translateY(${props => props.isOpen ? '0' : '-10px'});
  transition: all 0.3s ease;
  z-index: 1000;
  overflow: hidden;
`;

const LanguageOption = styled.button<{ isSelected: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: ${props => props.isSelected ? '#667EEA' : '#FFFFFF'};
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  font-weight: ${props => props.isSelected ? '600' : '400'};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  &:first-child {
    border-radius: 16px 16px 0 0;
  }

  &:last-child {
    border-radius: 0 0 16px 16px;
  }

  .flag {
    font-size: 18px;
    line-height: 1;
  }

  .code {
    margin-left: auto;
    font-size: 12px;
    opacity: 0.6;
  }
`;

const languages = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'zh-CN', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' }
];

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  className
}) => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setIsOpen(false);
  };

  const getLanguageCode = (code: string) => {
    switch (code) {
      case 'en': return 'EN';
      case 'zh-CN': return '中文';
      case 'ja': return '日本語';
      case 'ko': return '한국어';
      default: return code.toUpperCase();
    }
  };

  return (
    <SelectorContainer ref={containerRef} className={className}>
      <SelectorButton onClick={() => setIsOpen(!isOpen)}>
        <Globe size={18} />
        <span>{getLanguageCode(currentLanguage.code)}</span>
        <ChevronDown size={16} className={`chevron ${isOpen ? 'open' : ''}`} />
      </SelectorButton>

      <DropdownMenu isOpen={isOpen}>
        {languages.map(language => (
          <LanguageOption
            key={language.code}
            isSelected={language.code === i18n.language}
            onClick={() => handleLanguageChange(language.code)}
          >
            <span className="flag">{language.flag}</span>
            <span>{language.nativeName}</span>
            <span className="code">{language.code.toUpperCase()}</span>
          </LanguageOption>
        ))}
      </DropdownMenu>
    </SelectorContainer>
  );
};

export default LanguageSelector;
