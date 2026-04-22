import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Transaction, Wallet } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListTransactionsQueryDto, TopUpDto } from './dto/wallet.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('wallet')
  findMine(@CurrentUser() userId: string): Promise<Wallet> {
    return this.wallet.findMine(userId);
  }

  @Get('wallet/transactions')
  listTransactions(
    @CurrentUser() userId: string,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<Transaction[]> {
    return this.wallet.listTransactions(userId, query);
  }

  @Post('wallet/topup')
  @HttpCode(HttpStatus.OK)
  topUp(@CurrentUser() userId: string, @Body() body: TopUpDto): Promise<Transaction> {
    return this.wallet.topUp(userId, body.amount);
  }

  @Post('posts/:id/pay')
  @HttpCode(HttpStatus.OK)
  payForPost(@CurrentUser() userId: string, @Param('id') postId: string): Promise<Transaction> {
    return this.wallet.payForPost(userId, postId);
  }
}
