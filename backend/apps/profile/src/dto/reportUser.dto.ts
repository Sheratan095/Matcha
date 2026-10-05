import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

// Body of POST /:userId/report. The reported user id travels in the path, so only the
// optional reason lives here.
export class ReportUserDto
{
	@ApiPropertyOptional({ example:'Scammer', description: 'Optional reason for reporting the user' })
	@IsOptional()
	@IsString()
	@Length(0, 128, { message: 'Reason must be at most 128 characters' })
	reason?: string;
}

export class ReportUserResponseDto
{

}

export class ReportUserErrorDto
{
	@ApiProperty({ example: 400, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'You cannot report yourself', description: 'Error message' })
	message: string;
}
