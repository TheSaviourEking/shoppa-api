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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Transaction, Wallet } from '@prisma/client';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { ApiErrorResponse, ApiSuccessResponse } from '../../common/swagger/api-envelope.decorators';
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
  @ApiOperation({
    summary: "Get the caller's wallet",
    description:
      'Returns balance, virtual account provider (`Opay`), and the (stub) virtual account number — backs the wallet card on the account screen.',
  })
  @ApiSuccessResponse(undefined, { description: 'Wallet row in `data`' })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  findMine(@CurrentUser() userId: string): Promise<Wallet> {
    return this.wallet.findMine(userId);
  }

  @Get('wallet/transactions')
  @ApiOperation({
    summary: 'List wallet transactions (cursor-paginated)',
    description:
      'Newest first. Pass `before=<txId>` for the previous page; `limit` defaults to 50 (max 100). The mobile groups by month client-side for the wallet screen layout.',
  })
  @ApiSuccessResponse(undefined, { isArray: true, description: 'Transaction[] in `data`' })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  listTransactions(
    @CurrentUser() userId: string,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<Transaction[]> {
    return this.wallet.listTransactions(userId, query);
  }

  @Post('wallet/topup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Top up the wallet (synchronous stub)',
    description:
      'Increments the balance and writes a TOPUP transaction in one Prisma transaction. Production would initiate a payment provider call and wait for a webhook — see README stubs section.',
  })
  @ApiSuccessResponse(undefined, { description: 'Created Transaction row in `data`' })
  @ApiErrorResponse(400, [ErrorCode.VALIDATION_ERROR])
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  topUp(@CurrentUser() userId: string, @Body() body: TopUpDto): Promise<Transaction> {
    return this.wallet.topUp(userId, body.amount);
  }

  @Post('posts/:id/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pay for a post (escrow)',
    description:
      'Backs the "Make Payment" CTA in the conversation header. Atomically: debits the buyer\'s wallet by post.budget, marks the post PAID, and writes a DEBIT transaction with the post category as description. All three writes are in one Prisma $transaction so a partial failure rolls back as a unit (covered by the WalletService rollback spec per the brief\'s rollback-test mandate).',
  })
  @ApiParam({ name: 'id', description: 'Post id (cuid)', example: 'cmo9gaabj00079k3efercbmvz' })
  @ApiSuccessResponse(undefined, { description: 'Created Transaction row in `data`' })
  @ApiErrorResponse(
    400,
    [ErrorCode.WALLET_INSUFFICIENT_FUNDS, ErrorCode.POST_NOT_ELIGIBLE],
    'Not enough balance, or post is already PAID/CANCELLED',
  )
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  @ApiErrorResponse(404, [ErrorCode.NOT_FOUND], 'Post not found or caller is not the buyer')
  payForPost(@CurrentUser() userId: string, @Param('id') postId: string): Promise<Transaction> {
    return this.wallet.payForPost(userId, postId);
  }
}
