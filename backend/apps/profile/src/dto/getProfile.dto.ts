import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional } from 'class-validator';
import { FullProfileDto, OwnProfileDto } from './profile.dto';

export class GetProfileDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'ID of the requested user' })
	@IsUUID()
	userId: string;
}

export class ProfileRelationDto
{
	@ApiProperty({ example: true, description: 'The logged-in user has liked this profile' })
	liked: boolean;

	@ApiProperty({ example: false, description: 'This profile has liked the logged-in user' })
	likesYou: boolean;

	@ApiProperty({ example: false, description: 'Mutual like: the two users are matched' })
	matched: boolean;
}

export class GetProfileResponseDto extends FullProfileDto
{
	@ApiProperty({ example: true, description: 'Whether this user is currently online' })
	isOnline: boolean;

	@ApiProperty({ type: ProfileRelationDto, description: 'Like/match relation between the logged-in user and this profile' })
	@IsOptional()
	relation: ProfileRelationDto;

	// Replaces the coordinates another user's profile used to carry. Computed from a position
	// snapped to a ~1 km grid, so probing it from several places cannot narrow this user down
	// past that cell (see snap_coord in 002_create_profiles.sql).
	@ApiProperty({ example: 5, nullable: true, minimum: 1, description: 'Whole kilometres between you and this user, never less than 1; null if either of you has no location set' })
	distanceKm: number | null;
}

// --------------------------------------------------------------------------------------


export class GetMyProfileDto
{
	// This DTO is intentionally left empty as it serves as a placeholder for the "Get My Profile" request.
	// So the id is inferred from the authenticated user context, and no additional parameters are needed.
}

// Your own profile is the one place full-precision coordinates are returned: it is your data,
// and the frontend needs them to drop your pin on the map.
export class GetMyProfileResponseDto extends OwnProfileDto
{
}
