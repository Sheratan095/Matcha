import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class fullProfileDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'ID of the user this profile belongs to (1:1 with users.id)' })
	@IsUUID()
	userId: string;

	@ApiProperty({ example: 'Alice', description: 'First name' })
	@IsString()
	@MaxLength(50)
	firstName: string;

	@ApiProperty({ example: 'Wonderland', description: 'Last name' })
	@IsString()
	@MaxLength(50)
	lastName: string;

	@ApiProperty({ example: 'Female', description: 'Gender' })
	@IsString()
	@MaxLength(20)
	gender: string;

	@ApiProperty({ example: 'I love adventures and exploring new places.', description: 'Bio' })
	@IsString()
	@MaxLength(500)
	bio: string;

	@ApiProperty({ example: 'male', description: 'Sexual orientation' })
	@IsString()
	@MaxLength(20)
	sexualOrientation: string;

	@ApiProperty({ example: ['hiking', 'reading', 'traveling'], description: 'List of interests' })
	@IsString({ each: true })
	@MaxLength(50, { each: true })
	interests: string[];

	@ApiProperty({ example: ['https://example.com/pic1.jpg', 'https://example.com/pic2.jpg'], description: 'List of picture URLs' })
	@IsString({ each: true })
	pictures: string[];
}