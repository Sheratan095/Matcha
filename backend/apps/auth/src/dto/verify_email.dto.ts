import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto
{
	@ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'Email verification token' })
	@IsString()
	@IsNotEmpty()
	token: string;
}

export class VerifyEmailResponseDto
{
	@ApiProperty({ example: 'Email verified successfully' })
	message: string;

	@ApiProperty({ example: null, description: 'Optional additional info (cookies set via httpOnly)' })
	data?: any;
}

export class VerifyEmailErrorDto
{
	@ApiProperty({ example: 400 })
	statusCode: number;

	@ApiProperty({ example: 'INVALID_TOKEN' })
	code: string;

	@ApiProperty({ example: 'Invalid or expired verification token' })
	message: string;
}