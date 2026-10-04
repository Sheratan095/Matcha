import { ApiProperty } from '@nestjs/swagger';
import { InterestTagDto } from './fullProfile.dto';

export class GetInterestsResponseDto
{
	@ApiProperty({ type: [InterestTagDto], description: 'All interest tags currently stored in the database' })
	interests: InterestTagDto[];
}

export class GetInterestsErrorDto
{
	@ApiProperty({ example: 500, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'Failed to fetch interests', description: 'Error message' })
	message: string;
}
