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

	@ApiProperty({ example: 37.7749, description: "Connected user's latitude coordinate" })
	latitude: number;

	@ApiProperty({ example: -122.4194, description: "Connected user's longitude coordinate" })
	longitude: number;
}

export class GetMatchesMapResponseDto
{
	@ApiProperty({ type: [GetMatchesMapDto], description: 'Users the authenticated user is connected to (mutual like)' })
	matches: MatchesMapResponseDto[];
}

export class GetMatchesMapErrorDto
{
	@ApiProperty({ example: 500, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'Failed to fetch matches', description: 'Error message' })
	message: string;
}
