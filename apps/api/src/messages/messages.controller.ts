import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  getMessages(@CurrentUser() user: any) {
    return this.messagesService.getMessages(user.id);
  }

  @Post()
  sendMessage(
    @CurrentUser() user: any,
    @Body() body: { receiverId: string, subject: string, body: string }
  ) {
    return this.messagesService.sendMessage(user.id, body.receiverId, body.subject, body.body);
  }

  @Post(':id/read')
  markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.messagesService.markAsRead(id, user.id);
  }
}
