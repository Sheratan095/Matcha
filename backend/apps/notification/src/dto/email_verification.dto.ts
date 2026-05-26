import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { SupportedLanguage, SupportedLanguages } from '@repo/shared-types';

export class EmailVerificationDto
{
	@ApiProperty({ example: '4354535-6547474', description: 'Verification token' })
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
	code: string;

	@ApiProperty({ example: 'Invalid email or token' })
	message: string;
}
