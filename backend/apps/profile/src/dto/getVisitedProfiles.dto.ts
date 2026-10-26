import { ApiProperty } from '@nestjs/swagger';

export class VisitedProfileDto
{
	@ApiProperty({ example: 'a1b2c3d4-...', description: 'ID of the user whose profile was visited' })
	userId: string;

	@ApiProperty({ example: 'alice', description: 'Username of the visited user' })
	username: string;

	@ApiProperty({ example: 'https://.../pic.webp', description: "Visited user's profile picture URL, or null if they have none", nullable: true })
	profilePictureUrl: string | null;
}

export class GetVisitedProfilesResponseDto
{
	@ApiProperty({ type: [VisitedProfileDto], description: 'Profiles the authenticated user has viewed, most recent visit first' })
	visited: VisitedProfileDto[];
}
