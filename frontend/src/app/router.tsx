/**
 * Routes (docs/ARCHITECTURE.md §6). Every page is a lazy chunk. `/chat/:userId` sits outside the
 * AppShell (its page renders a full-screen `Screen`), but behind the same guards.
 */
import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppLayout from './AppLayout'
import { RootLayout, RouteError } from './frame/screens'
import { AnonymousOnly, HomeGate, RequireAuth, RequireCompleteProfile } from './guards'
import {
  ActivityPage,
  ChatPage,
  DiscoverPage,
  ForgotPasswordPage,
  LandingPage,
  LoginPage,
  MapPage,
  MatchesPage,
  MePage,
  OnboardingPage,
  RegisterPage,
  ResetPasswordPage,
  StyleguidePage,
  VerifyEmailPage,
} from './pages'

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    // A render error or a chunk that failed to load anywhere below shows the branded error page.
    errorElement: <RouteError />,
    children: [
      {
        element: <HomeGate />,
        children: [{ path: '/', element: <LandingPage /> }],
      },
      {
        element: <AnonymousOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      // Targets of the links in emails: reachable whether or not a session exists.
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/onboarding', element: <OnboardingPage /> },
          {
            element: <AppLayout />,
            children: [
              { path: '/me', element: <MePage /> },
              {
                element: <RequireCompleteProfile />,
                children: [
                  { path: '/discover', element: <DiscoverPage /> },
                  { path: '/matches', element: <MatchesPage /> },
                  { path: '/activity', element: <ActivityPage /> },
                  { path: '/map', element: <MapPage /> },
                ],
              },
            ],
          },
          {
            element: <RequireCompleteProfile fullPage />,
            children: [{ path: '/chat/:userId', element: <ChatPage /> }],
          },
        ],
      },
      { path: '/styleguide', element: <StyleguidePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
