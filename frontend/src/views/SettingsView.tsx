import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  User,
  Globe,
  Bell,
  Shield,
  Palette,
  Volume2,
  CreditCard,
  Info,
  ChevronRight,
  Moon,
  Sun,
  Check
} from 'lucide-react';

const SettingsContainer = styled.div`
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 32px;
`;

const SettingsHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SettingsTitle = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: #1D1D1F;
  margin: 0;
`;

const SettingsSubtitle = styled.p`
  font-size: 1rem;
  color: #86868B;
  margin: 0;
`;

const SettingsSection = styled.div`
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 20px;
  overflow: hidden;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
`;

const SectionIcon = styled.div`
  width: 40px;
  height: 40px;
  background: rgba(250, 45, 72, 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const SectionTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0;
`;

const SectionContent = styled.div`
  padding: 8px 0;
`;

const SettingItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  transition: background 0.2s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.02);
  }
`;

const SettingInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SettingLabel = styled.span`
  font-size: 0.9375rem;
  font-weight: 500;
  color: #1D1D1F;
`;

const SettingDescription = styled.span`
  font-size: 0.8125rem;
  color: #86868B;
`;

const SettingControl = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Toggle = styled.button<{ $active: boolean }>`
  width: 48px;
  height: 28px;
  background: ${props => props.$active ? '#FA2D48' : '#E8E8ED'};
  border-radius: 14px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;

  &::after {
    content: '';
    position: absolute;
    width: 22px;
    height: 22px;
    background: #FFFFFF;
    border-radius: 50%;
    top: 3px;
    left: ${props => props.$active ? '25px' : '3px'};
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
`;

const SelectButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #F5F5F7;
  border: 1px solid transparent;
  border-radius: 10px;
  color: #1D1D1F;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #E8E8ED;
  }
`;

const LanguageGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 16px 24px;
`;

const LanguageOption = styled.button<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: ${props => props.$selected ? 'rgba(250, 45, 72, 0.1)' : '#F5F5F7'};
  border: ${props => props.$selected ? '1px solid rgba(250, 45, 72, 0.2)' : '1px solid transparent'};
  border-radius: 12px;
  color: ${props => props.$selected ? '#FA2D48' : '#1D1D1F'};
  font-size: 0.9375rem;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;

  &:hover {
    background: ${props => props.$selected ? 'rgba(250, 45, 72, 0.15)' : '#E8E8ED'};
  }
`;

const LanguageFlag = styled.span`
  font-size: 1.5rem;
`;

const LanguageInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const LanguageName = styled.span`
  font-weight: 500;
`;

const LanguageNative = styled.span<{ $selected?: boolean }>`
  font-size: 0.8125rem;
  color: ${props => props.$selected ? 'rgba(250, 45, 72, 0.8)' : '#86868B'};
`;

const CheckIcon = styled.div<{ $visible?: boolean }>`
  width: 20px;
  height: 20px;
  background: ${props => props.$visible ? '#FA2D48' : 'transparent'};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  opacity: ${props => props.$visible ? 1 : 0};
`;

const ProfileCard = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
`;

const ProfileAvatar = styled.div`
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #FA2D48, #FC3C44);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 700;
  color: #FFFFFF;
`;

const ProfileInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ProfileName = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: #1D1D1F;
  margin: 0;
`;

const ProfileEmail = styled.p`
  font-size: 0.9375rem;
  color: #86868B;
  margin: 0;
`;

const ProfilePlan = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(16, 185, 129, 0.15);
  border-radius: 20px;
  color: #10B981;
  font-size: 0.8125rem;
  font-weight: 600;
  margin-top: 8px;
`;

const EditButton = styled.button`
  padding: 10px 20px;
  background: #F5F5F7;
  border: 1px solid transparent;
  border-radius: 10px;
  color: #1D1D1F;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #E8E8ED;
  }
`;

const DangerZone = styled(SettingsSection)`
  border-color: rgba(239, 68, 68, 0.2);

  ${SectionIcon} {
    background: rgba(239, 68, 68, 0.1);
  }
`;

const DangerButton = styled.button`
  padding: 10px 20px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 10px;
  color: #EF4444;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(239, 68, 68, 0.12);
  }
`;

