import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { TagType } from '@prisma/client';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateTagDto) {
    return this.prisma.tag.create({
      data: {
        name: dto.name,
        type: dto.type,
        userId,
      },
    });
  }

  findAll(userId: string, type?: TagType) {
    return this.prisma.tag.findMany({
      where: {
        userId,
        ...(type ? { type } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async update(userId: string, id: string, dto: UpdateTagDto) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, userId },
    });
    if (!tag) {
      throw new NotFoundException('Tag nao encontrada.');
    }
    return this.prisma.tag.update({
      where: { id: tag.id },
      data: dto,
    });
  }

  async remove(userId: string, id: string) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, userId },
    });
    if (!tag) {
      throw new NotFoundException('Tag nao encontrada.');
    }
    return this.prisma.tag.delete({ where: { id: tag.id } });
  }
}
