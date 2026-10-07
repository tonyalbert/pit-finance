import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './admin.service';
import {
  AdminSetPasswordDto,
  ExtendTrialDto,
  ListUsersDto,
  UpdateAccessDto,
} from './dto/admin-users.dto';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/users')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  list(@Query() query: ListUsersDto) {
    return this.admin.listUsers(query.search);
  }

  @Patch(':id/password')
  setPassword(@Param('id') id: string, @Body() dto: AdminSetPasswordDto) {
    return this.admin.setPassword(id, dto.password);
  }

  @Post(':id/trial')
  extendTrial(@Param('id') id: string, @Body() dto: ExtendTrialDto) {
    return this.admin.extendTrial(id, dto.days);
  }

  @Patch(':id/access')
  updateAccess(@Param('id') id: string, @Body() dto: UpdateAccessDto) {
    return this.admin.updateAccess(id, dto);
  }
}
