import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Category } from '@prisma/client';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { ApiErrorResponse, ApiSuccessResponse } from '../../common/swagger/api-envelope.decorators';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePostDto } from './dto/post.dto';
import { PostsService, type PostWithRelations } from './posts.service';

@ApiTags('posts')
@Controller()
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get('categories')
  @ApiOperation({
    summary: 'List categories (public)',
    description:
      'Backs the home pills + the category selection sheet on Create Post. Ordered by sortOrder ascending.',
  })
  @ApiSuccessResponse(undefined, { isArray: true, description: 'Category[] in `data`' })
  listCategories(): Promise<Category[]> {
    return this.posts.listCategories();
  }

  @Post('posts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Create a post with nested items',
    description:
      'Wraps the post + items insert in a single Prisma transaction. Validates the category exists and the delivery address belongs to the caller. installmentsCount must be 1, 2, or 3 (matches the bottom-sheet options on the budget screen).',
  })
  @ApiSuccessResponse(undefined, {
    status: 201,
    description: 'Created Post with `category`, `deliveryAddress`, and `items[]` populated',
  })
  @ApiErrorResponse(
    400,
    [ErrorCode.VALIDATION_ERROR],
    'Bad body, empty items, invalid installments',
  )
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  @ApiErrorResponse(
    404,
    [ErrorCode.NOT_FOUND],
    'Category id unknown or delivery address not owned by caller',
  )
  create(@CurrentUser() userId: string, @Body() body: CreatePostDto): Promise<PostWithRelations> {
    return this.posts.create(userId, body);
  }

  @Get('posts/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "List the caller's posts",
    description: 'Newest first. Includes category, deliveryAddress, and items[] on each row.',
  })
  @ApiSuccessResponse(undefined, { isArray: true, description: 'Post[] in `data`' })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  listMine(@CurrentUser() userId: string): Promise<PostWithRelations[]> {
    return this.posts.listMine(userId);
  }

  @Get('posts/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get post detail',
    description:
      'Returns NOT_FOUND for unrelated callers — only the buyer or the assigned shopper can read a post. Used by the conversation header to render the category + budget + status badge.',
  })
  @ApiParam({ name: 'id', description: 'Post id (cuid)', example: 'cmo9gaabj00079k3efercbmvz' })
  @ApiSuccessResponse(undefined, { description: 'Post with relations populated' })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  @ApiErrorResponse(404, [ErrorCode.NOT_FOUND], 'No such post (or not yours)')
  findOne(@CurrentUser() userId: string, @Param('id') id: string): Promise<PostWithRelations> {
    return this.posts.findOne(id, userId);
  }
}
