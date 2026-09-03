# DABBIR Golden Canary v1

Status: implementation candidate
Contract: `DABBIR_GOLDEN_CANARY_V1`

## Purpose

Prevent a candidate release from reaching production unless the exact candidate has passed an isolated canary validation path.

## Required release path

`candidate -> Vercel preview/canary URL -> Golden Canary gate -> governed PR -> main -> existing Release Guardian -> production`

## Fail-closed rules

- No production promotion on missing canary URL.
- HTTPS is mandatory.
- Static syntax checks and full repository tests must pass.
- Authenticated protected smoke must pass.
- The live customer journey must pass when required.
- A missing required test script is a failure, never a skip.
- Sensitive credentials are supplied only through GitHub Actions secrets.
- The gate emits a machine-readable receipt proving candidate ref and successful gates.

## Required configuration

GitHub Actions variable:
- `DABBIR_GOLDEN_CANARY_URL`: isolated Vercel preview/custom canary URL for the exact candidate.

GitHub Actions secrets:
- `DABBIR_GOLDEN_CANARY_OWNER_EMAIL`
- `DABBIR_GOLDEN_CANARY_OWNER_PASSWORD`
- `DABBIR_GOLDEN_CANARY_WHATSAPP_TO`
- `DABBIR_GOLDEN_CANARY_VERIFY_TOKEN` when required by the journey verifier.

## Critical customer journey

`WhatsApp inbound -> DABBIR AI -> service/availability decision -> booking write -> calendar visibility -> owner/customer notification -> evidence verification`

This document is evidence of the release contract only. The gate is considered operational only after the workflow executes successfully against the isolated canary URL and produces its artifact receipt.
