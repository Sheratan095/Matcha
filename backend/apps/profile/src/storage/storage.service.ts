import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { S3Client, HeadBucketCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@repo/config';

// Thin wrapper around the S3 API, pointed at Garage.
// Any S3-compatible backend (AWS S3, MinIO...) works by changing the S3_* env vars only.
//
// The bucket, the access key and the public read access are provisioned once by
// infra/garage/init.sh, NOT here: Garage manages those through its admin CLI, not the S3 API.
@Injectable()
export class StorageService implements OnModuleInit
{
	private readonly logger = new Logger('StorageService');
	private readonly bucket = env.S3_BUCKET;
	private readonly client = new S3Client({
		endpoint:       env.S3_ENDPOINT,
		region:         env.S3_REGION, // Garage rejects signatures made for any region other than its s3_region
		forcePathStyle: true, // Address buckets as /<bucket>/<key> instead of <bucket>.<host> subdomains
		credentials:
		{
			accessKeyId:     env.S3_ACCESS_KEY,
			secretAccessKey: env.S3_SECRET_KEY,
		},
	});

	async onModuleInit()
	{
		// Startup check only: don't crash the whole service, profile reads still work without storage.
		try
		{
			await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
			this.logger.log(`Bucket "${this.bucket}" reachable at ${env.S3_ENDPOINT}`);
		}
		catch (err: any)
		{
			this.logger.error(`Storage not ready, picture uploads will fail (is Garage running and initialized? see docs/object-storage.md): ${err.name ?? ''} ${err.message ?? ''}`);
		}
	}

	async upload(key: string, body: Buffer, contentType: string): Promise<string>
	{
		await this.client.send(new PutObjectCommand({
			Bucket:      this.bucket,
			Key:         key,
			Body:        body,
			ContentType: contentType,
		}));

		return (`${env.S3_PUBLIC_URL}/${key}`);
	}

	async delete(key: string): Promise<void>
	{
		await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
	}

	// Inverse of upload(): "<public url>/<userId>/<uuid>.webp" -> "<userId>/<uuid>.webp"
	keyFromUrl(url: string): string
	{
		const	prefix = `${env.S3_PUBLIC_URL}/`;

		return (url.startsWith(prefix) ? url.slice(prefix.length) : url);
	}
}
