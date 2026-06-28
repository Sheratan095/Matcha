import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { SupportedLanguage, SupportedLanguages } from '@repo/shared-types';

// Dto (Data Transfer Object) is just a data structure for input validation and API documentation.
// It doesn't contain any logic or methods, just properties with decorators for validation and Swagger docs.
// Here the Dtos are grouped by endpoint (register, login, refresh) for better organization and clarity in the codebase and API docs.

//Single object used to centralize psq validation
export class PasswordDto
{
	@ApiProperty({ example: 'P@ssw0rd', description: 'User password' })
	@IsString()
	@IsNotEmpty()
	@Length(8, 128)
	@Matches(/^(?!\s*$).+$/) // Ensure password is not just whitespace
	password: string;
}

export class RegisterDto extends PasswordDto
{
	@ApiProperty({ example: 'jdoe', description: 'Unique username' })
	@IsString()
	@Transform(({ value }) => value.trim().toLowerCase()) // Trim whitespace and convert to lowercase for consistency BEFORE validation
	@IsNotEmpty()
	@Length(3, 20)
	@Matches(/^[a-z0-9_.]+$/)
	username: string;

	@ApiProperty({ example: 'jdoe@example.com', description: 'User email' })
	@IsEmail()
	@Transform(({ value }) => value.trim().toLowerCase()) // Trim whitespace and convert to lowercase for consistency BEFORE validation
	@IsNotEmpty()
	@Length(0, 100)
	email: string;

	@ApiProperty({ example: 'John', description: 'First name' })
	@Transform(({ value }) => value.trim()) // Not lowercasing first name, just trimming whitespace BEFORE validation
	@IsNotEmpty()
	@IsString()
	@Length(1, 50)
	@Matches(/^[a-zA-Z]+$/) // Ensure first name is just letters
	firstName?: string;

	@ApiProperty({ example: 'Doe', description: 'Last name' })
	@Transform(({ value }) => value.trim()) // Not lowercasing last name, just trimming whitespace BEFORE validation
	@IsNotEmpty()
	@IsString()
	@Length(1, 50)
	@Matches(/^[a-zA-Z]+$/) // Ensure last name is just letters
	lastName?: string;

	@ApiProperty({
		example: SupportedLanguages.ENGLISH,
		description: 'Preferred language (optional, default: en)',
		enum: SupportedLanguages, // Check that the value is one of GLOBALLY the supported languages
	})
	@IsOptional()
	@IsEnum(SupportedLanguages)
	language?: SupportedLanguage = SupportedLanguages.ENGLISH;
}

export class RegisterResponseDto
{
	@ApiProperty({ example: 'Email verification required' })
	message: string;

	@ApiProperty({ example: null, description: 'Optional additional info (cookies set via httpOnly)' })
	data?: any;

	@ApiProperty( { example: '123e4567-e89b-12d3-a456-426614174000', description: 'User ID' })
	userId?: string;

	@ApiProperty({ example: '2026-05-21T12:34:56.789Z', description: 'Timestamp of registration' })
	date?: Date;
}

export class RegisterErrorDto
{
	@ApiProperty({ example: 409 })
	statusCode: number;

	@ApiProperty({ example: 'USER_ALREADY_EXISTS' })
	code: string;

	@ApiProperty({ example: 'User/Email already exists' })
	message: string;
}