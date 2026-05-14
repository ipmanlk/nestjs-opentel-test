import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

console.log(process.env);

const O2_URL = process.env.O2_URL || 'http://localhost:5080';
const O2_ORG = process.env.O2_ORG || 'default';
const O2_AUTH = process.env.O2_AUTH || '';
const O2_STREAM = process.env.O2_STREAM || 'default';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'my-nestjs-app';
const SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION || '1.0.0';
const O2_BASE = `${O2_URL}/api/${O2_ORG}`;

const traceExporter = new OTLPTraceExporter({
  url: `${O2_BASE}/v1/traces`,
  headers: {
    Authorization: `Basic ${O2_AUTH}`,
    'stream-name': O2_STREAM,
  },
});

const logExporter = new OTLPLogExporter({
  url: `${O2_BASE}/v1/logs`,
  headers: {
    Authorization: `Basic ${O2_AUTH}`,
    'stream-name': O2_STREAM,
  },
});

export const logRecordProcessor = new BatchLogRecordProcessor(logExporter);

export const otelSDK = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  }),
  traceExporter,
  logRecordProcessors: [logRecordProcessor],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-winston': { enabled: false },
    }),
  ],
});

otelSDK.start();
