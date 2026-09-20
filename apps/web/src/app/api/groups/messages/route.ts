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

export async function PATCH(request: Request) {
  try {
    const { id, content } = await request.json();
    
    if (!id || !content) {
      return NextResponse.json({ error: 'id and content are required' }, { status: 400 });
    }

    const message = await prisma.groupMessage.update({
      where: { id },
      data: { 
        content,
        isEdited: true 
      }
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error('Error updating message:', error);
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await prisma.groupMessage.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
  }
}
