# Qwen3.7 Flash provider facts — 2026-09-14

Verified current facts before implementation:

- Vercel AI Gateway model slug: `alibaba/qwen3.7-flash`.
- Vercel AI Gateway publishes Qwen3.7 Flash at approximately $0.03/M input and $0.13/M output tokens for the current provider route.
- Alibaba Model Studio documents `qwen3.7-flash` as supporting thinking mode, function calling, built-in tools, and structured output.
- Thinking must be controlled in DABBIR benchmarks because it is enabled by default on the model and can add cost/latency for simple turns.
- Ternary Bonsai 27B official Together endpoint/model: `Prism-ML/Ternary-Bonsai-27B`; it is currently free on Together serverless, but requires Together credentials for direct live benchmarking.

These facts do not constitute a Production-readiness decision. Candidate promotion still requires DABBIR benchmark evidence.
