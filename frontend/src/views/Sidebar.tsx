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
  User,
  BookOpen
} from 'lucide-react';

const SidebarContainer = styled.aside`
  width: 260px;
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  background: #FAFAFA;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  padding: 20px 12px;
  z-index: 100;
`;

const LogoSection = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin-bottom: 24px;
`;

const LogoIcon = styled.div`
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #FA2D48, #FC3C44);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(250, 45, 72, 0.25);
`;

const LogoText = styled.span`
  font-size: 1.125rem;
  font-weight: 700;
  color: #1D1D1F;
  letter-spacing: -0.02em;
`;

const NavSection = styled.nav`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const NavSectionTitle = styled.span`
  font-size: 0.6875rem;
  font-weight: 600;
  color: #86868B;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 8px 12px;
  margin-top: 16px;
`;

const NavLinkStyled = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  color: #6E6E73;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.875rem;
  transition: all 0.15s ease;
  background: transparent;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
    color: #1D1D1F;
  }

  &.active {
    background: rgba(250, 45, 72, 0.1);
    color: #FA2D48;
  }

  svg {
    width: 18px;
    height: 18px;
    stroke-width: 2;
  }
`;

const BottomSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
`;

const UserSection = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #FFFFFF;
  border-radius: 10px;
  margin-top: 8px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
`;

const UserAvatar = styled.div`
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #FA2D48, #FC3C44);
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
  font-size: 0.8125rem;
  font-weight: 600;
  color: #1D1D1F;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const UserPlan = styled.span`
  display: block;
  font-size: 0.6875rem;
  color: #86868B;
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
    { path: '/api-docs', icon: BookOpen, label: 'API文档' },
    { path: '/settings', icon: Settings, label: 'nav.settings' },
    { path: '/help', icon: HelpCircle, label: 'nav.help' },
  ];

  return (
    <SidebarContainer>
      <LogoSection>
        <LogoIcon>
          <Music size={20} color="white" strokeWidth={2.5} />
        </LogoIcon>
        <LogoText>Music</LogoText>
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
            <User size={16} />
          </UserAvatar>
          <UserInfo>
            <UserName>Creator</UserName>
            <UserPlan>Free Plan</UserPlan>
          </UserInfo>
        </UserSection>
      </BottomSection>
    </SidebarContainer>
  );
};

export default Sidebar;
