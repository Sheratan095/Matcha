import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto
{
	// The refresh token is typically handled via HTTP-only cookies, 
	// but if passed in the body for specific mobile/client cases, 
	// it would be defined here. 
	// Currently, the implementation uses cookies.
}

export class RefreshResponseDto
{
	@ApiProperty({ example: 'Tokens refreshed', description: 'A success message' })
	message: string;
}

export class RefreshErrorDto
{
	@ApiProperty({ example: 403 })
	statusCode: number;

	@ApiProperty({ example: 'Forbidden' })
	message: string;

	@ApiProperty({ example: '2026-05-18T12:34:56.789Z' })
	timestamp: string;

	@ApiProperty({ example: '/auth/refresh' })
	path: string;
}
