import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { FullProfileDto } from './fullProfile.dto';

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

	@ApiProperty({ example: 'female', enum: ['male', 'female', 'other'], required: false })
	@IsOptional()
	@IsIn(['male', 'female', 'other'])
	gender?: string;

	@ApiProperty({ example: 'both', enum: ['male', 'female', 'both', 'other'], required: false })
	@IsOptional()
	@IsIn(['male', 'female', 'both', 'other'])
	sexualPreference?: string;

	@ApiProperty({ example: 'Curiouser and curiouser.', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(500)
	biography?: string;

	@ApiProperty({ example: ['vegan', 'geek'], description: 'Full replacement list of interest tag names', required: false })
	@IsOptional()
	@IsString({ each: true })
	@MaxLength(50, { each: true })
	interests?: string[];
}

export class UpdateProfileResponseDto extends FullProfileDto {}

export class UpdateProfileErrorDto
{
	@ApiProperty({ example: 403, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'Forbidden', description: 'Error message' })
	message: string;
}
