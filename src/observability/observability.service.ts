import { Injectable } from '@nestjs/common';
import { metrics, trace } from '@opentelemetry/api';
import type { Counter, Histogram } from '@opentelemetry/api';

@Injectable()
export class ObservabilityService {
  private readonly tracer = trace.getTracer('my-nestjs-app');
  private readonly meter = metrics.getMeter('my-nestjs-app');

  private readonly requestCounter: Counter;
  private readonly workHistogram: Histogram;

  constructor() {
    this.requestCounter = this.meter.createCounter('app_requests_total', {
      description: 'Total number of handled requests',
    });

    this.workHistogram = this.meter.createHistogram('app_work_duration_ms', {
      description: 'Duration of simulated work in ms',
      unit: 'ms',
    });
  }

  getTracer() {
    return this.tracer;
  }

  recordRequest(route: string, method: string) {
    this.requestCounter.add(1, { route, method });
  }

  recordWork(durationMs: number, name: string) {
    this.workHistogram.record(durationMs, { name });
  }
}
