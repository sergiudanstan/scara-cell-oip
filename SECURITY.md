# Security Policy

This repository is a simulation project for [Open Industry Project](https://openindustryproject.org) (OIP): two floor-pedestal 4-axis SCARA robots transferring cartons in parallel to a shared outfeed belt, with its PLC program and tests.
It has no server, no accounts and no backend of its own. What users run is either OIP's editor (open this repository as
an OIP project, or import `dist/scara-cell.scene.json`) or the GitHub Pages site, which is OIP's editor built from a pinned
upstream commit with this cell loaded on start (`tools/build_site.sh`, `site/`). The site is published by hand to the
`gh-pages` branch; no workflow here deploys it.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Current |

Single maintainer; only the latest release receives fixes.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** Report it privately:
**[Report a vulnerability](https://github.com/sergiudanstan/scara-cell-oip/security/advisories/new)**
(Security, Advisories, Report a vulnerability).

| Stage | Target |
|---|---|
| Acknowledgement | within 3 business days |
| Triage | within 10 business days |
| Fix, or a documented decision not to fix | within 90 days |

These are best-effort targets from a single unpaid maintainer, not a contractual SLA.
There is no bug bounty; credit is offered in the advisory and changelog.

## Scope

In scope, because it is code or data this repository ships:

- The robot part `parts/scara.transfer-robot/behavior.js` and the other part behaviors under `parts/`, and the PLC program
  `plc/program.st`. OIP runs part behaviors as code inside its own sandbox; a part or scene in this repository that
  does something other than simulate the cell is a vulnerability here.
- `dist/scara-cell.scene.json`, the one-file scene offered for Import Project, and `scene.json` / `project.json`: a file
  that does not match what the build scripts produce.
- `site/autoload.js` and `site/base-shim.js`, which run on the published page, and the built site on `gh-pages`:
  script injection, or the page loading code from an origin other than its own. When the editor starts it also
  requests OIP's official part library at `parts.openindustryproject.org`; that request was observed in the site
  smoke test, and the editor, not this repository, decides what it does with the answer.
- The workflows: anything that could publish a release not built from `main`.

Out of scope:

- Vulnerabilities in the OIP editor, its simulation worker or its dependencies. Report those to
  [Open Industry Project](https://github.com/Open-Industry-Project/Open-Industry-Project/security). This repository
  pins one upstream commit (`7ed2b7d`) and has not audited it.
- Simulation accuracy, and anything about real machines. The E-stop, interlocks and robot are simulated and nothing
  here is validated on hardware or is a safety function. A wrong result is a correctness bug: file a normal issue.

## Supply chain

CI runs OIP's own checks and project tests, a smoke test of the built site, `pip-audit` on the hash-pinned CI toolchain,
`npm audit` on the test tooling, CodeQL and `zizmor` on the workflows. Actions are pinned to full commit SHAs and kept
current by Dependabot. The OIP checkout used in CI is pinned to a commit SHA and installed from OIP's lockfile with
install scripts disabled; its dependency tree is not itself audited here. Releases attach a source archive with Sigstore
build provenance:

```
gh attestation verify scara-cell-oip-v0.1.0.tar.gz --repo sergiudanstan/scara-cell-oip
```
