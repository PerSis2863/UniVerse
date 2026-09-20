import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');
    
    if (!groupId) {
      return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
    }

    const messages = await prisma.groupMessage.findMany({
      where: { groupId },
      include: {
        sender: true,
        attachments: true
      },
      orderBy: { createdAt: 'asc' }
    });

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { content, senderId, groupId, attachments } = body;

    const message = await prisma.groupMessage.create({
      data: {
        content,
        senderId,
        groupId,
        attachments: attachments && attachments.length > 0 ? {
          create: attachments.map((att: any) => ({
            url: att.url,
            fileName: att.fileName,
            fileType: att.fileType,
            size: att.size,
            aiSummary: att.aiSummary
          }))
        } : undefined
      },
      include: {
        sender: true,
        attachments: true
      }
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json({ error: 'Failed to create message' }, { status: 500 });
  }
}
