import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from '../../config/env';

const PROD = env.NODE_ENV === 'production';

/**
 * Pino-based logger:
 *   - JSON in production so log aggregators (Sentry/Datadog/Loki) parse it.
 *   - Pretty-printed in dev so the terminal stays readable.
 *
 * `pino-http` is bundled with `nestjs-pino` and replaces the bespoke
 * RequestLoggerMiddleware — every request gets a structured log entry with
 * method, URL, status, response time, and a per-request `reqId` for tracing.
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: PROD ? 'info' : 'debug',
        transport: PROD
          ? undefined
          : {
              target: 'pino-pretty',
              options: {
                singleLine: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname,req,res,responseTime',
                messageFormat: '{msg} {req.method} {req.url} {res.statusCode} {responseTime}ms',
              },
            },
        // Per-request fields exposed in the log JSON. `reqId` ties together
        // every log line emitted while handling a request.
        customProps: (req: IncomingMessage) => ({
          reqId: (req as IncomingMessage & { id?: string }).id,
        }),
        // Strip cookies / authorization from request log to avoid leaking
        // bearer tokens or session ids into the stream.
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["set-cookie"]'],
          censor: '[redacted]',
        },
        // Severity from response status; matches the previous middleware.
        customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      },
    }),
  ],
})
export class AppLoggerModule {}
