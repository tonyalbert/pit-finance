import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TagType } from '@prisma/client';

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEnum(TagType)
  type?: TagType;
}
