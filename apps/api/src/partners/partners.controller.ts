import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PartnersService } from './partners.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('partners')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard, RolesGuard)
@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get() findAll() { return this.partnersService.findAll(); }
  @Get('partnerships') getPartnerships() { return this.partnersService.getPartnerships(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.partnersService.findOne(id); }
  
  @Post() 
  @Roles(Role.ADMIN)
  create(@Body() body: any) { return this.partnersService.create(body); }
  
  @Patch(':id') 
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() body: any) { return this.partnersService.update(id, body); }
  
  @Post('partnerships') 
  @Roles(Role.ADMIN)
  createPartnership(@Body() body: any) { return this.partnersService.createPartnership(body); }
}
