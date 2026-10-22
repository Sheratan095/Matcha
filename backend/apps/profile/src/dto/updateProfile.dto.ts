import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { OwnProfileDto } from './profile.dto';
import { InterestNamesProperty } from './interest.dto';

export class UpdateProfileDto
{
	@ApiProperty({ example: 'Alice', description: 'First name', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(50)
	@Transform(({ value }) => value?.trim())
	firstName?: string;

	@ApiProperty({ example: 'Wonderland', description: 'Last name', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(50)
	@Transform(({ value }) => value?.trim())
	lastName?: string;

	// Not need to trim because it's an enum
	@ApiProperty({ example: 'female', enum: ['male', 'female', 'other'], required: false })
	@IsOptional()
	@IsIn(['male', 'female', 'other'])
	gender?: string;

	// Not need to trim because it's an enum
	@ApiProperty({ example: 'both', enum: ['male', 'female', 'both', 'other'], required: false })
	@IsOptional()
	@IsIn(['male', 'female', 'both', 'other'])
	sexualPreference?: string;

	@ApiProperty({ example: 'Curiouser and curiouser.', required: false })
	@IsOptional()
	@Transform(({ value }) => value?.trim())
	@IsString()
	@MaxLength(500)
	biography?: string;

	// NAMES, not { id, name }: a tag the user has just typed has no id yet — the database mints it
	// on upsert. Validation, normalisation and the Swagger docs all come from the shared decorator,
	// so this list and the one GET /profile/discover filters on obey identical rules.
	@InterestNamesProperty()
	interests?: string[];

	// SET-ONCE: accepted only while the profile has no date of birth yet (GitHub OAuth sign-ups,
	// which register without one); afterwards 409. Only the format is checked here — the 18+
	// rule is enforced by the database (profiles_age_check).
	@ApiProperty({ example: '1998-04-12', description: 'Date of birth, YYYY-MM-DD. Can be set only once; 409 if already set.', required: false })
	@IsOptional()
	@Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be a date in YYYY-MM-DD format' })
	dateOfBirth?: string;
}

// OwnProfileDto: this endpoint only ever returns the caller's own profile, so it carries
// full-precision coordinates (unlike another user's profile, which reports a distance).
export class UpdateProfileResponseDto extends OwnProfileDto {}

export class UpdateProfileErrorDto
{
	@ApiProperty({ example: 403, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'Forbidden', description: 'Error message' })
	message: string;
}
