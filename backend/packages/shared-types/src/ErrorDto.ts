import { ApiProperty } from '@nestjs/swagger';

export class ErrorDto
{
	@ApiProperty({ example: 404 })
	statusCode!: number;

	@ApiProperty({ example: 'Standard http error message' })
	message!: string;
}
