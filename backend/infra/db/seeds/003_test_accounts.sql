-- TEST ACCOUNTS FOR THE FRONTEND, one per onboarding step. All verified, so no email is involved,
-- and all with password '1234' (the same bcrypt hash as testuser in 001). 001 and 002 only provide
-- COMPLETE profiles, so without these the onboarding could only be reached by registering, which
-- needs a working SMTP (docs/backend/smtp.md) to receive the verification code.
--
-- Each account is stopped where the onboarding resumes at a different step (resumeStep in
-- frontend/src/features/onboarding/steps.ts). The guard sends every incomplete profile to
-- /onboarding, and the page opens on the first step with something missing:
--   onb_about      names + date of birth only, as register() creates it   -> step 1 "About you" (no gender)
--   onb_into       + gender; preference explicitly NULL                   -> step 2 "Into"
--   onb_bio        + preference                                            -> step 3 "Bio"
--   onb_interests  + biography                                             -> step 4 "Interests"
--   onb_location   + one interest                                          -> step 5 "Location"
--   onb_photos     + location, no picture                                  -> step 6 "Photos" (still incomplete: profile_is_complete needs a profile picture)
--   ready          complete, in Milan, no likes/views/matches              -> straight into the app
--
-- IDEMPOTENT (fixed ids, ON CONFLICT DO NOTHING everywhere, one picture row at most), so it is safe
-- on a RUNNING database too (`make db-seed`), not only from the init script on `make db-reset`.
-- Re-running never undoes progress: an account completed since keeps its data.
-- No fame recompute here: these accounts have no likes or views, so the column default is right.

INSERT INTO users (id, username, email, password_hash, email_verified, language)
VALUES
	('3a1f0b21-0101-4000-8000-000000000101', 'onb_about',     'onb_about@matcha.local',     '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, 'en'),
	('3a1f0b21-0102-4000-8000-000000000102', 'onb_into',      'onb_into@matcha.local',      '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, 'en'),
	('3a1f0b21-0103-4000-8000-000000000103', 'onb_bio',       'onb_bio@matcha.local',       '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, 'en'),
	('3a1f0b21-0104-4000-8000-000000000104', 'onb_interests', 'onb_interests@matcha.local', '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, 'en'),
	('3a1f0b21-0105-4000-8000-000000000105', 'onb_location',  'onb_location@matcha.local',  '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, 'en'),
	('3a1f0b21-0106-4000-8000-000000000106', 'onb_photos',    'onb_photos@matcha.local',    '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, 'en'),
	('3a1f0b21-0107-4000-8000-000000000107', 'ready',         'ready@matcha.local',         '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, 'en')
ON CONFLICT DO NOTHING;

-- Exactly what POST /auth/register leaves behind: names and date of birth, nothing else
-- (sexual_preference omitted on purpose, so it takes the column DEFAULT 'both' like a real sign-up).
INSERT INTO profiles (user_id, first_name, last_name, date_of_birth)
VALUES
	('3a1f0b21-0101-4000-8000-000000000101', 'Ada', 'Byron', '1995-01-15')
ON CONFLICT DO NOTHING;

-- Preference explicitly NULL: the only way to stop on the "Into" step, since the column defaults to 'both'.
INSERT INTO profiles (user_id, first_name, last_name, date_of_birth, gender, sexual_preference)
VALUES
	('3a1f0b21-0102-4000-8000-000000000102', 'Ines', 'Toro', '1996-02-20', 'female', NULL)
ON CONFLICT DO NOTHING;

INSERT INTO profiles (user_id, first_name, last_name, date_of_birth, gender, sexual_preference, biography, latitude, longitude)
VALUES
	('3a1f0b21-0103-4000-8000-000000000103', 'Bruno', 'Olmi',    '1993-03-25', 'male',   'both', NULL,                               NULL,    NULL),
	('3a1f0b21-0104-4000-8000-000000000104', 'Irene', 'Sala',    '1997-04-30', 'female', 'both', 'Espresso first, questions later.', NULL,    NULL),
	('3a1f0b21-0105-4000-8000-000000000105', 'Luca',  'Ferri',   '1994-05-05', 'male',   'both', 'Bass player, amateur baker.',      NULL,    NULL),
	('3a1f0b21-0106-4000-8000-000000000106', 'Nora',  'Bellini', '1998-06-10', 'female', 'both', 'Sketchbook always in the bag.',    45.0703, 7.6869),
	('3a1f0b21-0107-4000-8000-000000000107', 'Rita',  'Conti',   '1992-07-15', 'female', 'both', 'Cooks for eight, eats for two.',   45.4642, 9.1900)
ON CONFLICT DO NOTHING;

-- Tags from 001, so this file never depends on the 500-profile seed.
INSERT INTO user_interests (user_id, tag_id)
VALUES
	('3a1f0b21-0105-4000-8000-000000000105', (SELECT id FROM interest_tags WHERE name = 'music')),
	('3a1f0b21-0106-4000-8000-000000000106', (SELECT id FROM interest_tags WHERE name = 'art')),
	('3a1f0b21-0107-4000-8000-000000000107', (SELECT id FROM interest_tags WHERE name = 'cooking')),
	('3a1f0b21-0107-4000-8000-000000000107', (SELECT id FROM interest_tags WHERE name = 'music'))
ON CONFLICT DO NOTHING;

-- Only the profile picture, and only for `ready`: a second (non-profile) row has no unique
-- constraint to conflict on and would duplicate on every run. Reuses an object `make seed-pictures`
-- already uploads; the URL hardcodes the default S3_PUBLIC_URL like the other seeds.
INSERT INTO user_pictures (user_id, url, is_profile)
VALUES
	('3a1f0b21-0107-4000-8000-000000000107', '/pictures/seed/alice-1.webp', TRUE)
ON CONFLICT DO NOTHING;
