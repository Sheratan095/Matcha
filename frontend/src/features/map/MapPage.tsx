/**
 * `/map`: your connections (mutual likes) on a Leaflet map, and you on it (bonus: interactive map).
 *
 * Data: `matchesMap` (GET /profile/matches/map: positions snapped to ~1 km by the backend, so a pin
 * shows a neighbourhood, never an address) and `myProfile` (your own, full-precision spot). "Locate
 * me precisely" asks the device's GPS and stores the result (`actions.setLocation`). A face opens
 * the real profile (GET /profile/:userId).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { deviceSpot, savedSpot, type DeviceFailure } from '@/features/location/geo'
import { setLocationMode } from '@/features/location/mode'
import ProfileSheet, { type ProfileTarget } from '@/features/profile/ProfileSheet'
import {
  Avatar,
  Button,
  ButtonLink,
  EmptyState,
  IconCards,
  IconGlobe,
  IconPin,
  IconRefresh,
  ListRow,
  Notice,
  PageHeader,
  Skeleton,
  TicketHeader,
  toast,
} from '@/ui'
import { actions, refresh, toApiError, useNodeStatus, useNodeValue } from '@/wb'
import { kmText, placeMatches, type PlacedMatch } from './layout'
import { MatchMap, type MatchMapHandle } from './MatchMap'
import s from './MapPage.module.css'

const DEVICE_FAILURE: Record<DeviceFailure, string> = {
  unsupported: 'This browser cannot tell where it is.',
  denied: 'Location access is off for this site: allow it in the browser to use your exact position.',
  unavailable: 'This device could not find its position right now.',
  timeout: 'Finding your position took too long. Try again outdoors or near a window.',
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export default function MapPage() {
  const result = useNodeValue('matchesMap')
  const status = useNodeStatus('matchesMap')
  const profile = useNodeValue('myProfile')
  const mapRef = useRef<MatchMapHandle>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [target, setTarget] = useState<ProfileTarget | null>(null)
  const [locating, setLocating] = useState(false)
  const [reloading, setReloading] = useState(false)

  // Connections change with every like elsewhere in the app: fresh on each visit.
  useEffect(() => {
    void refresh('matchesMap')
  }, [])

  const me = profile ? savedSpot(profile) : null
  const meLat = me?.latitude ?? null
  const meLon = me?.longitude ?? null
  const matches = result?.matches
  const { placed, unplaced } = useMemo(
    () => placeMatches(matches ?? [], meLat !== null && meLon !== null ? { latitude: meLat, longitude: meLon } : null),
    [matches, meLat, meLon],
  )
  const selected = placed.find((person) => person.userId === selectedId) ?? null

  const reload = async () => {
    setReloading(true)
    await refresh('matchesMap')
    setReloading(false)
  }

  const locate = async () => {
    if (locating) return
    setLocating(true)
    try {
      const found = await deviceSpot()
      if (!found.ok) {
        toast.error('No precise position', DEVICE_FAILURE[found.reason])
        return
      }
      await actions.setLocation(found.spot)
      // From the device: keep it automatically up to date on the next visits too.
      if (profile) setLocationMode(profile.userId, 'auto')
      toast.success('You are on the map', 'Others only ever see a distance, rounded to about a kilometre.')
      mapRef.current?.fitAll()
    } catch (error) {
      toast.error('Your position was not saved', toApiError(error).message)
    } finally {
      setLocating(false)
    }
  }

  const open = (person: PlacedMatch) => setTarget({ userId: person.userId, source: 'api' })
  const closeSheet = () => {
    setTarget(null)
    // An unlike or a block from the sheet takes the person off the map.
    void refresh('matchesMap')
  }

  const loading = matches == null && status.status !== 'error'
  const failed = matches == null && status.status === 'error'

  return (
    <div className={s.page}>
      <PageHeader
        title="Map"
        kicker="Your connections nearby"
        actions={
          <Button size="sm" variant="paper" icon={<IconRefresh size={16} />} loading={reloading} onClick={() => void reload()}>
            Refresh
          </Button>
        }
      />

      {profile && !me ? (
        <Notice
          tone="info"
          title="You are not on the map yet"
          action={
            <Button size="sm" variant="ink" icon={<IconPin size={16} />} loading={locating} onClick={() => void locate()}>
              Locate me
            </Button>
          }
        >
          Set your position to see how far your connections are.
        </Notice>
      ) : null}

      <div className={s.toolbar}>
        <Button size="sm" variant="ink" icon={<IconPin size={16} />} loading={locating} onClick={() => void locate()}>
          Locate me precisely
        </Button>
        <Button size="sm" variant="paper" icon={<IconGlobe size={16} />} onClick={() => mapRef.current?.fitAll()}>
          Show everyone
        </Button>
      </div>

      <MatchMap ref={mapRef} people={placed} me={me} selectedId={selectedId} onSelect={setSelectedId} ready={matches != null} />

      {selected ? (
        <div className={s.focus} aria-live="polite">
          <Avatar src={selected.profilePictureUrl} name={selected.username} size="md" decorative />
          <div className={s.focusText}>
            <span className={s.focusName}>@{selected.username}</span>
            <span className={s.focusMeta}>{selected.km !== null ? `${kmText(selected.km)} away · approximate` : 'Approximate area'}</span>
          </div>
          <Button size="sm" onClick={() => open(selected)}>
            View profile
          </Button>
        </div>
      ) : null}

      {failed ? (
        <Notice
          tone="error"
          title="Your connections did not load"
          action={
            <Button size="sm" variant="ink" icon={<IconRefresh size={16} />} loading={reloading} onClick={() => void reload()}>
              Try again
            </Button>
          }
        >
          {status.error?.message ?? 'Something went wrong.'}
        </Notice>
      ) : loading ? (
        <div aria-busy="true" aria-label="Loading your connections">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} height={64} style={{ marginBottom: 8, borderRadius: 'var(--r-md)' }} />
          ))}
        </div>
      ) : placed.length === 0 && unplaced.length === 0 ? (
        <EmptyState
          stamp="Nobody yet"
          stampTone="blue"
          title="No connections on the map"
          action={
            <ButtonLink to="/discover" icon={<IconCards size={18} />}>
              Go discover
            </ButtonLink>
          }
        >
          When you and someone like each other, they show up here.
        </EmptyState>
      ) : (
        <section aria-label="Your connections">
          <TicketHeader label="Connections · nearest first" meta={pad2(placed.length + unplaced.length)} />
          <ul className={s.list}>
            {placed.map((person) => (
              <li key={person.userId}>
                <ListRow
                  leading={<Avatar src={person.profilePictureUrl} name={person.username} size="sm" decorative />}
                  title={`@${person.username}`}
                  subtitle={person.km !== null ? `${kmText(person.km)} away` : 'On the map'}
                  unread={person.userId === selectedId}
                  onClick={() => setSelectedId(person.userId)}
                />
              </li>
            ))}
            {unplaced.map((person) => (
              <li key={person.userId}>
                <ListRow
                  leading={<Avatar src={person.profilePictureUrl} name={person.username} size="sm" decorative />}
                  title={`@${person.username}`}
                  subtitle="No location shared"
                  onClick={() => setTarget({ userId: person.userId, source: 'api' })}
                />
              </li>
            ))}
          </ul>
          <p className={s.note}>Positions are rounded to about a kilometre: a face shows a neighbourhood, not an address.</p>
        </section>
      )}

      <ProfileSheet target={target} onClose={closeSheet} onBlocked={() => setSelectedId(null)} />
    </div>
  )
}
