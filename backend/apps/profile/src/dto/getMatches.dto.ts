import { ApiProperty } from '@nestjs/swagger';

export class GetMatchesDto
{
	// UserId is retrieved from the access token, so no need to validate it here.
}

export class MatchDto
{
	@ApiProperty({ example: 'a1b2c3d4-...', description: 'ID of the connected user (mutual like)' })
	userId: string;

	@ApiProperty({ example: 'alice', description: 'Username of the connected user' })
	username: string;

	@ApiProperty({ example: 'https://.../pic.webp', description: "Connected user's profile picture URL, or null if they have none", nullable: true })
	profilePictureUrl: string | null;
}

export class GetMatchesResponseDto
{
	@ApiProperty({ type: [MatchDto], description: 'Users the authenticated user is connected to (mutual like)' })
	matches: MatchDto[];
}

export class GetMatchesErrorDto
{
	@ApiProperty({ example: 500, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'Failed to fetch matches', description: 'Error message' })
	message: string;
}
