import { HttpException, HttpStatus, Injectable, UseGuards } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from 'src/users/users.service';
import { SingInDto } from './dto/sign-in.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
    constructor(private usersService: UsersService, private jwtService: JwtService) {}

    async signin(signindto: SingInDto) {

        if (!signindto.email || !signindto.password) {
            throw new HttpException('All fields are required', HttpStatus.BAD_REQUEST);
        }

        const user = await this.usersService.findByEmail(signindto.email);

        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        const isMatch = await bcrypt.compare(signindto.password, user.password);

        if (!isMatch) {
            throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
        }

        const payload = { sub: user.id, name: user.name, email: user.email };

        return {
            access_token: await this.jwtService.signAsync(payload),
        };
    }

}
