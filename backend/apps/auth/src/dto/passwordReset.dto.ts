import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, Length, IsString, Matches } from 'class-validator';
import { PasswordDto } from './register.dto';


// -----------------------------FORGOT PASSWORD-----------------------------

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
	@ApiProperty({ example: 'If an account with this email exists, you will receive a password reset link shortly', description: 'A success message (generic to prevent email enumeration)' })
	message: string;
}

export class ForgotPasswordErrorDto
{
	@ApiProperty({ example: 400 })
	statusCode: number;

	@ApiProperty({ example: 'USER_NOT_FOUND' })
	code: string;

	@ApiProperty({ example: 'No user found with the provided email address' })
	message: string;
}


// -----------------------------RESET PASSWORD-----------------------------

export class ResetPasswordDto extends PasswordDto
{
	@ApiProperty({ example: 'resetToken12345', description: 'The token sent to the user\'s email for password reset verification' })
	@IsString()
	@IsNotEmpty()
	@Transform(({ value }) => value?.trim())
	token: string;
}

export class ResetPasswordResponseDto
{
	@ApiProperty({ example: 'Password reset successfully', description: 'A success message' })
	message: string;
}

export class ResetPasswordErrorDto
{
	@ApiProperty({ example: 400 })
	statusCode: number;

	@ApiProperty({ example: 'INVALID_TOKEN' })
	code: string;

	@ApiProperty({ example: 'Invalid or expired reset token' })
	message: string;
}