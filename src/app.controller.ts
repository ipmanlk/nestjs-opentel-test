import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    this.logger.log('GET / called');
    return this.appService.getHello();
  }

  @Get('greet/:name')
  async greet(
    @Param('name') name: string,
  ): Promise<{ message: string; nameLength: number }> {
    this.logger.log(`GET /greet/${name} called`);
    return this.appService.greet(name);
  }

  @Get('data/:id')
  async getData(
    @Param('id') id: string,
  ): Promise<{ id: string; data: string }> {
    this.logger.log(`GET /data/${id} called`);
    return this.appService.fetchData(id);
  }

  @Get('process')
  async process(@Query('items') items: string): Promise<string[]> {
    this.logger.log(`GET /process called with items=${items}`);
    return this.appService.processItems(items.split(','));
  }

  @Get('error')
  triggerError(): void {
    this.logger.log('GET /error called');
    this.appService.throwError();
  }
}
