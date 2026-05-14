import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

const OTEL_DIAG = (process.env.OTEL_DIAG || 'info').toLowerCase();
const diagLevel = (() => {
  switch (OTEL_DIAG) {
    case 'none':
      return DiagLogLevel.NONE;
    case 'error':
      return DiagLogLevel.ERROR;
    case 'warn':
      return DiagLogLevel.WARN;
    case 'debug':
      return DiagLogLevel.DEBUG;
    case 'verbose':
      return DiagLogLevel.VERBOSE;
    case 'info':
    default:
      return DiagLogLevel.INFO;
  }
})();

diag.setLogger(new DiagConsoleLogger(), diagLevel);

const O2_URL = process.env.O2_URL || 'http://localhost:5080';
const O2_ORG = process.env.O2_ORG || 'default';
const O2_AUTH = process.env.O2_AUTH || '';
const O2_STREAM = process.env.O2_STREAM || 'default';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'my-nestjs-app';
const SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION || '1.0.0';
const O2_BASE = `${O2_URL}/api/${O2_ORG}`;
const O2_TIMEOUT_MS = Number(process.env.OTEL_EXPORTER_OTLP_TIMEOUT || 10000);

const traceExporter = new OTLPTraceExporter({
  url: `${O2_BASE}/v1/traces`,
  headers: {
    Authorization: `Basic ${O2_AUTH}`,
    'stream-name': O2_STREAM,
  },
  timeoutMillis: O2_TIMEOUT_MS,
});

const logExporter = new OTLPLogExporter({
  url: `${O2_BASE}/v1/logs`,
  headers: {
    Authorization: `Basic ${O2_AUTH}`,
    'stream-name': O2_STREAM,
  },
  timeoutMillis: O2_TIMEOUT_MS,
});

const metricExporter = new OTLPMetricExporter({
  url: `${O2_BASE}/v1/metrics`,
  headers: {
    Authorization: `Basic ${O2_AUTH}`,
    'stream-name': O2_STREAM,
  },
  timeoutMillis: O2_TIMEOUT_MS,
});

export const logRecordProcessor = new BatchLogRecordProcessor(logExporter);
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 10000,
});

export const otelSDK = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  }),
  traceExporter,
  logRecordProcessors: [logRecordProcessor],
  metricReaders: [metricReader],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-winston': { enabled: false },
      '@opentelemetry/instrumentation-pino': { enabled: false },
    }),
    new PinoInstrumentation({
      logKeys: {
        traceId: 'traceId',
        spanId: 'spanId',
        traceFlags: 'traceFlags',
      },
    }),
  ],
});

otelSDK.start();
