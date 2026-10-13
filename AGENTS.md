# Working in this repository

- Read `docs/case-standard.md` before changing a case or adding one.
- Keep public business documentation in Chinese; IDs and filenames use lowercase kebab-case.
- One case has one primary domain from `catalog/domains.json`; use tags for cross-domain discovery.
- Update the manifest, catalog entry and evidence together when changing delivery status.
- Preserve the distinction between mock, unavailable and connected capabilities. Never label a simulated model output as real generation.
- Use synthetic fixtures. Do not include private conversations, client identities, signed media URLs, credentials or real-person source footage.
- Reuse ByteFolk components and framework contracts where appropriate; declare actual dependencies instead of implying an integration exists.
- Run `npm ci` and `npm run check`. Verify interactive changes in a browser and update the case's evidence record with the actual results.
- Keep each case independently understandable and executable; record every external dependency in `integrations.md`.
