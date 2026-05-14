import { Injectable, Logger } from '@nestjs/common';
import { SpanStatusCode } from '@opentelemetry/api';
import { logRecordProcessor } from '../otel';
import { ObservabilityService } from '../observability/observability.service';

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  total: number;
  status: string;
  shippingAddress: string;
}

interface PaymentResult {
  transactionId: string;
  status: 'approved' | 'declined';
  amount: number;
}

interface InventoryResult {
  itemId: string;
  available: boolean;
  stockRemaining: number;
}

@Injectable()
export class ProductionService {
  private readonly logger = new Logger(ProductionService.name);

  constructor(private readonly observability: ObservabilityService) {}

  async placeOrder(customerId: string, items: OrderItem[]): Promise<Order> {
    const span = this.observability.getTracer().startSpan('placeOrder');
    span.setAttribute('customer.id', customerId);
    span.setAttribute('item.count', items.length);

    try {
      this.logger.log(`Placing order for customer ${customerId}`);

       const orderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      span.setAttribute('order.id', orderId);

       span.addEvent('order.validation.started');
       const validationDelayMs = 30;
       await this.delay(validationDelayMs);
       this.observability.recordWork(validationDelayMs, 'order.validation');
       const total = this.calculateTotal(items);
      span.setAttribute('order.total', total);
      span.addEvent('order.validation.completed', { total });

       span.addEvent('inventory.check.started');
       const inventoryResults = await this.checkInventory(items);
       span.addEvent('inventory.check.completed');

      const outOfStock = inventoryResults.filter((r) => !r.available);
      if (outOfStock.length > 0) {
        this.logger.warn(
          `Out of stock items: ${outOfStock.map((r) => r.itemId).join(', ')}`,
        );
        span.setAttribute('out.of.stock.items', outOfStock.length);
      }

       span.addEvent('payment.processing.started');
       const payment = await this.processPayment(customerId, total);
       span.addEvent('payment.processing.completed', {
         transactionId: payment.transactionId,
         status: payment.status,
       });

      if (payment.status === 'declined') {
        throw new Error(`Payment declined for customer ${customerId}`);
      }

       span.addEvent('shipping.calculation.started');
       const shippingInfo = await this.calculateShipping(items);
       span.addEvent('shipping.calculation.completed');

       span.addEvent('notification.sending.started');
       await this.sendConfirmationEmail(customerId, orderId);
       span.addEvent('notification.sending.completed');

      const order: Order = {
        orderId,
        customerId,
        items,
        total,
        status: 'confirmed',
        shippingAddress: shippingInfo.address,
      };

      this.logger.log(`Order ${orderId} placed successfully`);
      span.setAttribute('order.status', 'confirmed');
      return order;
    } catch (error) {
      this.logger.error(`Order failed: ${(error as Error).message}`);
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      throw error;
    } finally {
      span.end();
    }
  }

