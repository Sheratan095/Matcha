import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { singleLine } from '@repo/utils';

// Body of POST /:userId/report. The reported user id travels in the path, so only the
// optional reason lives here.
export class ReportUserDto
{
	// Free text that a moderator will read, so it is one clean line: no control or invisible
	// characters, no line breaks to fake a second "field" in a report listing.
	@ApiPropertyOptional({ example:'Scammer', description: 'Optional reason for reporting the user' })
	@IsOptional()
	@Transform(({ value }) => singleLine(value))
	@IsString()
	@Length(0, 128, { message: 'Reason must be at most 128 characters' })
	reason?: string;
}

// Not reply on successful report, just 204 no content. Do no response dto is needed.
//	It's done to avoid spamming the report button, and to avoid revealing whether the user exists or not.

// export class ReportUserResponseDto
// {

// }

