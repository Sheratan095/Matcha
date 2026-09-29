import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class IsProfileCompleteDto
{
	@ApiProperty({ example: 42, description: 'ID of the user to check profile completeness for' })
	@IsInt()
	@IsPositive()
	userId: number;
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