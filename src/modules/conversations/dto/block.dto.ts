import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateBlockDto {
  @ApiProperty({
    description:
      'User id to block. The action sheet on the conversation header writes the counterparty id here.',
    example: 'cmo9f64jz00009kgnhred8myy',
  })
  @IsString()
  @IsNotEmpty()
  blockedId!: string;
}
