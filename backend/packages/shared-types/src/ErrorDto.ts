import { ApiProperty } from '@nestjs/swagger';

// Standard Nest error body. ValidationPipe failures send message as an array (one entry per
// failed constraint), every other HttpException sends a single string.
export class ErrorDto
{
	@ApiProperty({ example: 404 })
	statusCode!: number;

	@ApiProperty({
		oneOf: [
			{ type: 'string' },
			{ type: 'array', items: { type: 'string' } },
		],
		example: 'Standard http error message',
	})
	message!: string | string[];

	@ApiProperty({ example: 'Not Found', description: 'HTTP status text' })
	error!: string;
}
