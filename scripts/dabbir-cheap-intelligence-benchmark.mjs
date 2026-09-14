#!/usr/bin/env node

// Isolated benchmark harness scaffold. It intentionally refuses Production routing
// changes and emits no customer/model text. Live provider calls are added only through
// explicit benchmark adapters with scoped credentials.
const candidates = [
  { id: 'qwen37-flash', model: 'alibaba/qwen3.7-flash', transport: 'vercel-ai-gateway' },
  { id: 'ternary-bonsai-27b', model: 'Prism-ML/Ternary-Bonsai-27B', transport: 'together-ai' },
];

const selected = String(process.env.DABBIR_BENCHMARK_MODEL || '').trim();
if (!selected) {
  console.log(JSON.stringify({ status: 'CONFIG_ONLY', candidates }, null, 2));
  process.exit(0);
}
const candidate = candidates.find(item => item.id === selected);
if (!candidate) throw new Error('DABBIR_BENCHMARK_MODEL_NOT_ALLOWED');
if (process.env.VERCEL_ENV === 'production') throw new Error('BENCHMARK_PRODUCTION_EXECUTION_FORBIDDEN');

console.log(JSON.stringify({
  status: 'ADAPTER_PENDING',
  candidate,
  production_routing_changed: false,
}, null, 2));
