# GCC customer price currency guard

This slice makes customer-facing price answers follow the business GCC profile instead of a hard-coded UAE unit.

- Country/currency authority: AE/AED, SA/SAR, KW/KWD, QA/QAR, BH/BHD, OM/OMR.
- `api/chat-send.js` reads `country_code` and `currency_code` with the business.
- Deterministic product price replies render the verified ISO business currency.
- AI grounding receives the business country/currency and is explicitly forbidden from inventing missing currency.
- If no GCC currency can be verified, DABBIR does not state a priced amount with a guessed currency.
- Legacy `price_aed` storage remains for compatibility; the customer-facing semantic value is exposed as `price` + `currency_code`.

Regression coverage: `test/dabbir-gcc-chat-currency.test.mjs`.
