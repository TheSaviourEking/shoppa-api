import { Body, Controller, HttpCode, HttpStatus, Module, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { type Feedback, FeedbackKind } from '@prisma/client';
import { IsEnum, IsString, Length } from 'class-validator';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';

class CreateFeedbackDto {
  @ApiProperty({ enum: FeedbackKind })
  @IsEnum(FeedbackKind)
  kind!: FeedbackKind;

  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @IsString()
  @Length(1, 5000)
  body!: string;
}

@Injectable()
class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, kind: FeedbackKind, body: string): Promise<Feedback> {
    return this.prisma.feedback.create({ data: { userId, kind, body } });
  }
}

@ApiTags('feedback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('feedback')
class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() userId: string, @Body() body: CreateFeedbackDto): Promise<Feedback> {
    return this.service.create(userId, body.kind, body.body);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}

export { FeedbackService, FeedbackController, CreateFeedbackDto };
