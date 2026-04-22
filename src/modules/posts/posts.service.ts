import { Injectable } from '@nestjs/common';
import { Prisma, type Post, type PostItem, type Category, type Address } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreatePostDto } from './dto/post.dto';

export interface PostWithRelations extends Post {
  category: Category;
  deliveryAddress: Address;
  items: PostItem[];
}

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async create(userId: string, input: CreatePostDto): Promise<PostWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      // Validate the address belongs to the user — checking ownership
      // here rather than relying on the foreign key constraint gives us
      // a clean NOT_FOUND envelope instead of a Prisma error.
      const address = await tx.address.findFirst({
        where: { id: input.deliveryAddressId, userId },
      });
      if (!address) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Delivery address not found');
      }

      const category = await tx.category.findUnique({ where: { id: input.categoryId } });
      if (!category) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Category not found');
      }

      return tx.post.create({
        data: {
          userId,
          categoryId: input.categoryId,
          deliveryAddressId: input.deliveryAddressId,
          note: input.note,
          budget: new Prisma.Decimal(input.budget),
          installmentsCount: input.installmentsCount ?? 1,
          items: {
            create: input.items.map((item) => ({
              name: item.name,
              imageKey: item.imageKey,
            })),
          },
        },
        include: { category: true, deliveryAddress: true, items: true },
      });
    });
  }

  async findOne(id: string, viewerId: string): Promise<PostWithRelations> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { category: true, deliveryAddress: true, items: true },
    });
    if (!post) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Post not found');
    }
    // Page 3 only surfaces a buyer's own posts and conversations they
    // participate in. Restricting reads to the buyer or the assigned
    // shopper avoids exposing private requests to arbitrary callers.
    if (post.userId !== viewerId && post.shopperId !== viewerId) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Post not found');
    }
    return post;
  }

  listMine(userId: string): Promise<PostWithRelations[]> {
    return this.prisma.post.findMany({
      where: { userId },
      include: { category: true, deliveryAddress: true, items: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