  async simulate(): Promise<{
    orderResult: Order | null;
    refundResult: { refundId: string; amount: number } | null;
    failureResult: string | null;
    errors: string[];
  }> {
    const span = this.observability.getTracer().startSpan('simulate');
    const errors: string[] = [];

    try {
      this.logger.log('=== Simulation started ===');

      const items: OrderItem[] = [
        { productId: 'PROD-001', name: 'Widget', quantity: 2, price: 19.99 },
        { productId: 'PROD-002', name: 'Gadget', quantity: 1, price: 49.99 },
      ];

      span.setAttribute('simulation.items', items.length);

      let orderResult: Order | null = null;
      try {
        orderResult = await this.placeOrder('CUST-42', items);
        this.logger.log('Order phase completed');
      } catch (orderError) {
        errors.push(`Order failed: ${(orderError as Error).message}`);
        this.logger.error(`Order phase failed: ${(orderError as Error).message}`);
      }

      let refundResult: { refundId: string; amount: number } | null = null;
      if (orderResult) {
        try {
          refundResult = await this.processRefund(orderResult.orderId);
          this.logger.log('Refund phase completed');
        } catch (refundError) {
          errors.push(`Refund failed: ${(refundError as Error).message}`);
          this.logger.error(`Refund phase failed: ${(refundError as Error).message}`);
        }
      }

      let failureResult: string | null = null;
      try {
        failureResult = await this.simulateSystemFailure();
        this.logger.log('Failure simulation phase completed');
      } catch (failureError) {
        errors.push(`Failure simulation: ${(failureError as Error).message}`);
        this.logger.error(`Failure simulation failed: ${(failureError as Error).message}`);
      }

      span.setAttribute('simulation.errors.count', errors.length);

      this.logger.log('=== Simulation finished ===');

      this.observability.recordRequest('/production/simulate', 'GET');
      await logRecordProcessor.forceFlush();

      return { orderResult, refundResult, failureResult, errors };
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  async processRefund(
    orderId: string,
  ): Promise<{ refundId: string; amount: number }> {
    const span = this.observability.getTracer().startSpan('processRefund');
    span.setAttribute('order.id', orderId);

    try {
      this.logger.log(`Processing refund for order ${orderId}`);

      span.addEvent('refund.validation.started');
      const amount = await this.lookupOrderAmount(orderId);
      span.setAttribute('refund.amount', amount);

      span.addEvent('refund.validation.completed', { amount });

      span.addEvent('refund.execution.started');
      const refundId = await this.executeRefund(orderId, amount);
      span.addEvent('refund.execution.completed', { refundId });

      this.logger.log(`Refund ${refundId} processed for ${amount}`);
      return { refundId, amount };
    } catch (error) {
      this.logger.error(
        `Refund failed for order ${orderId}: ${(error as Error).message}`,
      );
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      throw error;
    } finally {
      span.end();
    }
  }

  async simulateSystemFailure(): Promise<string> {
    const span = this.observability.getTracer().startSpan('simulateSystemFailure');

    try {
      this.logger.warn('Simulating cascading system failure');

      span.addEvent('service_a.call.started');
      await this.serviceA();
      span.addEvent('service_a.call.completed');
      return 'Service A completed successfully';
    } catch (error) {
      span.recordException(error);

      span.addEvent('service_b.fallback.started');
      try {
        await this.serviceB();
        span.addEvent('service_b.fallback.completed');
        return 'Recovered via fallback';
      } catch (fallbackError) {
        span.recordException(fallbackError);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'All fallbacks exhausted',
        });
        this.logger.error('Cascading failure - all services down');
        throw new Error('All services unavailable after cascading failure');
      }
    } finally {
      span.end();
    }
  }

  private async checkInventory(items: OrderItem[]): Promise<InventoryResult[]> {
    const span = this.observability.getTracer().startSpan('checkInventory');
    try {
       const delayMs = 50 + Math.random() * 50;
       await this.delay(delayMs);
       this.observability.recordWork(delayMs, 'checkInventory');

      return items.map((item) => {
        const available = Math.random() > 0.15;
        const stockRemaining = available ? Math.floor(Math.random() * 100) : 0;

        span.addEvent(`inventory.checked.${item.productId}`, {
          productId: item.productId,
          available,
          stockRemaining,
        });

        return {
          itemId: item.productId,
          available,
          stockRemaining,
        };
      });
    } finally {
      span.end();
    }
  }

  private async processPayment(
    customerId: string,
    amount: number,
  ): Promise<PaymentResult> {
    const span = this.observability.getTracer().startSpan('processPayment');
    span.setAttribute('payment.amount', amount);

    try {
       const delayMs = 80 + Math.random() * 70;
       await this.delay(delayMs);
       this.observability.recordWork(delayMs, 'processPayment');

      const shouldDecline = Math.random() < 0.2;
      const status = shouldDecline ? 'declined' : 'approved';

      const result: PaymentResult = {
        transactionId: `TXN-${Date.now()}`,
        status,
        amount,
      };

      this.logger.log(
        `Payment ${status} for ${amount} (customer: ${customerId})`,
      );

      if (shouldDecline) {
        span.addEvent('payment.declined', { reason: 'insufficient_funds' });
      } else {
        span.addEvent('payment.approved', {
          transactionId: result.transactionId,
        });
      }

      return result;
    } finally {
      span.end();
    }
  }

