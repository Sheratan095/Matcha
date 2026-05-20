import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SupportedLanguage, SupportedLanguages } from '@repo/shared-types';

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

	@ApiProperty({
		example: SupportedLanguages.ENGLISH,
		description: 'Preferred language for the email (optional)',
		enum: SupportedLanguages,
	})
	@IsOptional()
	@IsEnum(SupportedLanguages)
	language?: SupportedLanguage;
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
