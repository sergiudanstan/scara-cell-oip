# Contributing

Contributions are welcome. This is a single-maintainer project, so please open an issue
before starting anything substantial.

**Security problems do not belong in issues.** Follow [SECURITY.md](SECURITY.md).

## Branches, pull requests and releases

- `main` is the only long-lived branch and is protected: changes land through a pull
  request with the required checks green, commits on `main` are signed, and force-pushes
  are refused. Pull requests are squash-merged; GitHub deletes the branch on merge.
- Branch names: `<type>/<topic>` (`feat/`, `fix/`, `docs/`, `chore/`, `release/`);
  agents use `agent/<name>/<topic>`.
- The version lives in one place, `version` in `package.json`. A release is a pull request that bumps it and moves
  `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) to a dated version. After it merges, a signed `vX.Y.Z` tag on that
  commit triggers `release.yml`, which refuses to run if the tag, `package.json` and the changelog disagree. Tags are
  never moved or deleted.

## Running it locally

The cell is an OIP project folder, and its checks run in OIP's own headless tooling. Use the pinned commit
(`7ed2b7d`, see the README), or set `OIP=` to another checkout:

```bash
git clone https://github.com/Open-Industry-Project/Open-Industry-Project ../oip
git -C ../oip checkout 7ed2b7dbf01835365ba3432bbdd84d933a843dde
(cd ../oip && npm ci --ignore-scripts)

P=$PWD                                   # this repository
export OIP=$P/../oip
cd $OIP
npm run check-part -- $P/parts/scara.transfer-robot
npm run validate-project -- $P --strict
npm run check-st -- $P/plc
npm run check-wiring -- $P --strict
npm run check-layout -- $P
npm run test-project -- $P
zsh $P/tools/perturb.sh                  # the tests must FAIL on mutated programs
node $P/tools/check_kin.mjs             # kinematics: loop closure and joint range
```

The page smoke test needs Google Chrome (`PW_CHANNEL=chromium` for Playwright's own Chromium):

```bash
cd $P && npm ci --ignore-scripts
zsh tools/build_site.sh _build/site       # uses $OIP
node tests/site-smoke.mjs _build/site
```

A change to `plc/program.st`, a part or the scene must keep every project test passing, and `tools/perturb.sh` must
still fail on its mutants.
