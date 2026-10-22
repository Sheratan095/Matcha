import { ApiProperty } from '@nestjs/swagger';
import { InterestTagListDto } from './interest.dto';

// The shape is just "a list of tags", so it comes from the shared interest DTO rather than being
// declared a second time here.
export class GetInterestsResponseDto extends InterestTagListDto {}

export class GetInterestsErrorDto
{
	@ApiProperty({ example: 500, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'Failed to fetch interests', description: 'Error message' })
	message: string;
}
