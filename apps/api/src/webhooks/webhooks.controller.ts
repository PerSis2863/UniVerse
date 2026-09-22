import { Controller, Post, Req, Headers, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { Webhook } from 'svix';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Controller('webhooks')
export class WebhooksController {
  constructor(private prisma: PrismaService) {}

  @Post('clerk')
  async handleClerkWebhook(@Req() req: Request, @Headers() headers: any) {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
    if (!WEBHOOK_SECRET) {
      throw new BadRequestException('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env');
    }

    const svix_id = headers['svix-id'];
    const svix_timestamp = headers['svix-timestamp'];
    const svix_signature = headers['svix-signature'];

    if (!svix_id || !svix_timestamp || !svix_signature) {
      throw new BadRequestException('Error occured -- no svix headers');
    }

    const payload = (req as any).rawBody || JSON.stringify(req.body);
    let evt: any;

    try {
      const wh = new Webhook(WEBHOOK_SECRET);
      evt = wh.verify(payload, {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature,
      });
    } catch (err) {
      console.error('Error verifying webhook:', err.message);
      throw new BadRequestException('Error occured');
    }

    const { id } = evt.data;
    const eventType = evt.type;
    console.log(`Webhook with an ID of ${id} and type of ${eventType}`);
    
    if (eventType === 'user.created') {
      const email = evt.data.email_addresses[0]?.email_address;
      const firstName = evt.data.first_name || '';
      const lastName = evt.data.last_name || '';
      const name = `${firstName} ${lastName}`.trim() || email;
      
      // Check if user has a pending invitation
      const invitation = await this.prisma.invitation.findUnique({
        where: { email },
      });

      const role = invitation ? invitation.role : Role.STUDENT;

      await this.prisma.user.upsert({
        where: { email },
        update: {
          firebaseUid: id,
          name,
          role,
          status: 'ACTIVE'
        },
        create: {
          email,
          firebaseUid: id,
          name,
          role,
          status: 'ACTIVE',
        },
      });

      if (invitation) {
        await this.prisma.invitation.update({
          where: { email },
          data: { status: 'ACTIVE' },
        });
      }
    } else if (eventType === 'user.updated') {
      const email = evt.data.email_addresses[0]?.email_address;
      const firstName = evt.data.first_name || '';
      const lastName = evt.data.last_name || '';
      const name = `${firstName} ${lastName}`.trim() || email;
      
      await this.prisma.user.updateMany({
        where: { firebaseUid: id },
        data: { name, email },
      });
    } else if (eventType === 'user.deleted') {
      await this.prisma.user.deleteMany({
        where: { firebaseUid: id },
      });
    }

    return { success: true };
  }
}
