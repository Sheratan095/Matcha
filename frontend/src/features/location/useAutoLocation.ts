/**
 * Keeps the stored position current at runtime: once per page load and user, when the user keeps it
 * automatic (see mode.ts) and this browser already allows location, the device's position replaces
 * the stored one if it moved more than MOVED_KM. It never prompts: asking is left to a button press.
 * The first position is set by onboarding.
 */
import { useEffect } from 'react'
import { actions, getNodeValue, useNodeValue } from '@/wb'
import { devicePermission, deviceSpot, distanceKm, savedSpot } from './geo'
import { locationMode } from './mode'

/** Below this the backend's ~1 km snapping would hide the change anyway. */
const MOVED_KM = 1

const refreshed = new Set<string>()

async function refreshFromDevice(userId: string): Promise<void> {
  if (locationMode(userId) !== 'auto') return
  if ((await devicePermission()) !== 'granted') return
  const result = await deviceSpot()
  if (!result.ok) return
  const profile = getNodeValue('myProfile')
  const stored = profile && profile.userId === userId ? savedSpot(profile) : null
  if (!stored || distanceKm(stored, result.spot) < MOVED_KM) return
  await actions.setLocation(result.spot).catch((error: unknown) => console.warn('Location refresh failed', error))
}

export function useAutoLocation(): void {
  const profile = useNodeValue('myProfile')
  const userId = profile?.userId ?? null
  const located = profile ? savedSpot(profile) !== null : false
  useEffect(() => {
    if (!userId || !located || refreshed.has(userId)) return
    refreshed.add(userId)
    void refreshFromDevice(userId)
  }, [userId, located])
}
