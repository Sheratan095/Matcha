import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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
}

export class CreateProfileResponseDto
{
	@ApiProperty({ example: 'Profile created', description: 'Result message' })
	message: string;

	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'ID of the user the profile was created for' })
	userId: string;
}

export class CreateProfileErrorDto
{
	@ApiProperty({ example: 409 })
	statusCode: number;

	@ApiProperty({ example: 'Profile already exists' })
	message: string;
}
