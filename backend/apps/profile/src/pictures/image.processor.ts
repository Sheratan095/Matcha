import sharp from 'sharp';

export const PICTURE_MAX_SIDE = 1080;
export const PICTURE_OUTPUT_MIME = 'image/webp';
export const PICTURE_OUTPUT_EXT = 'webp';

// Re-encodes an uploaded image so that what we store is always clean and uniform.
//
// - EXIF/XMP/ICC metadata (GPS position, camera serial, capture date...) is dropped:
//   sharp never copies metadata to the output unless .withMetadata()/.keepMetadata() is called.
// - rotate() with no argument applies the EXIF orientation BEFORE it is stripped,
//   otherwise phone pictures would end up sideways.
// - Decoding the pixels also proves the file is a real image: a renamed .txt or a
//   polyglot file throws here, while the client-supplied MIME type proves nothing.
export async function sanitizeImage(input: Buffer): Promise<Buffer>
{
	return (await sharp(input, { failOn: 'error' })
		.rotate()
		.resize(PICTURE_MAX_SIDE, PICTURE_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
		.webp({ quality: 85 })
		.toBuffer());
}
