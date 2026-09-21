import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PartnersService } from './partners.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('partners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get() findAll() { return this.partnersService.findAll(); }
  @Get('partnerships') getPartnerships() { return this.partnersService.getPartnerships(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.partnersService.findOne(id); }
  @Post() create(@Body() body: any) { return this.partnersService.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any) { return this.partnersService.update(id, body); }
  @Post('partnerships') createPartnership(@Body() body: any) { return this.partnersService.createPartnership(body); }
}
