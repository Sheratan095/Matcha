/** The signed-in user's profile and pictures, plus the real "profile by id" read (docs/API_CONTRACT.md §2.2, §4). */
import type {
  LocationPayload,
  LocationResult,
  OwnProfile,
  PicturesResult,
  Profile,
  ProfileCreatePayload,
  ProfileCreateResult,
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
  /** `POST /profile`: workaround for GitHub-created users, who have no profile row. */
  profileCreate: Command<ProfileCreatePayload, ProfileCreateResult>
  /** Payload: a `FormData` with one field named `file`. */
  pictureUpload: Command<FormData, PicturesResult>
  /** Payload: the picture id. */
  pictureDelete: Command<string, PicturesResult>
  /** Payload: the id of the picture that becomes the profile picture. */
  pictureMain: Command<string, PicturesResult>
}

export interface ProfileNodes extends CommandNodes<ProfileCommands> {
  myProfileRefresh: number
  /** `GET /profile`. Fails with 500 for a user that has no profile row (see `profileCreate`). */
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
  apiProfile: Profile
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
  presenceRefresh: selection(),
  onlineCount: get('api', '/notification/online', [session(), trigger('presenceRefresh')]),
  ...commands<ProfileCommands>({
    profileUpdate: { method: 'PATCH', serviceName: 'api', addr: '/profile', payload: 'body' },
    locationUpdate: { method: 'PUT', serviceName: 'api', addr: '/profile/location', payload: 'body' },
    profileCreate: { method: 'POST', serviceName: 'api', addr: '/profile', payload: 'body' },
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
  }),
} satisfies SpecsFor<ProfileNodes>
