import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class IsProfileCompleteDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'ID of the user to check profile completeness for' })
	@IsUUID()
	userId: string;
}

export class IsProfileCompleteResponseDto
{
	@ApiProperty({ example: true, description: 'True if the profile is complete, false otherwise' })
	isComplete: boolean;
}

export class IsProfileCompleteErrorDto
{
	@ApiProperty({ example: 500 })
	statusCode: number;

	@ApiProperty({ example: 'Internal server error' })
	message: string;
}