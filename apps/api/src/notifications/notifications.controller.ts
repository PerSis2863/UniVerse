import { Controller, Post, Body, UseGuards, Delete, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PushService } from './push.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly pushService: PushService) {}

  @Post('subscribe')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Subscribe to push notifications' })
  async subscribe(
    @CurrentUser() user: any,
    @Body() body: { subscription: { endpoint: string; keys: { p256dh: string; auth: string } } },
  ) {
    await this.pushService.subscribe(user.id, body.subscription);
    return { success: true, message: 'Subscribed to push notifications' };
  }

  @Post('unsubscribe')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unsubscribe from push notifications' })
  async unsubscribe(@Body() body: { endpoint: string }) {
    await this.pushService.unsubscribe(body.endpoint);
    return { success: true, message: 'Unsubscribed from push notifications' };
  }

  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Get VAPID public key for push subscription' })
  getVapidPublicKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY || '' };
  }
}
