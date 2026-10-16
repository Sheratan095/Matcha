/** Every page as a lazy chunk (kept apart from router.tsx so that file exports no components). */
import { lazy } from 'react'

export const LandingPage = lazy(() => import('@/features/auth/LandingPage'))
export const LoginPage = lazy(() => import('@/features/auth/LoginPage'))
export const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'))
export const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'))
export const VerifyEmailPage = lazy(() => import('@/features/auth/VerifyEmailPage'))
export const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'))
export const OnboardingPage = lazy(() => import('@/features/onboarding/OnboardingPage'))
export const DiscoverPage = lazy(() => import('@/features/discover/DiscoverPage'))
export const MatchesPage = lazy(() => import('@/features/matches/MatchesPage'))
export const ChatPage = lazy(() => import('@/features/chat/ChatPage'))
export const ActivityPage = lazy(() => import('@/features/activity/ActivityPage'))
export const MePage = lazy(() => import('@/features/me/MePage'))
export const StyleguidePage = lazy(() => import('@/ui/styleguide/StyleguidePage'))
