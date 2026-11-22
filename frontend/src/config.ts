/** Build-time configuration. See .env. */

/**
 * Where the gateway is, as the browser sees it. Paths below it are /auth/*, /profile/*, /chat/*,
 * /notification/*. The default `/api` goes through this origin: the Vite dev proxy (vite.config.ts) or
 * the production server (server.mjs) forward it to the gateway, so the app works from any host name or
 * device. An absolute URL (`http://localhost:3000`) calls the gateway directly, which its CORS rule only
 * allows from the backend's FRONTEND_URL + FRONTEND_PORT (http://localhost:4000 by default).
 */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) || '/api'

/**
 * IP geolocation (no key, CORS open): where the connection comes from, city-level. Used only when the
 * device's position is refused or unavailable. Any service answering `latitude` / `longitude` works.
 */
export const GEOIP_URL: string = (import.meta.env.VITE_GEOIP_URL as string | undefined) ?? 'https://get.geojs.io/v1/ip/geo.json'

/** Nominatim (OpenStreetMap): place names for a position, and place search. 1 request/s at most. */
export const GEOCODER_URL: string =
  (import.meta.env.VITE_GEOCODER_URL as string | undefined) ?? 'https://nominatim.openstreetmap.org'

/** Map tiles (Leaflet URL template). OpenStreetMap's own tiles need the attribution the map shows. */
export const MAP_TILES_URL: string =
  (import.meta.env.VITE_MAP_TILES_URL as string | undefined) ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
