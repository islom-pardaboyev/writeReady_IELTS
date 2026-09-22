import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router';
import { AuthProvider } from './contexts/AuthContext';
import { MaintenanceGate } from './components/layout/MaintenanceGate';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { RouteTitle } from './components/layout/RouteTitle';
import { RouteFocus } from './components/layout/RouteFocus';
import { GlobalShortcuts } from './components/shortcuts/GlobalShortcuts';
import { AnnouncementCard } from './components/ui/AnnouncementCard';
import { CookieNotice } from './components/ui/CookieNotice';
import { InstallPrompt } from './components/ui/InstallPrompt';
import { UpdatePrompt } from './components/ui/UpdatePrompt';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AuthPage } from './pages/AuthPage';
import { LogoLoader } from '@/components/ui/LogoLoader';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then(m => ({ default: m.WorkspacePage })));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage').then(m => ({ default: m.FeedbackPage })));
const PricingPage = lazy(() => import('./pages/PricingPage').then(m => ({ default: m.PricingPage })));
const AccountPage = lazy(() => import('./pages/AccountPage').then(m => ({ default: m.AccountPage })));
const Mock = lazy(() => import('./pages/writing/Mock'));
const Practice = lazy(() => import('./pages/writing/Practice'));
const Relax = lazy(() => import('./pages/writing/Relax'));
const Quick = lazy(() => import('./pages/writing/Quick'));
const Admin = lazy(() => import('./pages/writing/AdminPage'));
const CenterAdminPage = lazy(() => import('./pages/CenterAdminPage'));
const TeacherPortalPage = lazy(() => import('./pages/TeacherPortalPage'));
const HumanReviewPage = lazy(() => import('./pages/HumanReviewPage').then(m => ({ default: m.HumanReviewPage })));
const BlogIndexPage = lazy(() => import('./pages/blog/BlogIndexPage').then(m => ({ default: m.BlogIndexPage })));
const BlogPostPage = lazy(() => import('./pages/blog/BlogPostPage').then(m => ({ default: m.BlogPostPage })));
const PrivacyPolicyPage = lazy(() => import('./pages/legal/PrivacyPolicyPage').then(m => ({ default: m.PrivacyPolicyPage })));
const TermsPage = lazy(() => import('./pages/legal/TermsPage').then(m => ({ default: m.TermsPage })));
const FaqPage = lazy(() => import('./pages/FaqPage').then(m => ({ default: m.FaqPage })));

const PageSpinner = (
  <div className="min-h-screen flex items-center justify-center">
    <LogoLoader />
  </div>
);

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={PageSpinner}>{element}</Suspense>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Inside the router so a crashed page can still offer a way back,
            and so the report carries the route the user was actually on. */}
        <ErrorBoundary>
        <MaintenanceGate>
          <RouteTitle />
          <RouteFocus />
          <GlobalShortcuts />
          <AnnouncementCard />
          <CookieNotice />
          <InstallPrompt />
          <UpdatePrompt />
          {/* vercel.json lists these same paths, so unknown addresses can be
              served with a real 404 status. Add a route there too. */}
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard" element={withSuspense(<DashboardPage />)} />
            <Route path="/workspace/:id" element={withSuspense(<WorkspacePage />)} />
            <Route path="/feedback/:id" element={withSuspense(<FeedbackPage />)} />
            <Route path="/pricing" element={withSuspense(<PricingPage />)} />
            <Route path="/account" element={withSuspense(<AccountPage />)} />
            <Route path="/admin" element={withSuspense(<Admin />)} />
            <Route path="/center-admin" element={withSuspense(<CenterAdminPage />)} />
            <Route path="/teacher-portal" element={withSuspense(<TeacherPortalPage />)} />
            <Route path="/human-review/:id" element={withSuspense(<HumanReviewPage />)} />
            <Route path="/writing/mock" element={withSuspense(<Mock />)} />
            <Route path="/writing/practice" element={withSuspense(<Practice />)} />
            <Route path="/writing/relax" element={withSuspense(<Relax />)} />
            <Route path="/writing/quick" element={withSuspense(<Quick />)} />
            <Route path="/faq" element={withSuspense(<FaqPage />)} />
            <Route path="/privacy" element={withSuspense(<PrivacyPolicyPage />)} />
            <Route path="/terms" element={withSuspense(<TermsPage />)} />
            <Route path="/blog" element={withSuspense(<BlogIndexPage />)} />
            <Route path="/blog/:slug" element={withSuspense(<BlogPostPage />)} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </MaintenanceGate>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}
