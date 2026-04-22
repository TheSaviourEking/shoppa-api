import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Category } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePostDto } from './dto/post.dto';
import { PostsService, type PostWithRelations } from './posts.service';

@ApiTags('posts')
@Controller()
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get('categories')
  listCategories(): Promise<Category[]> {
    return this.posts.listCategories();
  }

  @Post('posts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() userId: string, @Body() body: CreatePostDto): Promise<PostWithRelations> {
    return this.posts.create(userId, body);
  }

  @Get('posts/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() userId: string): Promise<PostWithRelations[]> {
    return this.posts.listMine(userId);
  }

  @Get('posts/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  findOne(@CurrentUser() userId: string, @Param('id') id: string): Promise<PostWithRelations> {
    return this.posts.findOne(id, userId);
  }
}
