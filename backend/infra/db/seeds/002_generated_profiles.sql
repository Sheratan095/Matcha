-- 500 GENERATED PROFILES (subject: "at least 500 distinct profiles"), on top of the hand-made
-- fixtures of 001_users.sql, which this file does not touch.
--
-- Every generated profile is COMPLETE (profile_is_complete in 002_profiles.sql), so all of them can
-- appear in discover and search: names that pass the name CHECK, a gender and preference, an age
-- between 18 and 60, a location in Italy, a bio, 1-5 interests and a profile picture.
--
-- DETERMINISTIC: setseed() fixes random(), and the ids are md5 hashes of the row number (made valid
-- v4 UUIDs), so every `make db-reset` produces the same 500 people (a bug seen once can be
-- reproduced). Usernames are the first name + the row number, e.g. giulia42. Password '1234' for
-- all, like 001.
--
-- Pictures point at seed/avatar-01.webp .. avatar-60.webp, generated and uploaded to Garage by
-- `make seed-pictures` (apps/profile/scripts/seed-pictures.mjs).
--
-- LIKES: a mutual like is a MATCH, and a match must have a chats row (addLikeAndMatch creates both).
-- So random likes are inserted in ONE direction per pair only, and matches are created on purpose,
-- as both likes plus their chat.

SELECT setseed(0.42);

-- More tags than the 10 of 001, so common-tag counts spread out
INSERT INTO interest_tags (name)
VALUES
	('yoga'), ('running'), ('cycling'), ('climbing'), ('swimming'), ('football'), ('tennis'),
	('dancing'), ('theatre'), ('cinema'), ('wine'), ('coffee'), ('baking'), ('gardening'), ('dogs'),
	('cats'), ('boardgames'), ('anime'), ('fashion'), ('volunteering'), ('astronomy'), ('history'),
	('languages'), ('sailing'), ('skiing'), ('jazz'), ('opera')
ON CONFLICT DO NOTHING;

-- Cities with a weight (roughly their size), so Rome and Milan get the most people
CREATE TEMP TABLE seed_cities (name TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, weight INT);
INSERT INTO seed_cities VALUES
	('Rome', 41.9028, 12.4964, 15), ('Milan', 45.4642, 9.1900, 11), ('Naples', 40.8518, 14.2681, 8),
	('Turin', 45.0703, 7.6869, 6), ('Palermo', 38.1157, 13.3615, 5), ('Bologna', 44.4949, 11.3426, 5),
	('Florence', 43.7696, 11.2558, 5), ('Genoa', 44.4056, 8.9463, 4), ('Bari', 41.1171, 16.8719, 4),
	('Catania', 37.5079, 15.0830, 3), ('Mestre', 45.4900, 12.2400, 3), ('Verona', 45.4384, 10.9916, 3),
	('Padua', 45.4064, 11.8768, 3), ('Cagliari', 39.2238, 9.1217, 3), ('Trieste', 45.6495, 13.7768, 2),
	('Brescia', 45.5416, 10.2118, 2), ('Parma', 44.8015, 10.3279, 2), ('Modena', 44.6471, 10.9252, 2),
	('Perugia', 43.1107, 12.3908, 2), ('Pescara', 42.4618, 14.2161, 2), ('Ancona', 43.6158, 13.5189, 2),
	('Trento', 46.0748, 11.1217, 2), ('Lecce', 40.3515, 18.1750, 2), ('Salerno', 40.6824, 14.7681, 2),
	('Messina', 38.1938, 15.5540, 2), ('Reggio Calabria', 38.1113, 15.6473, 2), ('Bolzano', 46.4983, 11.3548, 1),
	('Sassari', 40.7259, 8.5557, 1);

-- Cumulative weights as [lo, hi) ranges in 0..1, so one random() picks a city by weight
CREATE TEMP TABLE seed_city_ranges AS
SELECT name, lat, lng,
	(SUM(weight) OVER (ORDER BY name) - weight)::double precision / SUM(weight) OVER () AS lo,
	SUM(weight) OVER (ORDER BY name)::double precision / SUM(weight) OVER () AS hi
