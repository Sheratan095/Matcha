import { ApiProperty } from '@nestjs/swagger';

export class GetProfileViewersDto
{
	// UserId is retrieved from the access token, so no need to validate it here.
}

export class ProfileViewerDto
{
	@ApiProperty({ example: 'a1b2c3d4-...', description: 'ID of the user who viewed this profile' })
	viewerId: string;

	@ApiProperty({ example: 'alice', description: 'Username of the viewer' })
	username: string;

	@ApiProperty({ example: 'https://.../pic.webp', description: "Viewer's profile picture URL, or null if they have none", nullable: true })
	profilePictureUrl: string | null;
}

export class GetProfileViewersResponseDto
{
	@ApiProperty({ type: [ProfileViewerDto], description: 'Users who viewed this profile' })
	viewers: ProfileViewerDto[];
}
