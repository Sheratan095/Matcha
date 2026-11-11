/** The signed-in user's profile and pictures, plus the real "profile by id" read (docs/API_CONTRACT.md §2.2, §4). */
import type {
  LocationPayload,
  LocationResult,
  MatchesMapResult,
  OtherProfile,
  OwnProfile,
  PicturesResult,
  ProfileUpdatePayload,
  ViewersResult,
} from '@/api/types'
import {
  commands,
  derived,
  get,
  input,
  pathVariable,
  selection,
  session,
  trigger,
  type Command,
  type CommandNodes,
  type SpecsFor,
} from './builders'

export interface ProfileCommands {
  profileUpdate: Command<ProfileUpdatePayload, OwnProfile>
  /** `PUT /profile/location`. */
  locationUpdate: Command<LocationPayload, LocationResult>
  /** Payload: a `FormData` with one field named `file`. */
  pictureUpload: Command<FormData, PicturesResult>
  /** Payload: the picture id. */
  pictureDelete: Command<string, PicturesResult>
  /** Payload: the id of the picture that becomes the profile picture. */
  pictureMain: Command<string, PicturesResult>
  /** Payload: the user's id. `POST /profile/{userId}/block`: mutual, dissolves a match. */
  blockUser: Command<string, void>
  /** Payload: the user's id. `POST /profile/{userId}/report`: flags a fake account. */
  reportUser: Command<string, void>
}

export interface ProfileNodes extends CommandNodes<ProfileCommands> {
  myProfileRefresh: number
  /** `GET /profile`: the signed-in user's own profile. */
  myProfile: OwnProfile
  /** null while `myProfile` is not loaded. */
  profileComplete: boolean
  /** Shared by `myViewers` and `likesReceived`. */
  activityRefresh: number
  /** Ids only; resolving one with `apiProfile` records the viewer as a viewer of that person. */
  myViewers: ViewersResult
  /** A real user's id to open with `apiProfile`. */
  apiProfileId: string
  /** `GET /profile/{userId}`: a real user's profile. Loading it records a profile view. */
  apiProfile: OtherProfile
  matchesMapRefresh: number
  /** `GET /profile/matches/map`: your connections with a ~1 km-snapped position (the map page). */
  matchesMap: MatchesMapResult
  presenceRefresh: number
  /** Users with an open socket, across the whole site. */
  onlineCount: number
}

export const profileNodes = {
  myProfileRefresh: selection(),
  myProfile: get('api', '/profile', [session(), trigger('myProfileRefresh')]),
  profileComplete: derived('profileComplete', [input('myProfile', 'profile')]),
  activityRefresh: selection(),
  myViewers: get('api', '/profile/viewers', [session(), trigger('activityRefresh')]),
  apiProfileId: selection(),
  apiProfile: get('api', '/profile/{userId}', [session(), pathVariable('apiProfileId', 'userId')]),
  matchesMapRefresh: selection(),
  matchesMap: get('api', '/profile/matches/map', [session(), trigger('matchesMapRefresh')]),
  presenceRefresh: selection(),
  onlineCount: get('api', '/notification/online', [session(), trigger('presenceRefresh')]),
  ...commands<ProfileCommands>({
    profileUpdate: { method: 'PATCH', serviceName: 'api', addr: '/profile', payload: 'body' },
    locationUpdate: { method: 'PUT', serviceName: 'api', addr: '/profile/location', payload: 'body' },
    pictureUpload: { method: 'POST', serviceName: 'api', addr: '/profile/pictures', payload: 'body' },
    pictureDelete: {
      method: 'DELETE',
      serviceName: 'api',
      addr: '/profile/pictures/{pictureId}',
      payload: { pathVariable: 'pictureId' },
    },
    pictureMain: {
      method: 'PATCH',
      serviceName: 'api',
      addr: '/profile/pictures/{pictureId}/profile',
      payload: { pathVariable: 'pictureId' },
    },
    blockUser: { method: 'POST', serviceName: 'api', addr: '/profile/{userId}/block', payload: { pathVariable: 'userId' } },
    reportUser: { method: 'POST', serviceName: 'api', addr: '/profile/{userId}/report', payload: { pathVariable: 'userId' } },
  }),
} satisfies SpecsFor<ProfileNodes>
