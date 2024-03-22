import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {

  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<any> {

    if (!createUserDto.name || !createUserDto.email || !createUserDto.password) {
      throw new HttpException('All fields are required', HttpStatus.BAD_REQUEST);
    }

    const emailExists = await this.prisma.user.findUnique({ where: { email: createUserDto.email } });

    if (emailExists) {
      throw new HttpException('Email already exists', HttpStatus.BAD_REQUEST);
    }

    const salt = await bcrypt.genSalt();

    createUserDto.password = await bcrypt.hash(createUserDto.password, salt);

    const user = await this.prisma.user.create({ 
      data: createUserDto,
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    if (!user) {
      throw new HttpException('User not created', HttpStatus.BAD_REQUEST);
    }

    return user;
  }

  async findAll() {
    return await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        Transaction: true,
        Accounts: true
      }
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { 
        id
      },
      select: {
        id: true,
        name: true,
        email: true,
        Transaction: true,
        Accounts: true
      }
    })

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return user;
  }

  async findByEmail(email: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {

    if (updateUserDto.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: updateUserDto.email } });
      
      if (emailExists && emailExists.id !== id) {
        throw new HttpException('Email already exists', HttpStatus.BAD_REQUEST);
      }
    }

    if (updateUserDto.password) {
      const salt = await bcrypt.genSalt();
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, salt);
    }

    return await this.prisma.user.update({ where: { id }, data: updateUserDto });
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    return user;
  }
}
