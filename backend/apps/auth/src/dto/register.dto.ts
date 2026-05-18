import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

// Dto (Data Transfer Object) is just a data structure for input validation and API documentation.
// It doesn't contain any logic or methods, just properties with decorators for validation and Swagger docs.
// Here the Dtos are grouped by endpoint (register, login, refresh) for better organization and clarity in the codebase and API docs.

export class RegisterDto
{
	@ApiProperty({ example: 'jdoe', description: 'Unique username' })
	@IsString()
	@IsNotEmpty()
	username: string;

	@ApiProperty({ example: 'P@ssw0rd', description: 'User password' })
	@IsString()
	@IsNotEmpty()
	password: string;

	@ApiProperty({ example: 'jdoe@example.com', description: 'User email' })
	@IsEmail()
	@IsNotEmpty()
	email: string;
}

export class RegisterResponseDto
{
	@ApiProperty({ example: 'User registered successfully' })
	message: string;

	@ApiProperty({ example: null, description: 'Optional additional info (cookies set via httpOnly)' })
	data?: any;

	@ApiProperty( { example: '123e4567-e89b-12d3-a456-426614174000', description: 'User ID' })
	userId?: string;
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