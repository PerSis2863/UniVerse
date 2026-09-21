import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('my') findMy(@CurrentUser() user: any) { return this.documentsService.findByUser(user.id); }
  @Post() create(@CurrentUser() user: any, @Body() body: any) { return this.documentsService.create(user.id, body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any) { return this.documentsService.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.documentsService.remove(id); }
}
