import { Controller, Get, Param, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('greet/:name')
  async greet(
    @Param('name') name: string,
  ): Promise<{ message: string; nameLength: number }> {
    return this.appService.greet(name);
  }

  @Get('data/:id')
  async getData(
    @Param('id') id: string,
  ): Promise<{ id: string; data: string }> {
    return this.appService.fetchData(id);
  }

  @Get('process')
  async process(@Query('items') items: string): Promise<string[]> {
    return this.appService.processItems(items.split(','));
  }

  @Get('error')
  triggerError(): void {
    this.appService.throwError();
  }
}
