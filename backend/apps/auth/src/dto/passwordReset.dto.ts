import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, Length, IsString, Matches } from 'class-validator';


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

	@ApiProperty({ example: 'No user found with the provided email address' })
	message: string;
}


// -----------------------------RESET PASSWORD-----------------------------

export class ResetPasswordDto
{
	@ApiProperty({ example: 'newP@ssw0rd', description: 'User password' })
	@IsString()
	@IsNotEmpty()
	@Length(8, 128)
	@Matches(/^(?!\s*$).+$/) // Ensure password is not just whitespace
	password: string;

	@ApiProperty({ example: 'resetToken12345', description: 'The token sent to the user\'s email for password reset verification' })
	@IsNotEmpty()
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

	@ApiProperty({ example: 'Invalid or expired reset token' })
	message: string;
}