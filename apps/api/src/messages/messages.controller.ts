import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('messages')
@UseGuards(FirebaseAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversations')
  getConversations(@CurrentUser() user: any) {
    return this.messagesService.getConversations(user.id);
  }

  @Get('conversations/:id')
  getMessages(@Param('id') conversationId: string, @CurrentUser() user: any) {
    return this.messagesService.getMessages(conversationId, user.id);
  }

  @Post()
  sendMessage(
    @CurrentUser() user: any,
    @Body() body: { receiverId: string, body: string }
  ) {
    return this.messagesService.sendMessage(user.id, body.receiverId, body.body);
  }

  @Post('conversations/:id/read')
  markAsRead(@Param('id') conversationId: string, @CurrentUser() user: any) {
    return this.messagesService.markAsRead(conversationId, user.id);
  }
}
