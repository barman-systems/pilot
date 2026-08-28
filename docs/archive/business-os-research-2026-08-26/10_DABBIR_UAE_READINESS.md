# 10 — DABBIR UAE Readiness

**Legal/research snapshot:** 2026-08-26  
**Important:** This is product/compliance engineering research, not legal or tax advice. Any rule that has not been mapped to the exact current legislation and business scope remains `LEGAL_REVIEW_REQUIRED`.

Status legend:
- `LEGAL_VERIFIED` — supported by current UAE official source for the stated narrow claim.
- `LEGAL_REVIEW_REQUIRED` — relevant but detailed implementation/legal interpretation must be reviewed.
- `NOT_APPLICABLE` — not applicable to current planned product scope.

## 1. UAE eInvoicing — P0 architecture

### Verified current facts

**LEGAL_VERIFIED** — The UAE Ministry of Finance states that an eInvoice is **structured invoice data issued/exchanged electronically and reported electronically to the FTA**. PDF, Word, image, scan or email formats are not eInvoices.

**LEGAL_VERIFIED** — The official programme is based on OpenPeppol and uses Accredited Service Providers (ASPs).

**LEGAL_VERIFIED** — Mandatory implementation schedule currently includes:
- annual revenue ≥ AED 50 million: implement by **1 January 2027**.
- annual revenue < AED 50 million: implement by **1 July 2027**.
- in-scope government entities: implement by **1 October 2027**.

**LEGAL_VERIFIED** — For persons above AED 50 million revenue, the deadline to appoint an ASP was amended from 31 July 2026 to **30 October 2026**. The implementation date remains 1 January 2027.

**LEGAL_VERIFIED** — Current official guidance states B2C transactions are outside the mandatory scope until determined otherwise; detailed scope must still be evaluated for each customer/use case.

### DABBIR engineering decision

Do **not** attempt to become an Accredited Service Provider in V1.

Build:
- canonical structured invoice data model
- mandatory-field validation layer
- eInvoice status/evidence model
- `EinvoiceProviderAdapter` interface
- outbound/inbound document IDs and correlation
- retry/reconciliation/webhook evidence
- provider-specific mapping outside finance core

Integrate with an accredited ASP after commercial/technical review.

Sources:
- https://mof.gov.ae/en/about-us/initiatives/einvoicing/
- https://mof.gov.ae/en/news/ministry-of-finance-announces-targeted-amendments-to-einvoicing-system-decisions/
- https://mof.gov.ae/en/news/ministry-of-finance-announces-the-issuance-of-two-ministerial-decisions-on-the-scope-of-obligations-and-the-timelines-for-implementing-the-electronic-invoicing-system-2/

## 2. VAT / accounting records

**LEGAL_VERIFIED** — UAE VAT legislation and FTA guidance must be treated as the source of truth for tax behavior; DABBIR must use configurable tax codes rather than hard-coded assumptions.

**LEGAL_VERIFIED** — On 20 August 2026, the FTA published **Decision No. 4 of 2026 on the Rules and Requirements for Maintaining the Information Contained in Accounting Records and Commercial Books**.

**LEGAL_REVIEW_REQUIRED** — Before DABBIR defines retention periods, storage format, deletion policies or archival guarantees, the full Decision No. 4/2026 and all applicable tax legislation must be mapped field-by-field. Do not encode legacy retention assumptions from older FAQs without this review.

Engineering requirements:
- tax registration/profile per legal entity
- VAT/tax code versioning
- evidence of tax calculation source/version
- tax period and reporting extracts
- credit note/correction linkage
- immutable posting history
- configurable document numbering
- retention-policy engine driven by verified jurisdiction rules

Sources:
- https://tax.gov.ae/en/Legislation.aspx
- https://tax.gov.ae/en/content/fta.decision.no.4.of.2026.on.the.rules.and.requirements.for.maintaining.the.information.contained.in.accounting.records.and.commercial.books.aspx

## 3. Wages Protection System / payroll

