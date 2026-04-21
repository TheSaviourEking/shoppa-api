import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { ResponseEnvelopeInterceptor } from './interceptors/response-envelope.interceptor';

@Module({
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class CommonModule {}
