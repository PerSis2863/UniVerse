import { Controller, Get, Post, Body, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';

@Controller('rooms')
@UseGuards(ClerkAuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  findAll() {
    return this.roomsService.findAll();
  }

  @Get('my-bookings')
  getMyBookings(@Req() req) {
    return this.roomsService.getUserBookings(req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roomsService.findOne(id);
  }

  @Post(':id/book')
  book(@Param('id') roomId: string, @Body() data: { date: string, time: string, duration: string }, @Req() req) {
    return this.roomsService.bookRoom(req.user.userId, {
      roomId,
      date: data.date,
      time: data.time,
      duration: data.duration,
    });
  }

  @Delete('bookings/:id')
  cancelBooking(@Param('id') id: string, @Req() req) {
    return this.roomsService.cancelBooking(req.user.userId, id);
  }
}
