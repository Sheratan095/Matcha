import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class ChangeEmailDto
{
	// User id is extracted from JWT
	// @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'User ID' })
	// @IsString()
	// @IsNotEmpty()
	// userId: string;

	@ApiProperty({ example: 'jdoe@example.com', description: 'New email address' })
	@IsEmail()
	@Transform(({ value }) => value.trim().toLowerCase()) // Trim whitespace and convert to lowercase for consistency BEFORE validation
	@IsNotEmpty()
	@Length(0, 100)
	newEmail: string;
}

export class ChangeEmailResponseDto
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

export class ChangeEmailErrorDto
{
	@ApiProperty({ example: 409 })
	statusCode: number;

	@ApiProperty({ example: 'EMAIL_ALREADY_EXISTS' })
	code: string;

	@ApiProperty({ example: 'Email already exists' })
	message: string;
}