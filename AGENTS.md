# Working in this repository

- Read `docs/case-standard.md` before changing a case or adding one.
- Keep public business documentation in Chinese; IDs and filenames use lowercase kebab-case.
- Organize cases as `examples/<serviceModel>/<domain>/<case-id>/`: choose one service model from `catalog/service-models.json` and one domain belonging to that model from `catalog/domains.json`. Use tags for cross-domain discovery; do not create empty case directories.
- Case manifests use version 3 and declare `serviceModel`, `blueprintId`, `variantId` and `caseKind`. Keep manifest, catalog path, links and workspace paths consistent when moving a case. Classify the target application, platform or infrastructure capability independently of deployment and data providers.
- Reuse a standard blueprint and scenario variant from `catalog/blueprints.json` and `catalog/variants.json`. Reference designs and runnable reference implementations are distinct from real project cases; do not inflate case counts or claim customer delivery without published, redacted evidence.
- Update the manifest, catalog entry and evidence together when changing delivery status.
- Preserve the distinction between mock, unavailable and connected capabilities. Never label a simulated model output as real generation.
- Use synthetic fixtures. Do not include private conversations, client identities, signed media URLs, credentials or real-person source footage.
- Reuse ByteFolk components and framework contracts where appropriate; declare actual dependencies instead of implying an integration exists.
- Run `npm ci` and `npm run check`. Verify interactive changes in a browser and update the case's evidence record with the actual results.
- Keep each case independently understandable and executable; record every external dependency in `integrations.md`.
