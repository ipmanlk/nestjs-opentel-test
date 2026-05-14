import { Injectable, Logger } from '@nestjs/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly tracer = trace.getTracer('my-nestjs-app');

  getHello(): string {
    const span = this.tracer.startSpan('getHello');
    try {
      this.logger.log('Processing Hello World request');
      span.setAttribute('handler', 'getHello');
      const result = 'Hello World!';
      span.setAttribute('result.length', result.length);
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  }

  async greet(name: string): Promise<{ message: string; nameLength: number }> {
    const span = this.tracer.startSpan('greet');
    try {
      span.setAttribute('name', name);
      this.logger.log(`Greeting user: ${name}`);

      const result = {
        message: `Hello, ${name}!`,
        nameLength: name.length,
      };

      span.addEvent('greeting.generated', { name });

      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  }

  async fetchData(id: string): Promise<{ id: string; data: string }> {
    const parentSpan = this.tracer.startSpan('fetchData');
    try {
      parentSpan.setAttribute('data.id', id);
      this.logger.log(`Fetching data for id: ${id}`);

      await this.delay(100);
      parentSpan.addEvent('data.source.queried', { id });

      const innerResult = await this.enrichData(id);
      parentSpan.addEvent('data.enriched', { id });

      return { id, data: innerResult };
    } catch (error) {
      parentSpan.recordException(error);
      parentSpan.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      parentSpan.end();
    }
  }

  private async enrichData(id: string): Promise<string> {
    const span = this.tracer.startSpan('enrichData', {
      attributes: { 'data.id': id },
    });
    try {
      this.logger.log(`Enriching data for ${id}`);
      span.addEvent('enrichment.started', { id });
      await this.delay(50);
      span.addEvent('enrichment.completed', { id });
      return `Sample data for ${id}`;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  }

  async processItems(items: string[]): Promise<string[]> {
    const span = this.tracer.startSpan('processItems');
    try {
      span.setAttribute('item.count', items.length);
      this.logger.log(`Processing ${items.length} items`);

      const results: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemSpan = this.tracer.startSpan('processItem', {
          attributes: { item, index: i },
        });
        try {
          const result = `processed-${item}`;
          itemSpan.addEvent('item.processed', { item, result });
          results.push(result);
        } finally {
          itemSpan.end();
        }
      }

      span.setAttribute('results.count', results.length);
      return results;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  }

  throwError(): never {
    const span = this.tracer.startSpan('throwError');
    try {
      this.logger.error('Intentional error thrown');
      span.addEvent('error.thrown');
      throw new Error('Something went wrong');
    } catch (error) {
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
