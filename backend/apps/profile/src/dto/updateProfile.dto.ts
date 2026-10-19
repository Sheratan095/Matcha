import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { OwnProfileDto } from './profile.dto';

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

	@ApiProperty({ example: ['vegan', 'geek'], description: 'Full replacement list of interest tag names', required: false })
	@IsOptional()
	// Transform the interests array to remove leading '#' characters and trim whitespace
	@Transform(({ value }) => Array.isArray(value)
		? value.map((tag) => typeof tag === 'string' ? tag.trim().replace(/^#+/, '').trim() : tag) : value)
	@IsString({ each: true })
	@MaxLength(50, { each: true })
	interests?: string[];
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
