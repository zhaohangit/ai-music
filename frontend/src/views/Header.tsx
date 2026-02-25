import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Search, Bell, Globe, ChevronDown, CheckCircle, AlertCircle, Info, Coins } from 'lucide-react';
import { musicApi } from '../services/api';

const HeaderContainer = styled.header`
  height: 56px;
  background: #FFFFFF;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
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
  gap: 10px;
  background: #F5F5F7;
  border-radius: 8px;
  padding: 8px 14px;
  width: 280px;
  transition: all 0.15s ease;

  &:focus-within {
    background: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(250, 45, 72, 0.1);
  }
`;

const SearchIcon = styled(Search)`
  color: #86868B;
  width: 16px;
  height: 16px;
`;

const SearchInput = styled.input`
  flex: 1;
  background: transparent;
  border: none;
  color: #1D1D1F;
  font-size: 0.875rem;
  outline: none;

  &::placeholder {
    color: #86868B;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const IconButton = styled.button`
  width: 36px;
  height: 36px;
  background: #F5F5F7;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6E6E73;
  transition: all 0.15s ease;
  position: relative;
  cursor: pointer;

  &:hover {
    background: #E8E8ED;
    color: #1D1D1F;
  }
`;

const NotificationBadgeWrapper = styled.div`
  position: absolute;
  top: -2px;
  right: -2px;
`;

const LanguageSelector = styled.div`
  position: relative;
`;

const LanguageButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  color: #6E6E73;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #F5F5F7;
    color: #1D1D1F;
  }
`;

const LanguageDropdown = styled.div<{ $open: boolean }>`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 6px;
  min-width: 130px;
  opacity: ${props => props.$open ? 1 : 0};
  visibility: ${props => props.$open ? 'visible' : 'hidden'};
  transform: translateY(${props => props.$open ? 0 : '-6px'});
  transition: all 0.15s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
`;

const LanguageOption = styled.button<{ $selected?: boolean }>`
  width: 100%;
  padding: 8px 10px;
  background: ${props => props.$selected ? 'rgba(250, 45, 72, 0.1)' : 'transparent'};
  border: none;
  border-radius: 6px;
  color: ${props => props.$selected ? '#FA2D48' : '#1D1D1F'};
  font-size: 0.8125rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.1s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
`;

const CreditsBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: linear-gradient(135deg, rgba(250, 45, 72, 0.08) 0%, rgba(250, 45, 72, 0.04) 100%);
  border: 1px solid rgba(250, 45, 72, 0.15);
  border-radius: 16px;
  color: #FA2D48;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: default;

  svg {
    width: 14px;
    height: 14px;
    opacity: 0.8;
  }
`;

const NotificationSelector = styled.div`
  position: relative;
`;

const NotificationDropdown = styled.div<{ $open: boolean }>`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  width: 300px;
  max-height: 380px;
  overflow: hidden;
  opacity: ${props => props.$open ? 1 : 0};
  visibility: ${props => props.$open ? 'visible' : 'hidden'};
  transform: translateY(${props => props.$open ? 0 : '-6px'});
  transition: all 0.15s ease;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
`;

const NotificationHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
`;

const NotificationTitle = styled.span`
  font-size: 0.8125rem;
  font-weight: 600;
  color: #1D1D1F;
`;

const NotificationBadge = styled.span<{ $count: number }>`
  background: ${props => props.$count > 0 ? '#FA2D48' : 'transparent'};
  color: white;
  font-size: 0.6875rem;
  padding: 2px 6px;
  border-radius: 8px;
  margin-left: 6px;
  display: ${props => props.$count > 0 ? 'inline' : 'none'};
`;

const NotificationBadgeInline = styled.span<{ $count: number }>`
  background: #FA2D48;
  color: white;
  font-size: 0.625rem;
  font-weight: 600;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  display: ${props => props.$count > 0 ? 'flex' : 'none'};
  align-items: center;
  justify-content: center;
  padding: 0 4px;
`;

const ClearAllButton = styled.button`
  background: none;
  border: none;
  color: #86868B;
  font-size: 0.6875rem;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: all 0.1s ease;

  &:hover {
    color: #1D1D1F;
    background: rgba(0, 0, 0, 0.04);
  }
`;

const NotificationList = styled.div`
  max-height: 300px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.15);
    border-radius: 2px;
  }
`;

const NotificationItem = styled.div<{ $read?: boolean }>`
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  background: ${props => props.$read ? 'transparent' : 'rgba(250, 45, 72, 0.03)'};
  cursor: pointer;
  transition: background 0.1s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.02);
  }

  &:last-child {
    border-bottom: none;
  }
`;

