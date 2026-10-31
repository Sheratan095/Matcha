import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { SupportedLanguage, SupportedLanguages } from '@repo/shared-types';

export class EmailVerificationDto
{
	@ApiProperty({ example: '4354535-6547474', description: 'Verification token' })
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

export class EmailVerificationResponseDto
{
	@ApiProperty({ example: 'ok', description: 'Result status' })
	status: string;

	@ApiProperty({ example: 'Verification queued', description: 'Optional message' })
	message?: string;
}