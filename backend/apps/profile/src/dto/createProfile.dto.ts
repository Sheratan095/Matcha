import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

// Payload the AUTH service sends (internally) right after it creates a user,
// so a matching profile row is created in the profile service's tables.
export class CreateProfileDto
{
	@ApiProperty({ example: 42, description: 'ID of the user this profile belongs to (1:1 with users.id)' })
	@IsInt()
	@IsPositive()
	userId: number;

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
}

export class CreateProfileResponseDto
{
	@ApiProperty({ example: 'Profile created', description: 'Result message' })
	message: string;

	@ApiProperty({ example: 42, description: 'ID of the user the profile was created for' })
	userId: number;
}

export class CreateProfileErrorDto
{
	@ApiProperty({ example: 409 })
	statusCode: number;

	@ApiProperty({ example: 'Profile already exists' })
	message: string;
}
