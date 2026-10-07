import { ApiProperty } from '@nestjs/swagger';

export class GetMyLikesDto
{
	// UserId is retrieved from the access token, so no need to validate it here.
}

export class LikerDto
{
	@ApiProperty({ example: 'a1b2c3d4-...', description: 'ID of the user who liked this profile' })
	likerId: string;

	@ApiProperty({ example: 'alice', description: 'Username of the liker' })
	username: string;

	@ApiProperty({ example: 'https://.../pic.webp', description: "Liker's profile picture URL, or null if they have none", nullable: true })
	profilePictureUrl: string | null;
}

export class GetMyLikesResponseDto
{
	@ApiProperty({ type: [LikerDto], description: 'Users who liked this profile' })
	likes: LikerDto[];
}

export class GetMyLikesErrorDto
{
	@ApiProperty({ example: 500, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'Failed to fetch likers', description: 'Error message' })
	message: string;
}