FROM seed_cities;

-- Every random draw of a person, made once and kept, so the steps below stay readable
CREATE TEMP TABLE seed_draws AS
SELECT n, random() AS r_gender, random() AS r_first, random() AS r_last, random() AS r_pref,
	random() AS r_age, random() AS r_city, random() AS r_dlat, random() AS r_dlng,
	random() AS r_bio1, random() AS r_bio2, random() AS r_seen, random() AS r_pic, random() AS r_extra,
	random() AS r_tags
FROM generate_series(1, 500) AS n;

CREATE TEMP TABLE seed_people AS
WITH lists AS (
	SELECT
		ARRAY['Marco','Luca','Giuseppe','Francesco','Alessandro','Andrea','Matteo','Lorenzo','Davide',
			'Simone','Federico','Riccardo','Gabriele','Stefano','Antonio','Giovanni','Paolo','Roberto',
			'Nicola','Emanuele','Tommaso','Leonardo','Filippo','Pietro','Daniele','Michele','Fabio',
			'Claudio','Enrico','Salvatore','Vincenzo','Alberto','Massimo','Edoardo','Jacopo','Samuele',
			'Mattia','Diego','Niccolò','Raffaele','Gianluca','Carlo','Dario','Ivan','Sergio'] AS male,
		ARRAY['Giulia','Francesca','Chiara','Sara','Martina','Valentina','Alessia','Elena','Federica',
			'Silvia','Laura','Elisa','Giorgia','Sofia','Aurora','Alice','Beatrice','Camilla','Ginevra',
			'Arianna','Noemi','Anna','Marta','Ilaria','Roberta','Paola','Serena','Veronica','Claudia',
			'Monica','Eleonora','Greta','Irene','Ludovica','Bianca','Vittoria','Rebecca','Matilde',
			'Emma','Caterina','Lucia','Nicole','Benedetta','Agnese','Asia'] AS female,
		-- A few with an apostrophe, a space or an accent, so the name CHECK is exercised
		ARRAY['Rossi','Russo','Ferrari','Esposito','Bianchi','Romano','Colombo','Ricci','Marino',
			'Greco','Bruno','Gallo','Conti','De Luca','Mancini','Costa','Giordano','Rizzo','Lombardi',
			'Moretti','Barbieri','Fontana','Santoro','Mariani','Rinaldi','Caruso','Ferrara','Galli',
			'Martini','Leone','Longo','Gentile','Martinelli','Vitale','Lombardo','Serra','Coppola',
			'De Santis','D''Angelo','Marchetti','Parisi','Villa','Conte','Ferraro','Ferri','Fabbri',
			'Bianco','Marini','Grasso','Valentini','Messina','Sala','De Angelis','Gatti','Pellegrini',
			'Palumbo','Sanna','Farina','Rizzi','Monti','Cattaneo','Morelli','Amato','Silvestri','Mazza',
			'Testa','Grassi','Carbone','Giuliani','D''Amico','Dell''Orto','Lo Russo','Cantù',
			'Sorrentino','Riva','Donati','Benedetti','Orlando','Piras'] AS surnames,
		ARRAY['Coffee first, then everything else','Weekend hiker','Amateur cook with big ambitions',
			'Always planning the next trip','Bookworm','Film photographer','Gym in the morning, pizza at night',
			'Terrible singer, enthusiastic anyway','Dog person','Cat person','Museum wanderer',
			'Learning my third language','Sunset chaser','Board game strategist','Jazz on vinyl',
			'Engineer by day, musician by night','Recovering perfectionist','Plant parent'] AS bio_first,
		ARRAY['Looking for someone to share a pizza with.','Tell me your favourite book.',
			'Let''s get an aperitivo.','Bonus points if you can cook.','Show me your city.',
			'Up for spontaneous road trips.','Good conversation beats everything.',
			'Let''s find the best gelato in town.','Teach me something new.',
			'Sea or mountains? Both.'] AS bio_second
)
SELECT
	d.n,
	-- md5 for determinism, with the version digit forced to 4 and the variant digit to 8: a raw md5
	-- is valid hex but not a valid UUID, and @IsUUID / ParseUUIDPipe reject it (400 on every route)
	overlay(overlay(md5('matcha-seed-user-' || d.n) placing '4' from 13) placing '8' from 17)::uuid AS id,
	g.gender,
	f.first_name,
	l.surnames[1 + floor(d.r_last * array_length(l.surnames, 1))::int] AS last_name,
	-- ASCII only (users_username_format_check): Niccolò -> niccolo42
	translate(lower(f.first_name), 'àèéìòù', 'aeeiou') || d.n AS username,
	CASE
		WHEN d.r_pref < 0.30 THEN 'both'
		-- Opposite gender for male/female, 'both' for 'other'
		WHEN d.r_pref < 0.80 THEN CASE g.gender WHEN 'male' THEN 'female' WHEN 'female' THEN 'male' ELSE 'both' END
		WHEN d.r_pref < 0.92 THEN g.gender
		ELSE 'other'
	END AS sexual_preference,
	-- 18 to 60 years old
	(current_date - interval '18 years' - d.r_age * interval '42 years')::date AS date_of_birth,
	-- Up to ~9 km around the city centre (0.08 degrees of latitude ~ 9 km)
	c.lat + (d.r_dlat - 0.5) * 0.16 AS latitude,
	c.lng + (d.r_dlng - 0.5) * 0.16 / cos(radians(c.lat)) AS longitude,
	l.bio_first[1 + floor(d.r_bio1 * array_length(l.bio_first, 1))::int] || '. '
		|| l.bio_second[1 + floor(d.r_bio2 * array_length(l.bio_second, 1))::int] AS biography,
	now() - d.r_seen * interval '21 days' AS last_seen,
	1 + floor(d.r_pic * 60)::int AS avatar,
	floor(d.r_extra * 4)::int AS extra_pictures,
	1 + floor(d.r_tags * 5)::int AS tag_count
