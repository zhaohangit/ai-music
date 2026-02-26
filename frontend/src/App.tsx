import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { MainLayout } from '@/views';
import { ToastProvider } from './hooks/useToast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SkillProvider } from './contexts/SkillContext';

// Lazy load views for better performance
const CreateView = lazy(() => import('@/views/CreateView'));
const CoverView = lazy(() => import('@/views/CoverView'));
const LibraryView = lazy(() => import('@/views/LibraryView'));
const HistoryView = lazy(() => import('@/views/HistoryView'));
const ExploreView = lazy(() => import('@/views/ExploreView'));
const CommunityView = lazy(() => import('@/views/CommunityView'));
const SettingsView = lazy(() => import('@/views/SettingsView'));
const SkillManagementView = lazy(() => import('@/views/SkillManagementView'));
const ApiDocsView = lazy(() => import('@/views/ApiDocsView'));

// Loading fallback component
const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  width: 100%;
  background: #F5F5F7;
`;

const LoadingSpinner = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid rgba(250, 45, 72, 0.1);
  border-top-color: #FA2D48;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const PageLoader: React.FC = () => (
  <LoadingContainer>
    <LoadingSpinner />
  </LoadingContainer>
);

// Wrapper component to provide skill context to pages that need it
const SkillPageWrapper: React.FC<{ page: string; children: React.ReactNode }> = ({ page, children }) => (
  <SkillProvider page={page}>
    {children}
  </SkillProvider>
);

// Suspense wrapper for lazy loaded components
const LazyPage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<PageLoader />}>
    {children}
  </Suspense>
);

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/create" replace />} />
              <Route path="create" element={
                <LazyPage>
                  <SkillPageWrapper page="create">
                    <CreateView />
                  </SkillPageWrapper>
                </LazyPage>
              } />
              <Route path="cover" element={
                <LazyPage>
                  <SkillPageWrapper page="cover">
                    <CoverView />
                  </SkillPageWrapper>
                </LazyPage>
              } />
              <Route path="library" element={
                <LazyPage>
                  <SkillPageWrapper page="library">
                    <LibraryView />
                  </SkillPageWrapper>
                </LazyPage>
              } />
              <Route path="history" element={
                <LazyPage>
                  <SkillPageWrapper page="history">
                    <HistoryView />
                  </SkillPageWrapper>
                </LazyPage>
              } />
              <Route path="explore" element={
                <LazyPage>
                  <SkillPageWrapper page="explore">
                    <ExploreView />
                  </SkillPageWrapper>
                </LazyPage>
              } />
              <Route path="community" element={
                <LazyPage>
                  <SkillPageWrapper page="community">
                    <CommunityView />
                  </SkillPageWrapper>
                </LazyPage>
              } />
              <Route path="api-docs" element={
                <LazyPage>
                  <ApiDocsView />
                </LazyPage>
              } />
              <Route path="skills" element={
                <LazyPage>
                  <SkillManagementView />
                </LazyPage>
              } />
              <Route path="settings" element={
                <LazyPage>
                  <SettingsView />
                </LazyPage>
              } />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
