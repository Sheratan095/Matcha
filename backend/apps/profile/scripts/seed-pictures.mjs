// Uploads the committed sample images in infra/garage/seed-images/ into the Garage
// bucket, so the demo profiles seeded by infra/db/seeds/001_users.sql actually have
// pictures that load (the DB only stores URLs, the bytes live in Garage).
//
// This lives under the profile app on purpose: @aws-sdk/client-s3 is a dependency of
// @matcha/profile and pnpm does not hoist it to the workspace root, so a script placed
// under infra/ could not import it.
//
// Run from the backend root (or via `make seed-pictures`). It is idempotent: a re-run
// simply overwrites the same objects.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const	scriptDir  = dirname(fileURLToPath(import.meta.url));
// scripts -> profile -> apps -> backend
const	backendDir = join(scriptDir, '..', '..', '..');
const	envFile    = join(backendDir, '.env');
const	imagesDir  = join(backendDir, 'infra', 'garage', 'seed-images');

// All objects go under this prefix so they never collide with real user uploads,
// which are keyed by "<userId>/<uuid>.webp".
const	KEY_PREFIX = 'seed';

// Read one variable from .env, stripping trailing inline comments and quotes.
// Mirrors env_value() in infra/garage/init.sh; we parse the file ourselves instead of
// using `node --env-file` because several S3_* lines carry trailing "# ..." comments
// that --env-file would keep as part of the value.
function readEnv(content, key, fallback)
{
	for (const rawLine of content.split('\n'))
	{
		const	line = rawLine.trim();

		if (!line.startsWith(`${key}=`))
			continue;

		let	value = line.slice(key.length + 1);

		value = value.replace(/\s*#.*$/, '').trim();       // drop inline comment
		value = value.replace(/^["']|["']$/g, '');          // drop surrounding quotes

		return (value);
	}

	return (fallback);
}

function contentTypeFor(fileName)
{
	if (fileName.endsWith('.webp'))
		return ('image/webp');

	if (fileName.endsWith('.png'))
		return ('image/png');

	if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg'))
		return ('image/jpeg');

	return ('application/octet-stream');
}

// The 500 generated profiles of infra/db/seeds/002_generated_profiles.sql point at
// seed/avatar-01.webp .. avatar-60.webp. They are drawn here instead of committed: a fixed palette
// indexed by the avatar number, so every run produces the same 60 images.
const	AVATAR_COUNT = 60;

// List lengths 7, 6, 8 and 5 (+ 4 hair styles) share as few factors as possible, so neighbouring
// avatars never repeat the same outfit and the whole combination only repeats after 840.
const	BACKGROUNDS = ['#f6d5c3', '#cfe3d4', '#d6dcf2', '#f2e2b8', '#e6d1ec', '#c9e6ea', '#f3cfd6'];
const	SKINS       = ['#f5d0b5', '#eab896', '#d39b72', '#b07850', '#8a5636', '#5f3a22'];
const	HAIRS       = ['#2b1d14', '#5a3a22', '#8c5a2b', '#c9a15a', '#e3c98d', '#a33b20', '#6d6d6d', '#111111'];
const	SHIRTS      = ['#3d6b5a', '#c0563b', '#2f4c7a', '#7a4f8c', '#d1a03b'];

// Hair drawn BEHIND the head (long hair) and IN FRONT of it (fringe, bun, beard), per style
function hairLayers(style, hair)
{
	const	shortTop = `<path d="M151 225 Q150 118 256 112 Q362 118 361 225 Q330 158 256 162 Q182 158 151 225 Z" fill="${hair}"/>`;

	switch (style)
	{
		case 0: // short
			return ({ back: '', front: shortTop });
		case 1: // long
			return ({ back: `<path d="M136 235 Q134 112 256 104 Q378 112 376 235 L392 430 L120 430 Z" fill="${hair}"/>`, front: shortTop });
		case 2: // bun
			return ({ back: `<circle cx="256" cy="100" r="46" fill="${hair}"/>`, front: shortTop });
		default: // shaved, with a beard
			return ({ back: '', front: `<path d="M168 275 Q256 425 344 275 Q306 335 256 336 Q206 335 168 275 Z" fill="${hair}"/>` });
	}
}

function avatarSvg(index)
{
	// Each step shares no factor with its list's length, so every colour of the list comes up
	const	pick = (list, step) => list[(index * step) % list.length];
	const	skin = pick(SKINS, 5);
	const	hair = hairLayers(index % 4, pick(HAIRS, 3));
	// Every fifth avatar wears glasses
	const	glasses = index % 5 === 0
		? '<g fill="none" stroke="#2b2b2b" stroke-width="6"><circle cx="215" cy="245" r="24"/><circle cx="297" cy="245" r="24"/><path d="M239 245 L273 245"/></g>'
		: '';

	return (`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
		<rect width="512" height="512" fill="${pick(BACKGROUNDS, 3)}"/>
		${hair.back}
		<ellipse cx="256" cy="560" rx="205" ry="175" fill="${pick(SHIRTS, 2)}"/>
		<rect x="226" y="330" width="60" height="70" fill="${skin}"/>
		<ellipse cx="256" cy="240" rx="105" ry="125" fill="${skin}"/>
		${hair.front}
		<circle cx="215" cy="245" r="10" fill="#2b2b2b"/>
		<circle cx="297" cy="245" r="10" fill="#2b2b2b"/>
		<path d="M220 300 Q256 328 292 300" stroke="#7a3b2e" stroke-width="7" fill="none" stroke-linecap="round"/>
		${glasses}
	</svg>`);
}

async function main()
{
	const	env = await readFile(envFile, 'utf8');

	const	endpoint  = readEnv(env, 'S3_ENDPOINT', 'http://localhost:3900');
	const	region    = readEnv(env, 'S3_REGION', 'garage');
	const	accessKey = readEnv(env, 'S3_ACCESS_KEY', '');
	const	secretKey = readEnv(env, 'S3_SECRET_KEY', '');
	const	bucket    = readEnv(env, 'S3_BUCKET', 'profile-pictures');

	if (!accessKey || !secretKey)
		throw (new Error('S3_ACCESS_KEY and S3_SECRET_KEY must be set in backend/.env'));

	// Same client shape as src/storage/storage.service.ts: Garage needs path-style
	// addressing and rejects signatures made for any region other than its s3_region.
	const	client = new S3Client({
		endpoint:       endpoint,
		region:         region,
		forcePathStyle: true,
		credentials:
		{
			accessKeyId:     accessKey,
			secretAccessKey: secretKey,
		},
	});

	const	files = (await readdir(imagesDir)).filter(name => !name.startsWith('.')).sort();

	if (files.length === 0)
		throw (new Error(`No seed images found in ${imagesDir}`));

	for (const file of files)
	{
		const	body = await readFile(join(imagesDir, file));
		const	key  = `${KEY_PREFIX}/${basename(file)}`;

		await client.send(new PutObjectCommand({
			Bucket:      bucket,
			Key:         key,
			Body:        body,
			ContentType: contentTypeFor(file),
		}));

		console.log(`uploaded ${key} (${body.length} bytes)`);
	}

	for (let i = 1; i <= AVATAR_COUNT; i++)
	{
		const	body = await sharp(Buffer.from(avatarSvg(i))).webp({ quality: 85 }).toBuffer();
		const	key  = `${KEY_PREFIX}/avatar-${String(i).padStart(2, '0')}.webp`;

		await client.send(new PutObjectCommand({
			Bucket:      bucket,
			Key:         key,
			Body:        body,
			ContentType: 'image/webp',
		}));
	}

	console.log(`Seeded ${files.length} picture(s) and ${AVATAR_COUNT} avatars into bucket "${bucket}" at ${endpoint}`);
}

main().catch((err) =>
{
	console.error(`Failed to seed pictures: ${err.name ?? ''} ${err.message ?? ''}`);
	process.exit(1);
});
