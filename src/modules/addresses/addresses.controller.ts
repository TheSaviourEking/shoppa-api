import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Address } from '@prisma/client';
import { ErrorCode } from '../../common/exceptions/error-codes';
import {
  ApiErrorResponse,
  ApiNoContentResponse,
  ApiSuccessResponse,
} from '../../common/swagger/api-envelope.decorators';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@ApiTags('addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({
    summary: "List the caller's addresses",
    description:
      'Ordered by isDefault desc then createdAt desc — the saved-default surfaces first in the delivery picker.',
  })
  @ApiSuccessResponse(undefined, { isArray: true, description: 'Address[] in `data`' })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  list(@CurrentUser() userId: string): Promise<Address[]> {
    return this.addresses.list(userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an address',
    description:
      'Setting `isDefault: true` clears any prior default for the user in the same transaction.',
  })
  @ApiSuccessResponse(undefined, { status: 201, description: 'Created Address row in `data`' })
  @ApiErrorResponse(400, [ErrorCode.VALIDATION_ERROR])
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  create(@CurrentUser() userId: string, @Body() body: CreateAddressDto): Promise<Address> {
    return this.addresses.create(userId, body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an address',
    description:
      "NOT_FOUND (rather than FORBIDDEN) when the id is not owned by the caller, so the endpoint cannot be used to enumerate other users' address ids.",
  })
  @ApiParam({ name: 'id', description: 'Address id (cuid)', example: 'cmo9gaa7a00059k3etzjq3uph' })
  @ApiSuccessResponse(undefined, { description: 'Updated Address row in `data`' })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  @ApiErrorResponse(404, [ErrorCode.NOT_FOUND], 'No such address (or not yours)')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: UpdateAddressDto,
  ): Promise<Address> {
    return this.addresses.update(userId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an address' })
  @ApiParam({ name: 'id', description: 'Address id (cuid)', example: 'cmo9gaa7a00059k3etzjq3uph' })
  @ApiNoContentResponse('Address deleted')
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  @ApiErrorResponse(404, [ErrorCode.NOT_FOUND], 'No such address (or not yours)')
  async remove(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    await this.addresses.remove(userId, id);
  }
}
