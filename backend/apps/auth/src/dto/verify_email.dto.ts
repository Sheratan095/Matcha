import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class VerifyEmailDto
{
	@ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'Email verification token' })
	@IsString()
	@IsNotEmpty()
	@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
	token: string;
}

export class VerifyEmailResponseDto
{
	@ApiProperty({ example: 'Email verified successfully' })
	message: string;

	@ApiProperty({ example: null, description: 'Optional additional info (cookies set via httpOnly)' })
	data?: any;

	@ApiProperty( { example: '123e4567-e89b-12d3-a456-426614174000', description: 'User ID' })
	userId?: string;
}
