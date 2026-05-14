import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { OpenTelemetryTransportV3 } from '@opentelemetry/winston-transport';
import * as winston from 'winston';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductionModule } from './production/production.module';

@Module({
  imports: [
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
        new OpenTelemetryTransportV3(),
      ],
    }),
    ProductionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
