import { Controller, Get, Logger } from '@nestjs/common';
import { ProductionService } from './production.service';

@Controller('production')
export class ProductionController {
  private readonly logger = new Logger(ProductionController.name);

  constructor(private readonly productionService: ProductionService) {}

  @Get('simulate')
  async simulate() {
    this.logger.log('GET /production/simulate');
    return this.productionService.simulate();
  }
}
