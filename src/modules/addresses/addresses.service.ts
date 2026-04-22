import { Injectable } from '@nestjs/common';
import type { Address } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, input: CreateAddressDto): Promise<Address> {
    const wantsDefault = input.isDefault === true;
    return this.prisma.$transaction(async (tx) => {
      if (wantsDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.address.create({
        data: {
          userId,
          label: input.label,
          line: input.line,
          city: input.city,
          state: input.state,
          country: input.country,
          isDefault: wantsDefault,
        },
      });
    });
  }

  async update(userId: string, id: string, input: UpdateAddressDto): Promise<Address> {
    return this.prisma.$transaction(async (tx) => {
      const owned = await tx.address.findFirst({ where: { id, userId } });
      if (!owned) {
        // 404 rather than 403 — don't reveal whether the id exists
        // for someone else.
        throw new AppException(ErrorCode.NOT_FOUND, 'Address not found');
      }
      if (input.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.address.update({
        where: { id },
        data: {
          label: input.label,
          line: input.line,
          city: input.city,
          state: input.state,
          country: input.country,
          isDefault: input.isDefault,
        },
      });
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.prisma.address.deleteMany({ where: { id, userId } });
    if (result.count === 0) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Address not found');
    }
  }
}
