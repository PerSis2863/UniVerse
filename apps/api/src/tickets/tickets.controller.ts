import { Controller, Get, Post, Body, Patch, Param, UseGuards, Req } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('tickets')
@UseGuards(ClerkAuthGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  create(@Req() req: RequestWithUser, @Body() createTicketDto: CreateTicketDto) {
    return this.ticketsService.create(req.user.id, createTicketDto);
  }

  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.ticketsService.findAll(req.user.id);
  }
}
