import { ApiProperty } from '@nestjs/swagger';

export class GetBlockedDto
{
	// UserId is retrieved from the access token, so no need to validate it here.
}

export class BlockedUserDto
{
	@ApiProperty({ example: 'a1b2c3d4-...', description: 'ID of the blocked user' })
	userId: string;

	@ApiProperty({ example: 'alice', description: 'Username of the blocked user' })
	username: string;

	@ApiProperty({ example: 'https://.../pic.webp', description: "Blocked user's profile picture URL, or null if they have none", nullable: true })
	profilePictureUrl: string | null;
}

export class GetBlockedResponseDto
{
	@ApiProperty({ type: [BlockedUserDto], description: 'Users the authenticated user has blocked' })
	blocks: BlockedUserDto[];
}
