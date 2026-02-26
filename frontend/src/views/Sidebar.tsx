import React from 'react';
import styled from 'styled-components';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Music,
  Mic,
  Library,
  Clock,
  Compass,
  Users,
  Settings,
  HelpCircle,
  User,
  BookOpen,
  Wand2,
  Plus,
  Sparkles,
  FileText,
  Sliders
} from 'lucide-react';

const SidebarContainer = styled.aside`
  width: 240px;
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  background: #FFFFFF;
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  z-index: 100;
`;

const LogoSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 20px 24px;
`;

const LogoIcon = styled.div`
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #FA2D48, #FC3C44);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(250, 45, 72, 0.25);
`;

const LogoText = styled.span`
  font-size: 1.25rem;
  font-weight: 700;
  color: #1D1D1F;
  letter-spacing: -0.02em;
`;

const NavSection = styled.nav`
  flex: 1;
  padding: 0 12px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 2px;
  }
`;

const NavGroup = styled.div`
  margin-bottom: 24px;
`;

const NavGroupTitle = styled.div`
  font-size: 0.6875rem;
  font-weight: 600;
  color: #86868B;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0 12px;
  margin-bottom: 8px;
`;

const NavItem = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  color: #6E6E73;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.875rem;
  transition: all 0.15s ease;
  margin-bottom: 2px;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
    color: #1D1D1F;
  }

  &.active {
    background: rgba(250, 45, 72, 0.08);
    color: #FA2D48;

    svg {
      color: #FA2D48;
    }
  }

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
`;

const CreateButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: calc(100% - 24px);
  margin: 0 12px 20px;
  padding: 12px;
  background: linear-gradient(135deg, #FA2D48, #FC3C44);
  border: none;
  border-radius: 12px;
  color: white;
  font-weight: 600;
  font-size: 0.9375rem;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 4px 12px rgba(250, 45, 72, 0.3);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(250, 45, 72, 0.35);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const Divider = styled.div`
  height: 1px;
  background: rgba(0, 0, 0, 0.06);
  margin: 8px 12px 16px;
`;

const BottomSection = styled.div`
  padding: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
`;

const UserCard = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #F5F5F7;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #E8E8ED;
  }
`;

const UserAvatar = styled.div`
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #FA2D48, #FC3C44);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
`;

const UserInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const UserName = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: #1D1D1F;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const UserPlan = styled.div`
  font-size: 0.75rem;
  color: #86868B;
`;

const Badge = styled.span`
  background: #FA2D48;
  color: white;
  font-size: 0.625rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
  margin-left: auto;
`;

interface NavItemData {
  path: string;
  icon: React.ElementType;
  labelKey: string;
  badge?: string;
}

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  // 主要功能
  const mainItems: NavItemData[] = [
    { path: '/create', icon: Music, labelKey: 'nav.create' },
    { path: '/cover', icon: Mic, labelKey: 'nav.cover' },
  ];

  // 音乐库
  const libraryItems: NavItemData[] = [
    { path: '/library', icon: Library, labelKey: 'nav.library' },
    { path: '/history', icon: Clock, labelKey: 'nav.history' },
  ];

  // 发现
  const discoverItems: NavItemData[] = [
    { path: '/explore', icon: Compass, labelKey: 'nav.explore' },
    { path: '/community', icon: Users, labelKey: 'nav.community' },
  ];

  // 工具
  const toolItems: NavItemData[] = [
    { path: '/api-docs', icon: BookOpen, labelKey: 'nav.apiDocs' },
    { path: '/skills', icon: Wand2, labelKey: 'nav.skills', badge: '26' },
  ];

  // 底部设置
  const bottomItems: NavItemData[] = [
    { path: '/settings', icon: Settings, labelKey: 'nav.settings' },
    { path: '/help', icon: HelpCircle, labelKey: 'nav.help' },
  ];

  const renderNavItems = (items: NavItemData[]) => (
    items.map(item => {
      const Icon = item.icon;
      return (
        <NavItem
          key={item.path}
          to={item.path}
          className={location.pathname === item.path ? 'active' : ''}
        >
          <Icon />
          <span>{t(item.labelKey as any)}</span>
          {item.badge && <Badge>{item.badge}</Badge>}
        </NavItem>
      );
    })
  );

  return (
    <SidebarContainer>
      <LogoSection>
        <LogoIcon>
          <Music size={22} color="white" strokeWidth={2.5} />
        </LogoIcon>
        <LogoText>Music</LogoText>
      </LogoSection>

      <CreateButton onClick={() => navigate('/create')}>
        <Plus size={18} />
        {t('nav.quickCreate')}
      </CreateButton>

      <NavSection>
        <NavGroup>
          <NavGroupTitle>{t('nav.sectionCreate')}</NavGroupTitle>
          {renderNavItems(mainItems)}
        </NavGroup>

        <NavGroup>
          <NavGroupTitle>{t('nav.sectionLibrary')}</NavGroupTitle>
          {renderNavItems(libraryItems)}
        </NavGroup>

        <NavGroup>
          <NavGroupTitle>{t('nav.sectionDiscover')}</NavGroupTitle>
          {renderNavItems(discoverItems)}
        </NavGroup>

        <Divider />

        <NavGroup>
          <NavGroupTitle>{t('nav.sectionTools')}</NavGroupTitle>
          {renderNavItems(toolItems)}
        </NavGroup>
      </NavSection>

      <BottomSection>
        {renderNavItems(bottomItems)}

        <UserCard onClick={() => navigate('/settings')}>
          <UserAvatar>
            <User size={16} />
          </UserAvatar>
          <UserInfo>
            <UserName>{t('settings.defaultUserName')}</UserName>
            <UserPlan>{t('settings.defaultUserPlan')}</UserPlan>
          </UserInfo>
        </UserCard>
      </BottomSection>
    </SidebarContainer>
  );
};

export default Sidebar;
