import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateIf,
} from 'class-validator';

export class OpenConversationDto {
  @ApiProperty({ description: 'Post the conversation is about' })
  @IsString()
  @IsNotEmpty()
  postId!: string;

  @ApiProperty({
    description:
      'The other party. The caller must be either the post buyer (then this is the shopper) or the shopper they want to talk to.',
  })
  @IsString()
  @IsNotEmpty()
  counterpartyId!: string;
}

export class SendMessageDto {
  // Either body or uploadIds (or both) must be present.
  @ApiProperty({ required: false })
  @ValidateIf((o: SendMessageDto) => !o.uploadIds || o.uploadIds.length === 0)
  @IsString()
  @Length(1, 5000)
  body?: string;

  @ApiProperty({ required: false, maxItems: 4 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  uploadIds?: string[];
}

export class MarkReadDto {
  @ApiProperty({ description: 'Message id to mark as the new read horizon (inclusive)' })
  @IsString()
  @IsNotEmpty()
  upToMessageId!: string;
}

export class ListMessagesQueryDto {
  @ApiProperty({ required: false, default: 50, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiProperty({ required: false, description: 'Cursor — message id to load before' })
  @IsOptional()
  @IsString()
  before?: string;
}
