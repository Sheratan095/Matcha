import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto
{
	@ApiProperty({ example: 'jdoe', description: 'Username' })
	@IsString()
	@IsNotEmpty()
	username: string;

	@ApiProperty({ example: 'P@ssw0rd', description: 'User password' })
	@IsString()
	@IsNotEmpty()
	password: string;
}

export class LoginResponseDto
{
	@ApiProperty({ example: 'Logged in successfully', description: 'A success message' })
	message: string;

	@ApiProperty({ example: null, description: 'Optional additional info (cookies set via httpOnly)' })
	data?: any;

	@ApiProperty( { example: '123e4567-e89b-12d3-a456-426614174000', description: 'User ID' })
	userId?: string;
}

export class LoginErrorDto
{
	@ApiProperty({ example: 401 })
	statusCode: number;

	@ApiProperty({ example: 'INVALID_CREDENTIALS' })
	code: string;

	@ApiProperty({ example: 'Invalid username or password' })
	message: string;

	@ApiProperty({ example: '2026-05-18T12:34:56.789Z' })
	timestamp: string;

	@ApiProperty({ example: '/auth/login' })
	path: string;
}