  private async calculateShipping(
    items: OrderItem[],
  ): Promise<{ address: string; cost: number }> {
    const span = this.observability.getTracer().startSpan('calculateShipping');
    span.setAttribute('item.count', items.length);

    try {
       const delayMs = 40 + Math.random() * 30;
       await this.delay(delayMs);
       this.observability.recordWork(delayMs, 'calculateShipping');

      const baseCost = 5;
      const itemCost = items.reduce(
        (sum, item) => sum + item.quantity * 1.5,
        0,
      );
      const totalCost = baseCost + itemCost;

      span.setAttribute('shipping.cost', totalCost);

      return {
        address: '123 Shipping Ln, Warehouse City, WC 12345',
        cost: totalCost,
      };
    } finally {
      span.end();
    }
  }

  private async sendConfirmationEmail(
    customerId: string,
    orderId: string,
  ): Promise<void> {
    const span = this.observability.getTracer().startSpan('sendConfirmationEmail');
    span.setAttribute('order.id', orderId);

    try {
       const delayMs = 30 + Math.random() * 40;
       await this.delay(delayMs);
       this.observability.recordWork(delayMs, 'sendConfirmationEmail');

      const shouldFail = Math.random() < 0.1;
      if (shouldFail) {
        throw new Error(`Email service timeout for order ${orderId}`);
      }

      span.addEvent('email.sent', { customerId, orderId });
      this.logger.log(`Confirmation email sent for order ${orderId}`);
    } finally {
      span.end();
    }
  }

  private async lookupOrderAmount(orderId: string): Promise<number> {
    const span = this.observability.getTracer().startSpan('lookupOrderAmount');
    span.setAttribute('order.id', orderId);

    try {
       const delayMs = 30;
       await this.delay(delayMs);
       this.observability.recordWork(delayMs, 'lookupOrderAmount');
      return Math.floor(Math.random() * 500) + 10;
    } finally {
      span.end();
    }
  }

  private async executeRefund(
    orderId: string,
    amount: number,
  ): Promise<string> {
    const span = this.observability.getTracer().startSpan('executeRefund');
    span.setAttribute('order.id', orderId);

    try {
       const delayMs = 100 + Math.random() * 100;
       await this.delay(delayMs);
       this.observability.recordWork(delayMs, 'executeRefund');

      const shouldFail = Math.random() < 0.15;
      if (shouldFail) {
        throw new Error(`Refund gateway error for order ${orderId}`);
      }

      const refundId = `RFD-${Date.now()}`;
      span.addEvent('refund.processed', { refundId, amount });
      return refundId;
    } finally {
      span.end();
    }
  }

  private async serviceA(): Promise<void> {
    const span = this.observability.getTracer().startSpan('serviceA.call');
    try {
       const delayMs = 20;
       await this.delay(delayMs);
       this.observability.recordWork(delayMs, 'serviceA');
      const shouldFail = Math.random() < 0.6;
      if (shouldFail) {
        throw new Error('Service A returned 500 Internal Server Error');
      }
    } finally {
      span.end();
    }
  }

  private async serviceB(): Promise<void> {
    const span = this.observability.getTracer().startSpan('serviceB.call');
    try {
       const delayMs = 20;
       await this.delay(delayMs);
       this.observability.recordWork(delayMs, 'serviceB');
      const shouldFail = Math.random() < 0.5;
      if (shouldFail) {
        throw new Error('Service B returned 503 Service Unavailable');
      }
    } finally {
      span.end();
    }
  }

  private calculateTotal(items: OrderItem[]): number {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
