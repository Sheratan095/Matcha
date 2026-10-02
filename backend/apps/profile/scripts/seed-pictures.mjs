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

	console.log(`Seeded ${files.length} picture(s) into bucket "${bucket}" at ${endpoint}`);
}

main().catch((err) =>
{
	console.error(`Failed to seed pictures: ${err.name ?? ''} ${err.message ?? ''}`);
	process.exit(1);
});
