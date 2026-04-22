import { Module } from '@nestjs/common';
import { OAuthVerifierService } from './oauth-verifier.service';

@Module({
  providers: [OAuthVerifierService],
  exports: [OAuthVerifierService],
})
export class OAuthModule {}
