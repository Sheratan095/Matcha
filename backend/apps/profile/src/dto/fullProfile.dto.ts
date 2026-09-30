import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsString, IsUUID, Max, Min } from 'class-validator';

export class InterestTagDto
{
	@ApiProperty({ example: 'a1b2c3d4-...', description: 'Tag UUID' })
	@IsUUID()
	id: string;

	@ApiProperty({ example: 'vegan', description: 'Tag name without leading #' })
	@IsString()
	name: string;
}

export class UserPictureDto
{
	@ApiProperty({ example: 'a1b2c3d4-...', description: 'Picture UUID' })
	@IsUUID()
	id: string;

	@ApiProperty({ example: 'https://example.com/pic.jpg', description: 'Picture URL' })
	@IsString()
	url: string;

	@ApiProperty({ example: true, description: 'Whether this is the profile picture' })
	@IsBoolean()
	isProfile: boolean;
}

export class FullProfileDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'User UUID' })
	@IsUUID()
	userId: string;

	@ApiProperty({ example: 'Alice', description: 'First name', nullable: true })
	firstName: string | null;

	@ApiProperty({ example: 'Wonderland', description: 'Last name', nullable: true })
	lastName: string | null;

	@ApiProperty({ example: 'female', enum: ['male', 'female', 'other'], nullable: true })
	gender: string | null;

	@ApiProperty({ example: 'both', enum: ['male', 'female', 'both', 'other'], nullable: true })
	sexualPreference: string | null;

	@ApiProperty({ example: 'Curiouser and curiouser.', nullable: true })
	biography: string | null;

	@ApiProperty({ type: [InterestTagDto] })
	interests: InterestTagDto[];

	@ApiProperty({ type: [UserPictureDto] })
	pictures: UserPictureDto[];

	@ApiProperty({ example: '2026-09-30T08:45:31.644Z' })
	createdAt: Date;

	@ApiProperty({ example: '2026-09-30T08:45:31.644Z' })
	updatedAt: Date;
}