export const SettingsView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language);

  // Sync selectedLanguage with i18n.language changes (e.g., from system language detection)
  useEffect(() => {
    setSelectedLanguage(i18n.language);
  }, [i18n.language]);

  const languages = [
    { code: 'en', name: 'English', native: 'English', flag: '🇺🇸' },
    { code: 'zh-CN', name: 'Chinese', native: '简体中文', flag: '🇨🇳' },
    { code: 'ja', name: 'Japanese', native: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', native: '한국어', flag: '🇰🇷' },
  ];

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setSelectedLanguage(langCode);
  };

  return (
    <SettingsContainer>
      <SettingsHeader>
        <SettingsTitle>{t('settings.title')}</SettingsTitle>
        <SettingsSubtitle>Manage your account settings and preferences</SettingsSubtitle>
      </SettingsHeader>

      {/* Profile Section */}
      <SettingsSection>
        <ProfileCard>
          <ProfileAvatar>U</ProfileAvatar>
          <ProfileInfo>
            <ProfileName>User Name</ProfileName>
            <ProfileEmail>user@example.com</ProfileEmail>
            <ProfilePlan>
              <Check size={14} />
              Free Plan
            </ProfilePlan>
          </ProfileInfo>
          <EditButton>
            Edit Profile
          </EditButton>
        </ProfileCard>
      </SettingsSection>

      {/* Appearance Section */}
      <SettingsSection>
        <SectionHeader>
          <SectionIcon>
            <Palette size={20} color="#FA2D48" />
          </SectionIcon>
          <SectionTitle>Appearance</SectionTitle>
        </SectionHeader>
        <SectionContent>
          <SettingItem>
            <SettingInfo>
              <SettingLabel>Dark Mode</SettingLabel>
              <SettingDescription>Enable dark theme for the interface</SettingDescription>
            </SettingInfo>
            <SettingControl>
              <Toggle $active={darkMode} onClick={() => setDarkMode(!darkMode)} />
            </SettingControl>
          </SettingItem>
        </SectionContent>
      </SettingsSection>

      {/* Language Section */}
      <SettingsSection>
        <SectionHeader>
          <SectionIcon>
            <Globe size={20} color="#FA2D48" />
          </SectionIcon>
          <SectionTitle>Language</SectionTitle>
        </SectionHeader>
        <LanguageGrid>
          {languages.map((lang) => (
            <LanguageOption
              key={lang.code}
              $selected={selectedLanguage === lang.code}
              onClick={() => changeLanguage(lang.code)}
            >
              <LanguageFlag>{lang.flag}</LanguageFlag>
              <LanguageInfo>
                <LanguageName>{lang.name}</LanguageName>
                <LanguageNative>{lang.native}</LanguageNative>
              </LanguageInfo>
              <CheckIcon $visible={selectedLanguage === lang.code}>
                <Check size={12} color="white" />
              </CheckIcon>
            </LanguageOption>
          ))}
        </LanguageGrid>
      </SettingsSection>

      {/* Notifications Section */}
      <SettingsSection>
        <SectionHeader>
          <SectionIcon>
            <Bell size={20} color="#FA2D48" />
          </SectionIcon>
          <SectionTitle>Notifications</SectionTitle>
        </SectionHeader>
        <SectionContent>
          <SettingItem>
            <SettingInfo>
              <SettingLabel>Push Notifications</SettingLabel>
              <SettingDescription>Receive notifications about your creations</SettingDescription>
            </SettingInfo>
            <SettingControl>
              <Toggle $active={notifications} onClick={() => setNotifications(!notifications)} />
            </SettingControl>
          </SettingItem>
          <SettingItem>
            <SettingInfo>
              <SettingLabel>Email Notifications</SettingLabel>
              <SettingDescription>Receive updates via email</SettingDescription>
            </SettingInfo>
            <SettingControl>
              <Toggle $active={true} onClick={() => {}} />
            </SettingControl>
          </SettingItem>
        </SectionContent>
      </SettingsSection>

      {/* Playback Section */}
      <SettingsSection>
        <SectionHeader>
          <SectionIcon>
            <Volume2 size={20} color="#FA2D48" />
          </SectionIcon>
          <SectionTitle>Playback</SectionTitle>
        </SectionHeader>
        <SectionContent>
          <SettingItem>
            <SettingInfo>
              <SettingLabel>Sound Effects</SettingLabel>
              <SettingDescription>Play sound effects for interactions</SettingDescription>
            </SettingInfo>
            <SettingControl>
              <Toggle $active={soundEffects} onClick={() => setSoundEffects(!soundEffects)} />
            </SettingControl>
          </SettingItem>
          <SettingItem>
            <SettingInfo>
              <SettingLabel>Auto-Play</SettingLabel>
              <SettingDescription>Automatically play next track</SettingDescription>
            </SettingInfo>
            <SettingControl>
              <Toggle $active={autoPlay} onClick={() => setAutoPlay(!autoPlay)} />
            </SettingControl>
          </SettingItem>
        </SectionContent>
      </SettingsSection>

      {/* Billing Section */}
      <SettingsSection>
        <SectionHeader>
          <SectionIcon>
            <CreditCard size={20} color="#FA2D48" />
          </SectionIcon>
          <SectionTitle>Billing & Credits</SectionTitle>
        </SectionHeader>
        <SectionContent>
          <SettingItem>
            <SettingInfo>
              <SettingLabel>Current Plan</SettingLabel>
              <SettingDescription>You have 500 credits remaining</SettingDescription>
            </SettingInfo>
            <SettingControl>
              <SelectButton>
                Upgrade
                <ChevronRight size={16} />
              </SelectButton>
            </SettingControl>
          </SettingItem>
        </SectionContent>
      </SettingsSection>

      {/* Privacy Section */}
      <SettingsSection>
        <SectionHeader>
          <SectionIcon>
            <Shield size={20} color="#FA2D48" />
          </SectionIcon>
          <SectionTitle>Privacy & Security</SectionTitle>
        </SectionHeader>
        <SectionContent>
          <SettingItem>
            <SettingInfo>
              <SettingLabel>Privacy Settings</SettingLabel>
              <SettingDescription>Manage your data and privacy preferences</SettingDescription>
            </SettingInfo>
            <SettingControl>
              <SelectButton>
                Configure
                <ChevronRight size={16} />
              </SelectButton>
            </SettingControl>
          </SettingItem>
          <SettingItem>
            <SettingInfo>
              <SettingLabel>Change Password</SettingLabel>
              <SettingDescription>Update your account password</SettingDescription>
            </SettingInfo>
            <SettingControl>
              <SelectButton>
                Change
                <ChevronRight size={16} />
              </SelectButton>
            </SettingControl>
          </SettingItem>
        </SectionContent>
      </SettingsSection>

      {/* About Section */}
      <SettingsSection>
        <SectionHeader>
          <SectionIcon>
            <Info size={20} color="#FA2D48" />
          </SectionIcon>
          <SectionTitle>About</SectionTitle>
        </SectionHeader>
        <SectionContent>
          <SettingItem>
            <SettingInfo>
              <SettingLabel>Version</SettingLabel>
              <SettingDescription>AI Music Pro v1.0.0</SettingDescription>
            </SettingInfo>
          </SettingItem>
          <SettingItem>
            <SettingInfo>
              <SettingLabel>Terms of Service</SettingLabel>
            </SettingInfo>
            <SettingControl>
              <SelectButton>
                View
                <ChevronRight size={16} />
              </SelectButton>
            </SettingControl>
          </SettingItem>
          <SettingItem>
            <SettingInfo>
              <SettingLabel>Privacy Policy</SettingLabel>
            </SettingInfo>
            <SettingControl>
              <SelectButton>
                View
                <ChevronRight size={16} />
              </SelectButton>
            </SettingControl>
          </SettingItem>
        </SectionContent>
      </SettingsSection>

      {/* Danger Zone */}
      <DangerZone>
        <SectionHeader>
          <SectionIcon>
            <Shield size={20} color="#EF4444" />
          </SectionIcon>
          <SectionTitle>Danger Zone</SectionTitle>
        </SectionHeader>
        <SectionContent>
          <SettingItem>
            <SettingInfo>
              <SettingLabel>Delete Account</SettingLabel>
              <SettingDescription>Permanently delete your account and all data</SettingDescription>
            </SettingInfo>
            <SettingControl>
              <DangerButton>
                Delete Account
              </DangerButton>
            </SettingControl>
          </SettingItem>
        </SectionContent>
      </DangerZone>
    </SettingsContainer>
  );
};

export default SettingsView;
