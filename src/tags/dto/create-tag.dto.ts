import { IsEnum, IsString, MinLength } from 'class-validator';
import { TagType } from '@prisma/client';

export class CreateTagDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEnum(TagType)
  type: TagType;
}
