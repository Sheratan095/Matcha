/**
 * Dates planned with connections (docs/ARCHITECTURE.md §4.5): the profile service's calendar
 * (`/profile/calendar*`), behind the gateway.
 *
 * The calendar loads at sign-in, like the likes: the shell shows how many invites wait for an answer.
 * Realtime keeps it current (`event-*`, and `unmatch`, since breaking a connection deletes its dates).
 */
import type { CalendarEvent, CalendarResult, CreateEventPayload, EventAnswerResult, PlannedDate } from '@/api/types'
import { commands, derived, get, input, selection, session, trigger, type Command, type CommandNodes, type SpecsFor } from './builders'

export interface CalendarCommands {
  /** `POST /profile/calendar/event`: invites a connection (403 otherwise). */
  eventCreate: Command<CreateEventPayload, CalendarEvent>
  /** Payload: the event id. Only the invitee, while it is pending. */
  eventAccept: Command<string, EventAnswerResult>
  /** Payload: the event id. Only the invitee, while it is pending. */
  eventDecline: Command<string, EventAnswerResult>
  /** Payload: the event id. The inviter at any time, the invitee once they accepted. */
  eventCancel: Command<string, EventAnswerResult>
}

export interface CalendarNodes extends CommandNodes<CalendarCommands> {
  calendarRefresh: number
  /** `GET /profile/calendar`: your dates, earliest first, past ones included. */
  calendar: CalendarResult
  /** `calendar` with each date's other person (from `connections`); null while it is not loaded. */
  dates: PlannedDate[]
}

export const calendarNodes = {
  calendarRefresh: selection(),
  calendar: get('api', '/profile/calendar', [session(), trigger('calendarRefresh')]),
  dates: derived('dates', [input('calendar', 'calendar'), input('connections', 'connections'), input('sessionUserId', 'me')]),
  ...commands<CalendarCommands>({
    eventCreate: { method: 'POST', serviceName: 'api', addr: '/profile/calendar/event', payload: 'body' },
    eventAccept: {
      method: 'POST',
      serviceName: 'api',
      addr: '/profile/calendar/event/{eventId}/accept',
      payload: { pathVariable: 'eventId' },
    },
    eventDecline: {
      method: 'POST',
      serviceName: 'api',
      addr: '/profile/calendar/event/{eventId}/decline',
      payload: { pathVariable: 'eventId' },
    },
    eventCancel: {
      method: 'POST',
      serviceName: 'api',
      addr: '/profile/calendar/event/{eventId}/cancel',
      payload: { pathVariable: 'eventId' },
    },
  }),
} satisfies SpecsFor<CalendarNodes>
