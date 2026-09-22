import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BlackboardService } from './blackboard.service';

@ApiTags('blackboard')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('blackboard')
export class BlackboardController {
  constructor(private readonly blackboardService: BlackboardService) {}

  @Get(':courseId')
  getBlackboardData(@Param('courseId') courseId: string, @CurrentUser() user: any) {
    return this.blackboardService.getBlackboardData(courseId, user.id);
  }
}
