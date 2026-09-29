import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { SupportedLanguage, SupportedLanguages } from '@repo/shared-types';

export class CloseWsConnectionsDto
{
	@ApiProperty({ example: '123456', description: 'User ID for which to close WebSocket connections' })
	@IsString()
	@IsNotEmpty()
	@Transform(({ value }) => value?.trim())
	userId: string;
}
