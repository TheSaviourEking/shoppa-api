import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePostItemDto {
  @ApiProperty({ example: 'Tomatoes' })
  @IsString()
  @Length(1, 255)
  name!: string;

  @ApiProperty({ required: false, description: 'Upload key from POST /uploads' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  imageKey?: string;
}

export class CreatePostDto {
  @ApiProperty({ description: 'Category id from GET /categories' })
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ApiProperty({ description: 'Address id owned by the caller' })
  @IsString()
  @IsNotEmpty()
  deliveryAddressId!: string;

  @ApiProperty({ type: [CreatePostItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePostItemDto)
  items!: CreatePostItemDto[];

  @ApiProperty({ example: 'Help me Blend the Pepper all together', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 5000)
  note?: string;

  @ApiProperty({ example: 50000, description: 'NGN, with up to 2 decimal places' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  budget!: number;

  @ApiProperty({ enum: [1, 2, 3], default: 1 })
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3])
  installmentsCount?: number;
}
