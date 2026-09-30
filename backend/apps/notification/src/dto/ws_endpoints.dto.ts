import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class CloseWsConnectionsDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'User ID for which to close WebSocket connections' })
	@IsUUID()
	@IsNotEmpty()
	@Transform(({ value }) => value?.trim())
	userId: string;
}
