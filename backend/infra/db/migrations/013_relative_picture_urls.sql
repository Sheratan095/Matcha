-- Picture URLs move from Garage's web endpoint to a path on the frontend's own origin.
--
-- The old default S3_PUBLIC_URL, http://profile-pictures.web.garage.localhost:3902, only resolves on
-- the machine running Garage (browsers map *.localhost to their own loopback), so pictures broke on
-- every other device. The new default, /pictures, is forwarded to Garage by the frontend's server
-- (frontend/server.mjs, or the Vite dev proxy) and works from any host.
--
-- Rewrites the rows saved with the old default; URLs saved under any other S3_PUBLIC_URL are left
-- alone. Idempotent: once rewritten, no row matches, so re-running it (make db-migrate) is a no-op.
-- On a fresh database it runs before the seeds, which already use /pictures, and matches nothing.

UPDATE user_pictures
SET url = '/pictures/' || substring(url FROM length('http://profile-pictures.web.garage.localhost:3902/') + 1)
WHERE url LIKE 'http://profile-pictures.web.garage.localhost:3902/%';
