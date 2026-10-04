/** Session nodes: who is signed in, and the `/auth/*` commands (docs/API_CONTRACT.md §2.1, §3). */
import type {
  ChangeEmailPayload,
  ForgotPasswordPayload,
  LoginPayload,
  LoginResult,
  MessageResult,
  RefreshResult,
  RegisterPayload,
  RegisterResult,
  ResetPasswordPayload,
  SessionCheck,
  VerifyEmailPayload,
  VerifyEmailResult,
} from '@/api/types'
import type { AuthStatus } from '../functions'
import { commands, derived, get, input, selection, type Command, type CommandNodes, type SpecsFor } from './builders'

export interface SessionCommands {
  login: Command<LoginPayload, LoginResult>
  register: Command<RegisterPayload, RegisterResult>
  verifyEmail: Command<VerifyEmailPayload, VerifyEmailResult>
  forgotPassword: Command<ForgotPasswordPayload, MessageResult>
  resetPassword: Command<ResetPasswordPayload, MessageResult>
  changeEmail: Command<ChangeEmailPayload, MessageResult>
  logout: Command<void, MessageResult>
  /** `POST /auth/refresh`: fired by the HTTP layer after a 401, never by screens. */
  sessionRefresh: Command<void, RefreshResult>
}

export interface SessionNodes extends CommandNodes<SessionCommands> {
  /** Nonce; bumped at boot and after login / logout / a failed refresh. */
  sessionProbe: number
  /** `GET /auth/validate`: the only "am I logged in" endpoint (always 200). */
  sessionCheck: SessionCheck
  /** The signed-in user's id; null when anonymous. Every authenticated read depends on it. */
  sessionUserId: string
  authStatus: AuthStatus
}

export const sessionNodes = {
  sessionProbe: selection(),
  sessionCheck: get('api', '/auth/validate', [
    // Required, so nothing is sent before the first probe; no `onUpdate`, so a re-probe keeps the
    // current answer (and with it the whole session) until the new one arrives.
    { nodeName: 'sessionProbe', parameterName: 'probe', isOptional: false, onUpdate: false },
  ]),
  sessionUserId: derived('sessionUserId', [input('sessionCheck', 'check')]),
  authStatus: derived('authStatus', [input('sessionCheck', 'check')]),
  ...commands<SessionCommands>({
    login: { method: 'POST', serviceName: 'api', addr: '/auth/login', payload: 'body' },
    register: { method: 'POST', serviceName: 'api', addr: '/auth/register', payload: 'body' },
    verifyEmail: { method: 'POST', serviceName: 'api', addr: '/auth/verify-email', payload: 'body' },
    forgotPassword: { method: 'POST', serviceName: 'api', addr: '/auth/forgot-password', payload: 'body' },
    resetPassword: { method: 'POST', serviceName: 'api', addr: '/auth/reset-password', payload: 'body' },
    changeEmail: { method: 'POST', serviceName: 'api', addr: '/auth/change-email', payload: 'body' },
    logout: { method: 'POST', serviceName: 'api', addr: '/auth/logout', payload: 'none' },
    sessionRefresh: { method: 'POST', serviceName: 'api', addr: '/auth/refresh', payload: 'none' },
  }),
} satisfies SpecsFor<SessionNodes>
