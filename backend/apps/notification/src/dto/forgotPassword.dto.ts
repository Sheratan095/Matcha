import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { SupportedLanguage, SupportedLanguages } from '@repo/shared-types';

export class ForgotPasswordDto
{
	@ApiProperty({ example: '4354535-6547474', description: 'Reset token' })
	@IsString()
	@IsNotEmpty()
	@Transform(({ value }) => value?.trim())
	token: string;

	@ApiProperty({ example: 'user@example.com', description: 'User email' })
	@IsEmail()
	@IsNotEmpty()
	@Transform(({ value }) => value.trim().toLowerCase())
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

export class ForgotPasswordResponseDto
{
	@ApiProperty({ example: 'ok', description: 'Result status' })
	status: string;

	@ApiProperty({ example: 'Password reset email queued', description: 'Optional message' })
	message?: string;
}

export class ErrorDto
{
	@ApiProperty({ example: 400 })
	statusCode: number;

	@ApiProperty({ example: 'INVALID_PAYLOAD' })
	code: string;

	@ApiProperty({ example: 'Invalid email or token' })
	message: string;
}