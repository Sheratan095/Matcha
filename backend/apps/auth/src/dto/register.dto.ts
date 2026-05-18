import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

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