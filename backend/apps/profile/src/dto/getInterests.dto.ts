import { ApiProperty } from '@nestjs/swagger';
import { InterestTagListDto } from './interest.dto';

// The shape is just "a list of tags", so it comes from the shared interest DTO rather than being
// declared a second time here.
export class GetInterestsResponseDto extends InterestTagListDto {}
