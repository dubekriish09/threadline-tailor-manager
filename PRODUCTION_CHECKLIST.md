# Production readiness checklist

## Implemented in this source package
- [x] Responsive React/Vite app
- [x] Empty initial workspace (no fake sample customers)
- [x] Customer profiles and garment measurement forms
- [x] Unit conversion between inches and centimetres
- [x] Order tracking and basic payment balance calculations
- [x] CSV exports for customer and order data
- [x] Full JSON backup export and restore confirmation
- [x] Printable measurement card / browser Save as PDF
- [x] Local persistence in the current browser

## Required before a real production launch
- [ ] Cloud database and authentication for multi-device sync
- [ ] Per-shop/user access rules and authorization tests
- [ ] Automated database backups and tested restore procedure
- [ ] Cross-device conflict handling and reliable sync/error states
- [ ] Customer/order editing, deletion and audit/history workflows
- [ ] Payment transaction history (not just one advance-paid value)
- [ ] Server-side validation, rate limiting and abuse protections for cloud APIs
- [ ] Privacy notice, retention policy and account/data deletion process
- [ ] Automated unit/integration tests and browser/device QA
- [ ] Successful production build and deployment smoke test in the hosting account

Do not describe this build as fully production-ready or multi-device until the required items above are completed and tested.
