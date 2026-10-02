import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { UserPictureDto } from './fullProfile.dto';

export class PictureIdParamDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'Picture UUID' })
	@IsUUID()
	pictureId: string;
}

// Only used to describe the multipart body in Swagger; the file itself arrives through @UploadedFile().
export class UploadPictureDto
{
	@ApiProperty({ type: 'string', format: 'binary', description: 'JPEG, PNG or WEBP image, max 5 MB' })
	file: any;
}

export class PicturesResponseDto
{
	@ApiProperty({ type: [UserPictureDto], description: 'All pictures of the user after the operation' })
	pictures: UserPictureDto[];
}

export class PictureErrorDto
{
	@ApiProperty({ example: 404, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'Picture not found', description: 'Error message' })
	message: string;
}
