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

// Not reply on successful report, just 204 no content. Do no response dto is needed.
//	It's done to avoid spamming the report button, and to avoid revealing whether the user exists or not.

// export class ReportUserResponseDto
// {

// }

