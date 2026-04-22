import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class TopUpDto {
  @ApiProperty({ example: 5000, description: 'NGN, with up to 2 decimal places' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  amount!: number;
}

export class ListTransactionsQueryDto {
  @ApiProperty({ required: false, default: 50, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiProperty({ required: false, description: 'Cursor — transaction id to load before' })
  @IsOptional()
  before?: string;
}
