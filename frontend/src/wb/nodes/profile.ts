/** The signed-in user's profile and pictures, plus the real "profile by id" read (docs/API_CONTRACT.md §2.2, §4). */
import type {
  BlocksResult,
  LocationPayload,
  LocationResult,
  MatchesMapResult,
  OtherProfile,
  OwnProfile,
  PicturesResult,
  ProfileUpdatePayload,
  ViewersResult,
  VisitedResult,
} from '@/api/types'
import {
  commands,
  demand,
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
  /** Payload: the user's id. `DELETE /profile/{userId}/block`: the match is not restored. */
  unblockUser: Command<string, void>
  /** Payload: the user's id. `POST /profile/{userId}/report`: flags a fake account. */
  reportUser: Command<string, void>
}

export interface ProfileNodes extends CommandNodes<ProfileCommands> {
  myProfileRefresh: number
  /** `GET /profile`: the signed-in user's own profile. */
  myProfile: OwnProfile
  /** Everything but the profile picture is there (the sections other than Discover); null while not loaded. */
  profileFilled: boolean
  /** The backend's completeness, picture included (Discover); null while `myProfile` is not loaded. */
  profileComplete: boolean
  viewersWanted: boolean
  viewersRefresh: number
  /** Who opened your profile. Loads on demand (Activity, Me). */
  myViewers: ViewersResult
  visitedWanted: boolean
  visitedRefresh: number
  /** `GET /profile/visited`: the profiles you opened, most recent first. Loads on demand. */
  visitedProfiles: VisitedResult
  blocksWanted: boolean
  blocksRefresh: number
  /** `GET /profile/blocks`: the people you blocked. Loads on demand (Me > Account). */
  blockedUsers: BlocksResult
  /** A real user's id to open with `apiProfile`. */
  apiProfileId: string
  /** `GET /profile/{userId}`: a real user's profile. Loading it records a profile view. */
  apiProfile: OtherProfile
  mapWanted: boolean
  matchesMapRefresh: number
  /** `GET /profile/matches/map`: your connections with a ~1 km-snapped position. Loads on demand (Map). */
  matchesMap: MatchesMapResult
}

export const profileNodes = {
  myProfileRefresh: selection(),
  myProfile: get('api', '/profile', [session(), trigger('myProfileRefresh')]),
  profileFilled: derived('profileFilled', [input('myProfile', 'profile')]),
  profileComplete: derived('profileComplete', [input('myProfile', 'profile')]),
  viewersWanted: selection(),
  viewersRefresh: selection(),
  myViewers: get('api', '/profile/viewers', [session(), demand('viewersWanted'), trigger('viewersRefresh')]),
  visitedWanted: selection(),
  visitedRefresh: selection(),
  visitedProfiles: get('api', '/profile/visited', [session(), demand('visitedWanted'), trigger('visitedRefresh')]),
  blocksWanted: selection(),
  blocksRefresh: selection(),
  blockedUsers: get('api', '/profile/blocks', [session(), demand('blocksWanted'), trigger('blocksRefresh')]),
  apiProfileId: selection(),
  apiProfile: get('api', '/profile/{userId}', [session(), pathVariable('apiProfileId', 'userId')]),
  mapWanted: selection(),
  matchesMapRefresh: selection(),
  matchesMap: get('api', '/profile/matches/map', [session(), demand('mapWanted'), trigger('matchesMapRefresh')]),
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
    unblockUser: { method: 'DELETE', serviceName: 'api', addr: '/profile/{userId}/block', payload: { pathVariable: 'userId' } },
    reportUser: { method: 'POST', serviceName: 'api', addr: '/profile/{userId}/report', payload: { pathVariable: 'userId' } },
  }),
} satisfies SpecsFor<ProfileNodes>