FROM seed_draws d
CROSS JOIN lists l
CROSS JOIN LATERAL (
	SELECT CASE WHEN d.r_gender < 0.45 THEN 'male' WHEN d.r_gender < 0.90 THEN 'female' ELSE 'other' END AS gender
) g
CROSS JOIN LATERAL (
	SELECT CASE
		WHEN g.gender = 'male' THEN l.male[1 + floor(d.r_first * array_length(l.male, 1))::int]
		WHEN g.gender = 'female' THEN l.female[1 + floor(d.r_first * array_length(l.female, 1))::int]
		-- 'other': from both lists
		ELSE (l.male || l.female)[1 + floor(d.r_first * (array_length(l.male, 1) + array_length(l.female, 1)))::int]
	END AS first_name
) f
JOIN seed_city_ranges c ON d.r_city >= c.lo AND d.r_city < c.hi;

INSERT INTO users (id, username, email, password_hash, email_verified)
SELECT id, username, username || '@matcha.local', '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE
FROM seed_people
ON CONFLICT DO NOTHING;

INSERT INTO profiles (user_id, first_name, last_name, gender, sexual_preference, date_of_birth, latitude, longitude, biography, last_seen)
SELECT id, first_name, last_name, gender, sexual_preference, date_of_birth, latitude, longitude, biography, last_seen
FROM seed_people
ON CONFLICT DO NOTHING;

-- 1 to 5 distinct interests each. The LIMIT reads the outer row, which makes the subquery run (and
-- reshuffle) once per person instead of once overall.
INSERT INTO user_interests (user_id, tag_id)
SELECT p.id, t.id
FROM seed_people p
CROSS JOIN LATERAL (SELECT id FROM interest_tags ORDER BY random() LIMIT p.tag_count) t
ON CONFLICT DO NOTHING;

-- One profile picture, plus 0-3 others. 17 is coprime with 60, so the extras never repeat the avatar.
INSERT INTO user_pictures (user_id, url, is_profile)
SELECT id, 'http://profile-pictures.web.garage.localhost:3902/seed/avatar-' || lpad(avatar::text, 2, '0') || '.webp', TRUE
FROM seed_people;

