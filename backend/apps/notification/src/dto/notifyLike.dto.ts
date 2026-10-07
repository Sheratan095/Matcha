import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

// One trigger DTO per notification type. Producers POST these to the internal /notify/* routes;
// the app.service turns them into the payload emitted over the socket. Add a new DTO per type.

export class ProfileLikeNotifyDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'User who has been liked' })
	@IsUUID()
	@IsNotEmpty()
	@Transform(({ value }) => value?.trim())
	likedId: string;

	@ApiProperty({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', description: 'User who liked the profile' })
	@IsUUID()
	@IsNotEmpty()
	@Transform(({ value }) => value?.trim())
	likerId: string;

	@ApiProperty({example: 'true', description: 'Are the users matched? (true if the liker has also liked the liked user)'})
	@IsBoolean()
	@IsNotEmpty()
	matched: boolean;
}

export class ProfileLikeNotifyResponseDto
{
	@ApiProperty({ example: true, description: 'True if delivered to a live socket, false if queued for the offline user' })
	delivered: boolean;
}
