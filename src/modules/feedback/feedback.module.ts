import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { type Feedback, FeedbackKind } from '@prisma/client';
import { IsEnum, IsString, Length } from 'class-validator';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { ApiErrorResponse, ApiSuccessResponse } from '../../common/swagger/api-envelope.decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class CreateFeedbackDto {
  @ApiProperty({
    enum: FeedbackKind,
    description: '`REPORT` for "Report a Problem", `FEEDBACK` for the general Feedback row',
    example: FeedbackKind.FEEDBACK,
  })
  @IsEnum(FeedbackKind)
  kind!: FeedbackKind;

  @ApiProperty({
    minLength: 1,
    maxLength: 5000,
    example: 'The wallet balance updated late after my last top-up.',
  })
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
  @ApiOperation({
    summary: 'Submit feedback or a problem report',
    description:
      'Backs both the "Feedback" and "Report a Problem" rows in the account screen — the discriminator is the `kind` field.',
  })
  @ApiSuccessResponse(undefined, { status: 201, description: 'Created Feedback row in `data`' })
  @ApiErrorResponse(400, [ErrorCode.VALIDATION_ERROR])
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
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
