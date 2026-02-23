import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Search, Bell, Globe, ChevronDown } from 'lucide-react';

const HeaderContainer = styled.header`
  height: 64px;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 50;
`;

const SearchContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 8px 16px;
  width: 320px;
  transition: all 0.2s ease;

  &:focus-within {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(102, 126, 234, 0.5);
  }
`;

const SearchIcon = styled(Search)`
  color: #8B8B9F;
  width: 18px;
  height: 18px;
`;

const SearchInput = styled.input`
  flex: 1;
  background: transparent;
  border: none;
  color: #FFFFFF;
  font-size: 0.875rem;
  outline: none;

  &::placeholder {
    color: #8B8B9F;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const IconButton = styled.button`
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8B8B9F;
  transition: all 0.2s ease;
  position: relative;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #FFFFFF;
  }
`;

const NotificationBadge = styled.span`
  position: absolute;
  top: -4px;
  right: -4px;
  width: 18px;
  height: 18px;
  background: linear-gradient(135deg, #F093FB, #F5576C);
  border-radius: 50%;
  font-size: 0.625rem;
  font-weight: 700;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LanguageSelector = styled.div`
  position: relative;
`;

const LanguageButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #FFFFFF;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
`;

const LanguageDropdown = styled.div<{ $open: boolean }>`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: rgba(26, 26, 46, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 8px;
  min-width: 140px;
  opacity: ${props => props.$open ? 1 : 0};
  visibility: ${props => props.$open ? 'visible' : 'hidden'};
  transform: translateY(${props => props.$open ? 0 : '-8px'});
  transition: all 0.2s ease;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
`;

const LanguageOption = styled.button<{ $selected?: boolean }>`
  width: 100%;
  padding: 10px 12px;
  background: ${props => props.$selected ? 'rgba(102, 126, 234, 0.2)' : 'transparent'};
  border: none;
  border-radius: 8px;
  color: ${props => props.$selected ? '#667EEA' : '#FFFFFF'};
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
`;

const CreditsBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 10px;
  color: #FFFFFF;
  font-size: 0.875rem;
  font-weight: 600;
`;

const CreditsIcon = styled.div`
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, #667EEA, #764BA2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 700;
`;

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
];

export const Header: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [languageOpen, setLanguageOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState(i18n.language || 'en');

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setCurrentLang(langCode);
    setLanguageOpen(false);
  };

  const currentLanguage = languages.find(lang => lang.code === currentLang) || languages[0];

  return (
    <HeaderContainer>
      <SearchContainer>
        <SearchIcon />
        <SearchInput
          type="text"
          placeholder={t('create.promptPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </SearchContainer>

      <HeaderActions>
        <LanguageSelector>
          <LanguageButton onClick={() => setLanguageOpen(!languageOpen)}>
            <Globe size={16} />
            <span>{currentLanguage.flag} {currentLanguage.name}</span>
            <ChevronDown size={14} />
          </LanguageButton>
          <LanguageDropdown $open={languageOpen}>
            {languages.map((lang) => (
              <LanguageOption
                key={lang.code}
                $selected={lang.code === currentLang}
                onClick={() => changeLanguage(lang.code)}
              >
                {lang.flag} {lang.name}
              </LanguageOption>
            ))}
          </LanguageDropdown>
        </LanguageSelector>

        <IconButton>
          <Bell size={18} />
          <NotificationBadge>3</NotificationBadge>
        </IconButton>

        <CreditsBadge>
          <CreditsIcon>⚡</CreditsIcon>
          <span>500 Credits</span>
        </CreditsBadge>
      </HeaderActions>
    </HeaderContainer>
  );
};

export default Header;