INSERT INTO user_pictures (user_id, url, is_profile)
SELECT p.id, 'http://profile-pictures.web.garage.localhost:3902/seed/avatar-' || lpad((1 + (p.avatar - 1 + s * 17) % 60)::text, 2, '0') || '.webp', FALSE
FROM seed_people p
CROSS JOIN LATERAL generate_series(1, p.extra_pictures) AS s;

-- MATCHES: ~150 pairs, each as both likes plus the chat row
CREATE TEMP TABLE seed_matches AS
SELECT DISTINCT LEAST(a, b) AS a, GREATEST(a, b) AS b
FROM (
	SELECT 1 + floor(random() * 500)::int AS a, 1 + floor(random() * 500)::int AS b
	FROM generate_series(1, 160)
) pairs
WHERE a <> b;

INSERT INTO likes (liker_id, liked_id)
SELECT pa.id, pb.id FROM seed_matches m JOIN seed_people pa ON pa.n = m.a JOIN seed_people pb ON pb.n = m.b
UNION ALL
SELECT pb.id, pa.id FROM seed_matches m JOIN seed_people pa ON pa.n = m.a JOIN seed_people pb ON pb.n = m.b
ON CONFLICT DO NOTHING;

INSERT INTO chats (user_a, user_b)
SELECT LEAST(pa.id, pb.id), GREATEST(pa.id, pb.id)
FROM seed_matches m JOIN seed_people pa ON pa.n = m.a JOIN seed_people pb ON pb.n = m.b
ON CONFLICT DO NOTHING;

-- ONE-WAY LIKES: ~3000 random pairs, one direction per pair (DISTINCT ON the unordered pair), and
-- never a pair that is already a match, so no mutual like ever lacks its chat
INSERT INTO likes (liker_id, liked_id)
SELECT pl.id, pd.id
FROM (
	SELECT DISTINCT ON (LEAST(liker, liked), GREATEST(liker, liked)) liker, liked
	FROM (
		SELECT 1 + floor(random() * 500)::int AS liker, 1 + floor(random() * 500)::int AS liked
		FROM generate_series(1, 3000)
	) raw
	WHERE liker <> liked
	ORDER BY LEAST(liker, liked), GREATEST(liker, liked), liker
) one_way
JOIN seed_people pl ON pl.n = one_way.liker
JOIN seed_people pd ON pd.n = one_way.liked
WHERE NOT EXISTS (SELECT 1 FROM seed_matches m WHERE m.a = LEAST(one_way.liker, one_way.liked) AND m.b = GREATEST(one_way.liker, one_way.liked))
ON CONFLICT DO NOTHING;

-- Some generated people like the main fixtures, so testuser and alice have admirers to look at.
-- One-way only: neither of them likes any generated user.
INSERT INTO likes (liker_id, liked_id)
SELECT p.id, u.id
FROM seed_people p
JOIN users u ON (u.username = 'testuser' AND p.n % 17 = 0) OR (u.username = 'alice' AND p.n % 29 = 0)
ON CONFLICT DO NOTHING;

-- VIEWS: ~5000 random ones, plus every liker has seen who they liked (fame counts viewers UNION likers)
INSERT INTO profile_views (viewer_id, viewed_id)
SELECT pv.id, pw.id
FROM (
	SELECT 1 + floor(random() * 500)::int AS viewer, 1 + floor(random() * 500)::int AS viewed
	FROM generate_series(1, 5000)
) raw
JOIN seed_people pv ON pv.n = raw.viewer
JOIN seed_people pw ON pw.n = raw.viewed
WHERE raw.viewer <> raw.viewed
ON CONFLICT DO NOTHING;

INSERT INTO profile_views (viewer_id, viewed_id)
SELECT liker_id, liked_id FROM likes
ON CONFLICT DO NOTHING;

-- MUST BE LAST, for the same reason as at the end of 001: fame depends on everything above.
UPDATE profiles SET fame_rating = compute_fame_rating(user_id);
