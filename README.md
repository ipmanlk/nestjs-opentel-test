# OpenTelemetry NestJS + OpenObserve

A NestJS 11 project instrumented with OpenTelemetry, sending traces and logs to [OpenObserve](https://openobserve.ai) via OTLP.

## Architecture

```
┌──────────────────────────────────────────┐
│ NestJS App                               │
│                                          │
│  ┌──────────────┐   ┌─────────────────┐  │
│  │ Controllers  │──▶│ Services        │  │
│  │ & Routes     │   │ (manual spans)  │  │
│  └──────┬───────┘   └────────┬────────┘  │
│         │                    │           │
│  ┌──────▼────────────────────▼────────┐  │
│  │ Winston (Logger)                   │  │
│  │  ├── Console Transport             │  │
│  │  └── OpenTelemetryTransportV3     │  │
│  └───────────────┬───────────────────┘  │
│                  │                      │
│  ┌──────────────▼───────────────────┐  │
│  │ @opentelemetry/sdk-node          │  │
│  │  ├── OTLPTraceExporter ──────────│──│──▶ OpenObserve (traces)
│  │  ├── BatchLogRecordProcessor ────│──│──▶ OpenObserve (logs)
│  │  └── Auto-instrumentations       │  │
│  └──────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

- **Traces**: Sent directly via `OTLPTraceExporter` to OpenObserve's `/v1/traces` endpoint
- **Logs**: Winston → `OpenTelemetryTransportV3` → `BatchLogRecordProcessor` → `OTLPLogExporter` → OpenObserve `/v1/logs`
- **Auto-instrumentation**: `getNodeAutoInstrumentations()` automatically captures HTTP calls, database queries, etc.
- **Manual instrumentation**: Use `trace.getTracer()` to create custom spans in your services

## Prerequisites

- Node.js 20+ (for `--env-file` support)
- pnpm
- A running OpenObserve instance (local or cloud)

## Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `O2_URL` | `http://localhost:5080` | No | OpenObserve server URL |
| `O2_ORG` | `default` | No | OpenObserve organization |
| `O2_STREAM` | `default` | No | OpenObserve stream name |
| `O2_AUTH` | `""` | **Yes** | Base64-encoded `email:password` token |
| `OTEL_SERVICE_NAME` | `my-nestjs-app` | No | Service name in traces/logs |
| `OTEL_SERVICE_VERSION` | `1.0.0` | No | Service version |

### Getting your O2_AUTH token

```bash
echo -n 'your-email:your-password' | base64
# example output: dGVzdEB0ZXN0LmNvbTpLZ09sblFlQU1ZOUJ6ZFho
```

Copy the output and set it as `O2_AUTH` in `.env`.

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env — set O2_AUTH to your base64 token

# 3. Update lockfile to latest OTel versions
pnpm update

# 4. Build and run
pnpm build
pnpm start:dev
```

## Writing Custom Spans

The tracer is available from `@opentelemetry/api`. Get a tracer instance and create spans in your services:

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('my-nestjs-app');

// Basic span
const span = tracer.startSpan('myOperation');
try {
  span.setAttribute('key', 'value');
  span.addEvent('step.completed', { step: 1 });
  // ... your logic ...
} catch (error) {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR });
  throw error;
} finally {
  span.end();
}
```

### Span Attributes

Add key-value metadata to describe the operation:

```typescript
span.setAttribute('user.id', userId);
span.setAttribute('item.count', items.length);
span.setAttribute('operation.fast', true);
```

### Span Events

Record timestamped events within a span:

```typescript
span.addEvent('cache.miss', { key: cacheKey });
span.addEvent('data.fetched', { source: 'database', latencyMs: 42 });
```

### Nested / Child Spans

Create child spans for sub-operations:

```typescript
const parentSpan = tracer.startSpan('fetchOrder');
try {
  const user = await fetchUser(id);     // auto-instrumented
  const childSpan = tracer.startSpan('loadHistory', {
    attributes: { userId: id },
  });
  try {
    const history = await loadHistory(id);
    childSpan.addEvent('history.loaded', { recordCount: history.length });
    return { user, history };
  } finally {
    childSpan.end();
  }
} finally {
  parentSpan.end();
}
```

### Error Spans

```typescript
try {
  throw new Error('Database connection failed');
} catch (error) {
  span.recordException(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message,
  });
  throw error;
}
```

## Available Endpoints

| Endpoint | Description | Span Example |
|---|---|---|
| `GET /` | Basic hello world | `getHello` |
| `GET /greet/:name` | Greets a user | `greet` |
| `GET /data/:id` | Fetches data with nested async operation | `fetchData` → `enrichData` (child span) |
| `GET /process?items=a,b,c` | Processes items in a loop with per-item child spans | `processItems` → `processItem` (N child spans) |
| `GET /error` | Triggers an intentional error | `throwError` with error status |

## Scripts

| Script | Command | Description |
|---|---|---|
| `start` | `node --env-file=.env dist/main.js` | Production (built) |
| `start:dev` | `node --env-file=.env --require ts-node/register src/main.ts` | Development (ts-node) |
| `start:debug` | `node --env-file=.env --inspect --require ts-node/register src/main.ts` | Debug mode |
| `start:prod` | `node --env-file=.env dist/main.js` | Production (same as `start`) |
| `build` | `nest build` | Compile TypeScript |

All scripts use `--env-file=.env` to automatically load environment variables (Node 20+ feature). No `--require` flag is needed for `otel.ts` because `main.ts` imports it as its first module, ensuring OTel initializes before any other code runs.

## How It Works

### Initialization (otel.ts)

`otel.ts` is imported as the first module in `main.ts`. When loaded, it:

1. Creates the OTLP trace and log exporters pointing at OpenObserve
2. Configures a `NodeSDK` with exporters, processors, and auto-instrumentations
3. Calls `otelSDK.start()` immediately — this registers the global `LoggerProvider` and `TracerProvider` **before** NestJS modules initialize

This is critical because `OpenTelemetryTransportV3` (the winston → OTLP bridge) needs the global `LoggerProvider` to exist when winston initializes.

### Logger Wiring (main.ts)

`WinstonModule.forRoot()` in `AppModule` creates a winston logger with two transports:
- Console (structured JSON)
- `OpenTelemetryTransportV3` (sends via OTLP)

`main.ts` then calls `app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER))` to replace NestJS's default Logger with the winston-backed one. This ensures all `new Logger()` calls throughout the app go through winston → OTLP → OpenObserve.

### Graceful Shutdown

On `SIGTERM`/`SIGINT`, the app calls `otelSDK.shutdown()` to flush any buffered spans and log records before exiting.
