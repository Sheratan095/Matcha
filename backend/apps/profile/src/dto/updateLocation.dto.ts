import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, Max } from 'class-validator';

export class UpdateLocationDto
{
	@ApiProperty({ example: 45.4642, description: 'Latitude in decimal degrees' })
	@IsNumber()
	@Min(-90)
	@Max(90)
	latitude: number;

	@ApiProperty({ example: 9.19, description: 'Longitude in decimal degrees' })
	@IsNumber()
	@Min(-180)
	@Max(180)
	longitude: number;
}

export class UpdateLocationResponseDto
{
	@ApiProperty({ example: true, description: 'Whether the location was updated' })
	updated: boolean;
}

export class UpdateLocationErrorDto
{
	@ApiProperty({ example: 404, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'Profile not found', description: 'Error message' })
	message: string;
}
