import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, Length,  } from 'class-validator';

export class ForgotPasswordDto
{
	@ApiProperty({ example: 'jdoe@example.com', description: 'User email' })
	@IsEmail()
	@Transform(({ value }) => value.trim().toLowerCase()) // Trim whitespace and convert to lowercase for consistency BEFORE validation
	@IsNotEmpty()
	@Length(0, 100)
	email: string;
}

export class ForgotPasswordResponseDto
{
	@ApiProperty({ example: 'Forgot password process initiated', description: 'A success message' })
	message: string;
}

export class ForgotPasswordErrorDto
{
	@ApiProperty({ example: 400 })
	statusCode: number;

	@ApiProperty({ example: 'No user found with the provided email address' })
	message: string;
}