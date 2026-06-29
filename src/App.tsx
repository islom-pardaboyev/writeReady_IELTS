import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { FeedbackPage } from './pages/FeedbackPage';
import { PricingPage } from './pages/PricingPage';
import { AccountPage } from './pages/AccountPage';
import Mock from './pages/writing/Mock';
import Practice from './pages/writing/Practice';
import Relax from './pages/writing/Relax';
import Quick from './pages/writing/Quick';
import Admin from './pages/writing/AdminPage';
import CenterAdminPage from './pages/CenterAdminPage';
import JoinPage from './pages/JoinPage';

const BlogIndexPage = lazy(() => import('./pages/blog/BlogIndexPage').then(m => ({ default: m.BlogIndexPage })));
const BlogPostPage = lazy(() => import('./pages/blog/BlogPostPage').then(m => ({ default: m.BlogPostPage })));

const BlogSpinner = (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
  </div>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workspace/:id" element={<WorkspacePage />} />
          <Route path="/feedback/:id" element={<FeedbackPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/center-admin" element={<CenterAdminPage />} />
          <Route path="/join/:token" element={<JoinPage />} />
          <Route path="/writing/mock" element={<Mock />} />
          <Route path="/writing/practice" element={<Practice />} />
          <Route path="/writing/relax" element={<Relax />} />
          <Route path="/writing/quick" element={<Quick />} />
          <Route path="/blog" element={<Suspense fallback={BlogSpinner}><BlogIndexPage /></Suspense>} />
          <Route path="/blog/:slug" element={<Suspense fallback={BlogSpinner}><BlogPostPage /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
