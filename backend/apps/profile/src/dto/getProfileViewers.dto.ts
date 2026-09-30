import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetProfileViewersDto
{
	// UserId is retrieved from the access token, so no need to validate it here.
}

export class GetProfileViewersResponseDto
{
	@ApiProperty({ example: ['a1b2c3d4-...', 'e5f6a7b8-...'], description: 'IDs of users who viewed this profile' })
	viewers: string[];
}

export class GetProfileViewersErrorDto
{
	@ApiProperty({ example: 403, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'Forbidden', description: 'Error message' })
	message: string;
}
