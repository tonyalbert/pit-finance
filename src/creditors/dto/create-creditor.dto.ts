import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCreditorDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
