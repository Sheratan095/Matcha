import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { SupportedLanguage, SupportedLanguages } from '@repo/shared-types';

export class ForgotPasswordDto
{
	@ApiProperty({ example: '4354535-6547474', description: 'Reset token' })
	@IsString()
	@IsNotEmpty()
	@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
	token: string;

	@ApiProperty({ example: 'user@example.com', description: 'User email' })
	@IsEmail()
	@IsNotEmpty()
	@Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
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
// Body of internal/password-changed: no token, the email only reports that the change happened
export class PasswordChangedDto
{
	@ApiProperty({ example: 'user@example.com', description: 'User email' })
	@IsEmail()
	@IsNotEmpty()
	@Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
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
