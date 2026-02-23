import React from 'react';
import styled from 'styled-components';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/views';
import { Header } from '@/views';
import BottomPlayer from '@/components/BottomPlayer';

const LayoutContainer = styled.div`
  display: flex;
  min-height: 100vh;
  background: linear-gradient(135deg, #0F0F23, #1A1A2E, #16213E);
  background-attachment: fixed;
`;

const MainContent = styled.main`
  flex: 1;
  margin-left: 280px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
`;

const ContentArea = styled.div`
  flex: 1;
  padding: 24px;
  padding-bottom: 100px;
  overflow-y: auto;
`;

interface MainLayoutProps {
  children?: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <LayoutContainer>
      <Sidebar />
      <MainContent>
        <Header />
        <ContentArea>
          {children || <Outlet />}
        </ContentArea>
      </MainContent>
      <BottomPlayer />
    </LayoutContainer>
  );
};

export default MainLayout;
