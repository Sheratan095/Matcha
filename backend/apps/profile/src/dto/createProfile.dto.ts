import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

// Payload the AUTH service sends (internally) right after it creates a user,
// so a matching profile row is created in the profile service's tables.
export class CreateProfileDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'ID of the user this profile belongs to (1:1 with users.id)' })
	@IsUUID()
	userId: string;

	@ApiProperty({ example: 'Alice', description: 'First name (optional at creation)', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(50)
	@Transform(({ value }) => value?.trim())
	firstName?: string;

	@ApiProperty({ example: 'Wonderland', description: 'Last name (optional at creation)', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(50)
	@Transform(({ value }) => value?.trim())
	lastName?: string;

	// Only the FORMAT is checked here. Whether it is a real date and makes the user 18+ is
	// enforced by the database (CHECK on the age the profiles_set_age trigger computes).
	// Optional because GitHub OAuth sign-ups have no date of birth at creation.
	@ApiProperty({ example: '1998-04-12', description: 'Date of birth, YYYY-MM-DD (optional at creation: OAuth sign-ups set it later)', required: false })
	@IsOptional()
	@Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be a date in YYYY-MM-DD format' })
	dateOfBirth?: string;
}

export class CreateProfileResponseDto
{
	@ApiProperty({ example: 'Profile created', description: 'Result message' })
	message: string;

	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'ID of the user the profile was created for' })
	userId: string;
}
