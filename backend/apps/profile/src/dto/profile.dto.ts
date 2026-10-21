import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, IsUUID } from 'class-validator';

export class InterestTagDto
{
	@ApiProperty({ example: 'a1b2c3d4-...', description: 'Tag UUID' })
	@IsUUID()
	id: string;

	@ApiProperty({ example: 'vegan', description: 'Tag name without leading #' })
	@IsString()
	name: string;
}

export class UserPictureDto
{
	@ApiProperty({ example: 'a1b2c3d4-...', description: 'Picture UUID' })
	@IsUUID()
	id: string;

	@ApiProperty({ example: 'https://example.com/pic.jpg', description: 'Picture URL' })
	@IsString()
	url: string;

	@ApiProperty({ example: true, description: 'Whether this is the profile picture' })
	@IsBoolean()
	isProfile: boolean;
}

export class FullProfileDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'User UUID' })
	@IsUUID()
	userId: string;

	@ApiProperty({ example: 'alice', description: 'Username' })
	@IsString()
	username: string;

	@ApiProperty({ example: 'Alice', description: 'First name', nullable: true })
	firstName: string | null;

	@ApiProperty({ example: 'Wonderland', description: 'Last name', nullable: true })
	lastName: string | null;

	@ApiProperty({ example: 'female', enum: ['male', 'female', 'other'], nullable: true })
	gender: string | null;

	@ApiProperty({ example: 'both', enum: ['male', 'female', 'both', 'other'], nullable: true })
	sexualPreference: string | null;

	@ApiProperty({ example: 'Curiouser and curiouser.', nullable: true })
	biography: string | null;

	@ApiProperty({ type: [InterestTagDto] })
	interests: InterestTagDto[];

	@ApiProperty({ type: [UserPictureDto] })
	pictures: UserPictureDto[];

	@ApiProperty({ example: '2026-09-30T08:45:31.644Z', nullable: true, description: 'When the user was last online; null if they have never connected' })
	lastSeen: Date | null;

	// On the shared base, so it is returned for your OWN profile as well as for other users:
	// the rating is public, and a user is entitled to see their own number. Already an integer
	// in 0..100, so the frontend can render it verbatim without rounding or clamping.
	@ApiProperty({ example: 55, minimum: 0, maximum: 100, description: 'Public fame rating: the share of this profile\'s viewers who liked it, adjusted for reports, blocks and profile completeness' })
	fameRating: number;

	// Everyone sees the age; only the owner sees the exact date (OwnProfileDto below).
	@ApiProperty({ example: 28, nullable: true, description: 'Age in years, computed by the database from the date of birth; null if not set yet' })
	age: number | null;

	@ApiProperty({ example: '2026-09-30T08:45:31.644Z' })
	createdAt: Date;

	@ApiProperty({ example: '2026-09-30T08:45:31.644Z' })
	updatedAt: Date;
}

// Coordinates deliberately live HERE and not on FullProfileDto, so they can only ever be part
// of a response describing the caller's OWN profile. Another user's profile reports a distance
// instead (see GetProfileResponseDto): exact coordinates would let anyone read a home address.
export class OwnProfileDto extends FullProfileDto
{
	@ApiProperty({ example: 41.905333, nullable: true, description: 'Your latitude in decimal degrees, at full precision; null if no location set' })
	latitude: number | null;

	@ApiProperty({ example: 12.542861, nullable: true, description: 'Your longitude in decimal degrees, at full precision; null if no location set' })
	longitude: number | null;

	@ApiProperty({ example: '1998-04-12', nullable: true, description: 'Your date of birth, YYYY-MM-DD; null until set (GitHub sign-ups set it once via PATCH /profile)' })
	dateOfBirth: string | null;
}