**LEGAL_VERIFIED** — The UAE official government portal states that establishments registered with MoHRE must pay relevant employee wages through WPS, subject to the current rules/exclusions, and identifies **Ministerial Resolution No. 340 of 2026** as the current WPS basis on the updated page.

**LEGAL_VERIFIED** — The same current page states salaries for the previous month are due on the first day of each Gregorian month under that resolution.

**LEGAL_REVIEW_REQUIRED** — Payroll calculation, employee categories, exclusions, end-of-service, pension/social security, Emiratisation and free-zone/special-jurisdiction treatment require separate legal/product mapping.

DABBIR V1 decision:
- HR core: BUILD.
- payroll statutory engine: **DEFER / INTEGRATE** first.
- payroll run metadata, approvals and accounting interface: BUILD.
- WPS file/payment-provider integration: design adapter after provider + legal format verification.

Sources:
- https://u.ae/en/information-and-services/jobs/employment-in-the-private-sector/payment-of-wages
- https://www.mohre.gov.ae/en/guidance-and-awareness-portal-new/wages-protection-system

## 4. Personal data protection

**LEGAL_VERIFIED** — UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection applies to electronic processing within its stated scope, includes processing controls, data-subject rights and cross-border transfer requirements.

DABBIR requirements:
- data inventory and classification
- tenant isolation
- purpose/processing records where required
- consent/evidence where consent is the applicable legal basis
- correction/restriction/deletion request workflow where legally applicable
- export/data-subject request workflow
- processor/subprocessor register
- configurable data residency/transfer documentation
- secure deletion and retention conflict handling
- audit of sensitive-data access

**LEGAL_REVIEW_REQUIRED** — Exact legal basis, controller/processor roles, data residency and transfer rules must be assessed per customer, industry and deployment location.

Source:
- https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws.

## 5. Electronic transactions and trust services

**LEGAL_VERIFIED** — Federal Decree-Law No. 46 of 2021 governs Electronic Transactions and Trust Services in the UAE.

DABBIR implications:
- maintain document integrity/evidence metadata
- do not claim an internal click is a legally qualified signature
- integrate specialized e-sign/trust provider where legal assurance is required
- preserve signer/actor/timestamp/document-version evidence

**LEGAL_REVIEW_REQUIRED** — Signature level, trust service and evidentiary requirements for each document/use case.

Official law source:
- https://assets.u.ae/api/public/content/83039e37384242afaf63c2e4bc05d7a1?v=3ce37943

## 6. Payments and financial services boundary

DABBIR should orchestrate payment states through licensed/supported payment providers rather than hold customer funds as a wallet or represent itself as a bank/payment institution.

`LEGAL_REVIEW_REQUIRED` for any future feature involving:
- stored monetary value
- customer fund custody
- transfers/P2P
- lending/credit
- regulated payment initiation beyond provider APIs

## 7. Arabic and business documents

Product requirement (not a blanket legal claim):
- Arabic-first capability + English parity
- RTL/LTR
- Arabic customer/supplier/company names
- bilingual invoice/quote templates where customer needs them
- UAE date/time/currency formatting
- AED support plus multi-currency ledger architecture

## 8. Jurisdiction architecture for GCC growth

Never put UAE rules directly inside generic finance code.

Use:

```text
Core Finance / HR / Documents
        +
Jurisdiction Pack (AE)
        +
Provider Adapters (ASP/WPS/payments/etc.)
```

Future GCC expansion gets separate verified jurisdiction packs rather than conditionals scattered through core.

## 9. Release gates for UAE-facing modules

Before enabling a compliance-sensitive capability:
1. identify current official legislation/guidance and effective date
2. identify customer/business scope
3. map every required field/state
4. legal/tax review where interpretation exists
5. test positive/negative examples
6. record rule version/effective date
7. establish update monitoring
8. preserve evidence and audit history

No screen or report may use the label “UAE compliant” unless the scoped compliance claim has passed this gate.