const NotificationIconWrapper = styled.div<{ $type: 'success' | 'error' | 'info' | 'warning' }>`
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: ${props => {
    switch (props.$type) {
      case 'success': return 'rgba(52, 199, 89, 0.12)';
      case 'error': return 'rgba(255, 59, 48, 0.12)';
      case 'warning': return 'rgba(255, 149, 0, 0.12)';
      default: return 'rgba(250, 45, 72, 0.12)';
    }
  }};
  color: ${props => {
    switch (props.$type) {
      case 'success': return '#34C759';
      case 'error': return '#FF3B30';
      case 'warning': return '#FF9500';
      default: return '#FA2D48';
    }
  }};
`;

const NotificationContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const NotificationMessage = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  color: #1D1D1F;
  line-height: 1.35;
`;

const NotificationTime = styled.span`
  font-size: 0.6875rem;
  color: #86868B;
  margin-top: 3px;
  display: block;
`;

const NotificationEmpty = styled.div`
  padding: 28px 14px;
  text-align: center;
  color: #86868B;
  font-size: 0.8125rem;
`;

const languages = [
  { code: 'en', name: 'English', flag: 'EN' },
  { code: 'zh-CN', name: '简体中文', flag: '中' },
  { code: 'ja', name: '日本語', flag: '日' },
  { code: 'ko', name: '한국어', flag: '한' },
];

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  time: string;
  read: boolean;
}

export const Header: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [languageOpen, setLanguageOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState(i18n.language || 'en');
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const notificationRef = useRef<HTMLDivElement>(null);
  const languageRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'info',
      message: t('header.welcomeMessage', 'Welcome to AI Music Creator'),
      time: new Date().toISOString(),
      read: false,
    },
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
      if (languageRef.current && !languageRef.current.contains(event.target as Node)) {
        setLanguageOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const response = await musicApi.getBalance();
        if (response.success && response.data) {
          const balance = response.data.balance;
          setCredits(balance);

          if (balance < 10) {
            setNotifications(prev => [{
              id: Date.now().toString(),
              type: 'warning',
              message: t('header.lowCredits', `Low credits (${balance} remaining)`),
              time: new Date().toISOString(),
              read: false,
            }, ...prev]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch balance:', error);
        setCredits(null);
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [t]);

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setCurrentLang(langCode);
    setLanguageOpen(false);
  };

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return t('time.justNow', 'Just now');
    if (diffMins < 60) return t('time.minutesAgo', `${diffMins}m ago`);
    if (diffHours < 24) return t('time.hoursAgo', `${diffHours}h ago`);
    return t('time.daysAgo', `${diffDays}d ago`);
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success': return <CheckCircle size={14} />;
      case 'error': return <AlertCircle size={14} />;
      case 'warning': return <AlertCircle size={14} />;
      default: return <Info size={14} />;
    }
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
        <NotificationSelector ref={notificationRef}>
          <IconButton
            title={t('header.notifications', 'Notifications')}
            onClick={() => setNotificationOpen(!notificationOpen)}
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <NotificationBadgeWrapper>
                <NotificationBadgeInline $count={unreadCount}>
                  {unreadCount}
                </NotificationBadgeInline>
              </NotificationBadgeWrapper>
            )}
          </IconButton>
          <NotificationDropdown $open={notificationOpen}>
            <NotificationHeader>
              <div>
                <NotificationTitle>{t('header.notifications', 'Notifications')}</NotificationTitle>
                <NotificationBadge $count={unreadCount}>{unreadCount}</NotificationBadge>
              </div>
              {notifications.length > 0 && (
                <ClearAllButton onClick={clearAllNotifications}>
                  {t('common.clearAll', 'Clear')}
                </ClearAllButton>
              )}
            </NotificationHeader>
            <NotificationList>
              {notifications.length > 0 ? (
                notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    $read={notification.read}
                    onClick={() => markAsRead(notification.id)}
                  >
                    <NotificationIconWrapper $type={notification.type}>
                      {getNotificationIcon(notification.type)}
                    </NotificationIconWrapper>
                    <NotificationContent>
                      <NotificationMessage>{notification.message}</NotificationMessage>
                      <NotificationTime>{formatTime(notification.time)}</NotificationTime>
                    </NotificationContent>
                  </NotificationItem>
                ))
              ) : (
                <NotificationEmpty>
                  {t('header.noNotifications', 'No notifications')}
                </NotificationEmpty>
              )}
            </NotificationList>
          </NotificationDropdown>
        </NotificationSelector>

        <LanguageSelector ref={languageRef}>
          <LanguageButton onClick={() => setLanguageOpen(!languageOpen)}>
            <Globe size={14} />
            <span>{currentLanguage.flag}</span>
            <ChevronDown size={12} />
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

        <CreditsBadge title={t('header.credits', 'Credits')}>
          <Coins size={14} />
          <span>{loading ? '...' : credits !== null ? credits : '--'}</span>
        </CreditsBadge>
      </HeaderActions>
    </HeaderContainer>
  );
};

export default Header;
