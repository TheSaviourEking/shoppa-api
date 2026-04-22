import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ example: 'ADDRESS 1', required: false })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  label?: string;

  @ApiProperty({ example: '53, Bamidele eletu Avenue Osapa' })
  @IsString()
  @Length(1, 255)
  line!: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @Length(1, 100)
  city!: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @Length(1, 100)
  state!: string;

  @ApiProperty({ example: 'Nigeria' })
  @IsString()
  @Length(1, 100)
  country!: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  label?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  line?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  city?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  state?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  country?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
