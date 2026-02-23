import React from 'react';
import styled from 'styled-components';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Music,
  Mic,
  Library,
  History,
  Compass,
  Users,
  Settings,
  HelpCircle,
  User
} from 'lucide-react';

const SidebarContainer = styled.aside`
  width: 280px;
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  padding: 24px 16px;
  z-index: 100;
`;

const LogoSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 32px;
`;

const LogoIcon = styled.div`
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #667EEA, #764BA2);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LogoText = styled.span`
  font-size: 1.25rem;
  font-weight: 700;
  background: linear-gradient(135deg, #667EEA, #764BA2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const NavSection = styled.nav`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const NavSectionTitle = styled.span`
  font-size: 0.75rem;
  font-weight: 600;
  color: #8B8B9F;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 12px;
  margin-top: 16px;
`;

const NavLinkStyled = styled(NavLink)<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  color: #8B8B9F;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s ease;
  background: transparent;
  border: 1px solid transparent;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #FFFFFF;
  }

  &.active {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
    color: #667EEA;
    border-color: rgba(102, 126, 234, 0.3);
  }

  svg {
    width: 20px;
    height: 20px;
    stroke-width: 2;
  }
`;

const BottomSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
`;

const UserSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  margin-top: 8px;
`;

const UserAvatar = styled.div`
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #667EEA, #764BA2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
`;

const UserInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const UserName = styled.span`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #FFFFFF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const UserPlan = styled.span`
  display: block;
  font-size: 0.75rem;
  color: #8B8B9F;
`;

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();

  const mainNavItems = [
    { path: '/create', icon: Music, label: 'nav.create' },
    { path: '/cover', icon: Mic, label: 'nav.cover' },
    { path: '/library', icon: Library, label: 'nav.library' },
    { path: '/history', icon: History, label: 'nav.history' },
    { path: '/explore', icon: Compass, label: 'nav.explore' },
    { path: '/community', icon: Users, label: 'nav.community' },
  ];

  const bottomNavItems = [
    { path: '/settings', icon: Settings, label: 'nav.settings' },
    { path: '/help', icon: HelpCircle, label: 'nav.help' },
  ];

  return (
    <SidebarContainer>
      <LogoSection>
        <LogoIcon>
          <Music size={24} color="white" strokeWidth={2.5} />
        </LogoIcon>
        <LogoText>AI Music Pro</LogoText>
      </LogoSection>

      <NavSection>
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLinkStyled
              key={item.path}
              to={item.path}
              className={location.pathname === item.path ? 'active' : ''}
            >
              <Icon />
              <span>{t(item.label as any)}</span>
            </NavLinkStyled>
          );
        })}
      </NavSection>

      <BottomSection>
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLinkStyled
              key={item.path}
              to={item.path}
              className={location.pathname === item.path ? 'active' : ''}
            >
              <Icon />
              <span>{t(item.label as any)}</span>
            </NavLinkStyled>
          );
        })}

        <UserSection>
          <UserAvatar>
            <User size={20} />
          </UserAvatar>
          <UserInfo>
            <UserName>Music Creator</UserName>
            <UserPlan>Free Plan</UserPlan>
          </UserInfo>
        </UserSection>
      </BottomSection>
    </SidebarContainer>
  );
};

export default Sidebar;
