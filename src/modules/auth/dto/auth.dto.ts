import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';
import { UserGoal } from '@prisma/client';

export class OtpRequestDto {
  @ApiProperty({ example: 'aidanma@example.com' })
  @IsEmail()
  email!: string;
}

export class OtpVerifyDto {
  @ApiProperty({ example: 'aidanma@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class SignupDto {
  @ApiProperty({ description: 'Token issued by /auth/otp/verify' })
  @IsString()
  @IsNotEmpty()
  signupToken!: string;

  @ApiProperty({ example: 'Aidanma' })
  @IsString()
  @Length(1, 100)
  firstName!: string;

  @ApiProperty({ example: 'Toluwalope' })
  @IsString()
  @Length(1, 100)
  lastName!: string;

  @ApiProperty({
    example: '08012345678',
    description: 'Phone in local or E.164 form; backend normalises',
  })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'hunter2hunter2', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: UserGoal, required: false })
  @IsOptional()
  @IsEnum(UserGoal)
  goal?: UserGoal;
}

export class LoginDto {
  @ApiProperty({ description: 'Email or phone', example: 'aidanma@example.com' })
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class OAuthGoogleDto {
  @ApiProperty({ description: 'Google OIDC id_token from Sign In With Google' })
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}

export class OAuthAppleDto {
  @ApiProperty({ description: 'Apple identity_token from Sign In With Apple' })
  @IsString()
  @IsNotEmpty()
  identityToken!: string;
}
