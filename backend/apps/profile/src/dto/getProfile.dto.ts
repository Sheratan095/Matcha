import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { fullProfileDto } from './fullProfile.dto';

// Payload the AUTH service sends (internally) right after it creates a user,
// so a matching profile row is created in the profile service's tables.
export class GetProfileDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'ID of the requested user' })
	@IsUUID()
	userId: string;
}

export class GetProfileResponseDto extends fullProfileDto
{
}

export class GetProfileErrorDto
{
	@ApiProperty({ example: 409, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'Profile not found', description: 'Error message' })
	message: string;
}
