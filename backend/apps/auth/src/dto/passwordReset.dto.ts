import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, Length, IsString } from 'class-validator';
import { PasswordDto } from './register.dto';


// -----------------------------FORGOT PASSWORD-----------------------------

export class ForgotPasswordDto
{
	@ApiProperty({ example: 'jdoe@example.com', description: 'User email' })
	@IsEmail()
	@Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) // Trim whitespace and convert to lowercase for consistency BEFORE validation
	@IsNotEmpty()
	@Length(0, 100)
	email: string;
}

export class ForgotPasswordResponseDto
{
	@ApiProperty({ example: 'If an account with this email exists, you will receive a password reset link shortly', description: 'A success message (generic to prevent email enumeration)' })
	message: string;
}

// -----------------------------RESET PASSWORD-----------------------------

export class ResetPasswordDto extends PasswordDto
{
	@ApiProperty({ example: 'resetToken12345', description: 'The token sent to the user\'s email for password reset verification' })
	@IsString()
	@IsNotEmpty()
	@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
	token: string;
}

export class ResetPasswordResponseDto
{
	@ApiProperty({ example: 'Password reset successfully', description: 'A success message' })
	message: string;
}