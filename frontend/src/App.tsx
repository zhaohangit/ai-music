import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@/views';
import { CreateView, LibraryView, HistoryView, ExploreView, CommunityView, SettingsView, CoverView } from '@/views';
import ApiDocsView from '@/views/ApiDocsView';
import { ToastProvider } from './hooks/useToast';
import { ErrorBoundary } from './components/ErrorBoundary';

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/create" replace />} />
              <Route path="create" element={<CreateView />} />
              <Route path="cover" element={<CoverView />} />
              <Route path="library" element={<LibraryView />} />
              <Route path="history" element={<HistoryView />} />
              <Route path="explore" element={<ExploreView />} />
              <Route path="community" element={<CommunityView />} />
              <Route path="api-docs" element={<ApiDocsView />} />
              <Route path="settings" element={<SettingsView />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
