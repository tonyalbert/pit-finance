import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { CreateCreditorDto } from './create-creditor.dto';
import { PartialType } from '@nestjs/mapped-types';

export class UpdateCreditorDto extends PartialType(CreateCreditorDto) {}
