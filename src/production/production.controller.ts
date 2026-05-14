import { Controller, Get } from '@nestjs/common';
import { ProductionService } from './production.service';

@Controller('production')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Get('simulate')
  async simulate() {
    return this.productionService.simulate();
  }
}
