import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { KnowledgeHubService } from './knowledge-hub.service';
import { CreateKnowledgeHubDto } from './dto/create-knowledge-hub.dto';
import { UpdateKnowledgeHubDto } from './dto/update-knowledge-hub.dto';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('knowledge-hub')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class KnowledgeHubController {
  constructor(private readonly knowledgeHubService: KnowledgeHubService) {}

  @Post()
  @Roles(Role.STUDENT, Role.TEACHER, Role.ADMIN)
  create(@Body() createKnowledgeHubDto: CreateKnowledgeHubDto, @Req() req) {
    return this.knowledgeHubService.create(createKnowledgeHubDto, req.user.userId);
  }

  @Get()
  findAll() {
    return this.knowledgeHubService.findAll();
  }

  @Get('public')
  findPublic() {
    return this.knowledgeHubService.findPublic();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.knowledgeHubService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.STUDENT, Role.TEACHER, Role.ADMIN)
  update(@Param('id') id: string, @Body() updateKnowledgeHubDto: UpdateKnowledgeHubDto) {
    return this.knowledgeHubService.update(id, updateKnowledgeHubDto);
  }

  @Delete(':id')
  @Roles(Role.STUDENT, Role.TEACHER, Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.knowledgeHubService.remove(id);
  }
}
