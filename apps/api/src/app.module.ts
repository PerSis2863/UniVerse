import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { AttendanceModule } from './attendance/attendance.module';
import { GradesModule } from './grades/grades.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { FilesModule } from './files/files.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { KnowledgeHubModule } from './knowledge-hub/knowledge-hub.module';
import { MessagesModule } from './messages/messages.module';
import { CareerModule } from './career/career.module';
import { ScheduleModule } from './schedule/schedule.module';
import { AssociationsModule } from './associations/associations.module';
import { RoomsModule } from './rooms/rooms.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    AttendanceModule,
    GradesModule,
    QuizzesModule,
    AnnouncementsModule,
    FilesModule,
    PaymentsModule,
    NotificationsModule,
    KnowledgeHubModule,
    MessagesModule,
    CareerModule,
    ScheduleModule,
    AssociationsModule,
    RoomsModule,
    TicketsModule,
  ],
})
export class AppModule {}
