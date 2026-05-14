import { Module, RequestMethod } from '@nestjs/common';
import { LoggerModule } from './lib/nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductionModule } from './production/production.module';
import { ObservabilityModule } from './observability/observability.module';

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
};

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: parseBoolean(process.env.LOG_REQUESTS, false),
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV === 'production' ||
          !parseBoolean(process.env.LOG_PRETTY, true)
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'SYS:standard',
                  singleLine: true,
                },
              },
      },
      forRoutes: [{ path: '*path', method: RequestMethod.ALL }],
    }),
    ObservabilityModule,
    ProductionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
