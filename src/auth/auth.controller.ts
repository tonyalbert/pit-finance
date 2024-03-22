import { Controller, Post, Body, UseGuards, Request, Get } from '@nestjs/common';
import { SingInDto } from './dto/sign-in.dto';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Post('signin')
    async signin(@Body() signindto: SingInDto) {
        return await this.authService.signin(signindto);
    }

    @UseGuards(AuthGuard)
    @Get('profile')
    getProfile(@Request() req) {
      return req.user;
    }
}
