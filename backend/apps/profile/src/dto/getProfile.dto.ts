import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { FullProfileDto } from './fullProfile.dto';

export class GetProfileDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'ID of the requested user' })
	@IsUUID()
	userId: string;
}

export class GetProfileResponseDto extends FullProfileDto
{
}

export class GetProfileErrorDto
{
	@ApiProperty({ example: 409, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'Profile not found', description: 'Error message' })
	message: string;
}

// --------------------------------------------------------------------------------------


export class GetMyProfileDto
{
	// This DTO is intentionally left empty as it serves as a placeholder for the "Get My Profile" request.
	// So the id is inferred from the authenticated user context, and no additional parameters are needed.
}

export class GetMyProfileResponseDto extends FullProfileDto
{
}

export class GetMyProfileErrorDto extends GetProfileErrorDto
{
}