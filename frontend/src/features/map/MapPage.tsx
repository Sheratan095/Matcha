/**
 * `/map`: your connections (mutual likes) on a Leaflet map, and you on it (bonus: interactive map).
 *
 * Data: `matchesMap` (GET /profile/matches/map: positions snapped to ~1 km by the backend, so a pin
 * shows a neighbourhood, never an address) and `myProfile` (your own, full-precision spot). "Locate
 * me precisely" asks the device's GPS and stores the result (`actions.setLocation`). A face opens
 * the real profile (GET /profile/:userId).
 */
import { useMemo, useRef, useState } from 'react'
import { deviceSpot, savedSpot, type DeviceFailure } from '@/features/location/geo'
import { setLocationMode } from '@/features/location/mode'
import { useT, type MessageKey } from '@/i18n'
import { LocationSection } from '@/features/me/LocationSection'
import ProfileSheet, { type ProfileTarget } from '@/features/profile/ProfileSheet'
import {
  Avatar,
  Button,
  ButtonLink,
  EmptyState,
  IconGlobe,
  IconPin,
  IconRefresh,
  IconRegMark,
  ListRow,
  Notice,
  PageHeader,
  Skeleton,
  TicketHeader,
  toast,
} from '@/ui'
import { actions, refresh, REVISIT_MS, toApiError, useLoad, useNodeStatus, useNodeValue } from '@/wb'
import { kmText, placeMatches, type PlacedMatch } from './layout'
import { MatchMap, type MatchMapHandle } from './MatchMap'
import s from './MapPage.module.css'

const DEVICE_FAILURE: Record<DeviceFailure, MessageKey> = {
  unsupported: 'map.failUnsupported',
  denied: 'map.failDenied',
  unavailable: 'map.failUnavailable',
  timeout: 'map.failTimeout',
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export default function MapPage() {
  const t = useT()
  const result = useNodeValue('matchesMap')
  const status = useNodeStatus('matchesMap')
  const profile = useNodeValue('myProfile')
  const mapRef = useRef<MatchMapHandle>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [target, setTarget] = useState<ProfileTarget | null>(null)
  const [locating, setLocating] = useState(false)
  const [reloading, setReloading] = useState(false)

  // Loads on the first visit; connections made or broken refresh it, and positions move: a later
  // visit refetches it once it is getting old.
  useLoad('matchesMap', { maxAgeMs: REVISIT_MS })

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
        toast.error(t('map.noPreciseTitle'), t(DEVICE_FAILURE[found.reason]))
        return
      }
      await actions.setLocation(found.spot)
      // From the device: keep it automatically up to date on the next visits too.
      if (profile) setLocationMode(profile.userId, 'auto')
      toast.success(t('map.onMapTitle'), t('map.onMapBody'))
      mapRef.current?.fitAll()
    } catch (error) {
      toast.error(t('map.notSaved'), toApiError(error).message)
    } finally {
      setLocating(false)
    }
  }

  const open = (person: PlacedMatch) => setTarget({ userId: person.userId })
  // An unlike or a block from the sheet refreshes the map itself (actions.unlikeUser / blockUser).
  const closeSheet = () => setTarget(null)

  const loading = matches == null && status.status !== 'error'
  const failed = matches == null && status.status === 'error'

  return (
    <div className={s.page}>
      <PageHeader
        title={t('map.title')}
        kicker={t('map.kicker')}
        actions={
          <Button size="sm" variant="paper" icon={<IconRefresh size={16} />} loading={reloading} onClick={() => void reload()}>
            {t('map.refresh')}
          </Button>
        }
      />

      {profile && !me ? (
        <Notice
          tone="info"
          title={t('map.notOnTitle')}
          action={
            <Button size="sm" variant="ink" icon={<IconPin size={16} />} loading={locating} onClick={() => void locate()}>
              {t('map.locateMe')}
            </Button>
          }
        >
          {t('map.notOnBody')}
        </Notice>
      ) : null}

      <div className={s.toolbar}>
        <Button size="sm" variant="ink" icon={<IconPin size={16} />} loading={locating} onClick={() => void locate()}>
          {t('map.locatePrecisely')}
        </Button>
        <Button size="sm" variant="paper" icon={<IconGlobe size={16} />} onClick={() => mapRef.current?.fitAll()}>
          {t('map.showEveryone')}
        </Button>
      </div>

      <MatchMap ref={mapRef} people={placed} me={me} selectedId={selectedId} onSelect={setSelectedId} ready={matches != null} />

      {selected ? (
        <div className={s.focus} aria-live="polite">
          <Avatar src={selected.profilePictureUrl} name={selected.username} size="md" decorative />
          <div className={s.focusText}>
            <span className={s.focusName}>@{selected.username}</span>
            <span className={s.focusMeta}>{selected.km !== null ? t('map.awayApprox', { distance: kmText(selected.km) }) : t('map.approxArea')}</span>
          </div>
          <Button size="sm" onClick={() => open(selected)}>
            {t('chat.viewProfile')}
          </Button>
        </div>
      ) : null}

      {failed ? (
        <Notice
          tone="error"
          title={t('map.loadFailed')}
          action={
            <Button size="sm" variant="ink" icon={<IconRefresh size={16} />} loading={reloading} onClick={() => void reload()}>
              {t('common.tryAgain')}
            </Button>
          }
        >
          {status.error?.message ?? t('kit.wrong')}
        </Notice>
      ) : loading ? (
        <div aria-busy="true" aria-label={t('map.loading')}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} height={64} style={{ marginBottom: 8, borderRadius: 'var(--r-md)' }} />
          ))}
        </div>
      ) : placed.length === 0 && unplaced.length === 0 ? (
        <EmptyState
          stamp={t('map.nobodyStamp')}
          stampTone="blue"
          title={t('map.emptyTitle')}
          action={
            <ButtonLink to="/discover" icon={<IconRegMark size={18} />}>
              {t('map.goDiscover')}
            </ButtonLink>
          }
        >
          {t('map.emptyBody')}
        </EmptyState>
      ) : (
        <section aria-label={t('map.connectionsLabel')}>
          <TicketHeader label={t('map.listHeader')} meta={pad2(placed.length + unplaced.length)} />
          <ul className={s.list}>
            {placed.map((person) => (
              <li key={person.userId}>
                <ListRow
                  leading={<Avatar src={person.profilePictureUrl} name={person.username} size="sm" decorative />}
                  title={`@${person.username}`}
                  subtitle={person.km !== null ? t('search.away', { distance: kmText(person.km) }) : t('map.onTheMap')}
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
                  subtitle={t('map.noLocation')}
                  onClick={() => setTarget({ userId: person.userId })}
                />
              </li>
            ))}
          </ul>
          <p className={s.note}>{t('map.rounded')}</p>
        </section>
      )}

      {/* The same picker as the profile's Location section: pick a spot on a map, by search or from the device. */}
      {profile ? <LocationSection profile={profile} onSaved={() => mapRef.current?.fitAll()} /> : null}

      <ProfileSheet target={target} onClose={closeSheet} onBlocked={() => setSelectedId(null)} />
    </div>
  )
}
