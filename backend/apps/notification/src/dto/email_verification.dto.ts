import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class EmailVerificationDto
{
	@ApiProperty({ example: '4354535-6547474', description: 'Verification token' })
	@IsString()
	@IsNotEmpty()
	token: string;

	@ApiProperty({ example: 'user@example.com', description: 'User email' })
	@IsEmail()
	@IsNotEmpty()
	email: string;
}

export class EmailVerificationResponseDto
{
	@ApiProperty({ example: 'ok', description: 'Result status' })
	status: string;

	@ApiProperty({ example: 'Verification queued', description: 'Optional message' })
	message?: string;
}

export class ErrorDto
{
	@ApiProperty({ example: 400 })
	statusCode: number;

	@ApiProperty({ example: 'INVALID_PAYLOAD' })
	error: string;

	@ApiProperty({ example: 'Invalid email or token' })
	message: string;
}
