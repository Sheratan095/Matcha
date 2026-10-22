import { ApiProperty } from '@nestjs/swagger';

export class GetMatchesMapDto
{
	// UserId is retrieved from the access token, so no need to validate it here.
}

export class MatchesMapResponseDto
{
	@ApiProperty({ example: 'a1b2c3d4-...', description: 'ID of the connected user (mutual like)' })
	userId: string;

	@ApiProperty({ example: 'alice', description: 'Username of the connected user' })
	username: string;

	@ApiProperty({ example: 'https://.../pic.webp', description: "Connected user's profile picture URL, or null if they have none", nullable: true })
	profilePictureUrl: string | null;

	// A map needs a point rather than a distance, so this is the one place another user's
	// position is returned — quantized to a ~1 km grid, which is all the "up to their
	// neighbourhood" accuracy the subject asks for.
	@ApiProperty({ example: 41.91, nullable: true, description: "Connected user's latitude, snapped to a ~1 km grid; null if they have no location set" })
	latitude: number | null;

	@ApiProperty({ example: 12.54, nullable: true, description: "Connected user's longitude, snapped to a ~1 km grid; null if they have no location set" })
	longitude: number | null;
}

export class GetMatchesMapResponseDto
{
	@ApiProperty({ type: [GetMatchesMapDto], description: 'Users the authenticated user is connected to (mutual like)' })
	matches: MatchesMapResponseDto[];
}