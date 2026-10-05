import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class IsOnlineDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'ID of the requested user' })
	@IsUUID()
	userId: string;
}

export class IsOnlineResponseDto
{
	@ApiProperty({ example: 'true', description: 'Result status' })
	isOnline: boolean;

	@ApiProperty({ example: 'User is online', description: 'Optional message' })
	message?: string;
}

export class ErrorDto
{
	@ApiProperty({ example: 404 })
	statusCode: number;

	@ApiProperty({ example: 'USER_NOT_FOUND' })
	code: string;

	@ApiProperty({ example: 'User not found' })
	message: string;
}
