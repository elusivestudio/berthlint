# Releasing Berthlint

Use the reviewed package version for the release tag and npm publication. The
commands below show the `0.1.3` release.

## Validate

```sh
npm ci
npm run docs
npm run check
npm run smoke:package
npm publish --dry-run
```

Review the tarball contents, policy verification dates, changelog, security
policy and README. Never include credentials or private app scan inputs.

## Publish 0.1.3 with provenance

Provenance is generated in supported CI, not from an ordinary local `npm publish`.
The manual [publish workflow](../.github/workflows/publish.yml) uses GitHub Actions
OIDC (`id-token: write`) and `npm publish --provenance --access public`.
See npm's [provenance prerequisites](https://docs.npmjs.com/generating-provenance-statements/)
and [trusted publishing requirements](https://docs.npmjs.com/trusted-publishers/).
Trusted publishing needs npm 11.5.1+; the workflow uses Node 24, whose bundled npm
supports it.

1. A maintainer needs npm permission to publish the unscoped `berthlint` package.
   The workflow supports npm trusted publishing configured for this repository
   and `publish.yml`, or the repository Actions secret `NPM_TOKEN`. Never commit
   or paste a token into an issue.
2. Commit and push the reviewed changes, including the publish workflow, to the
   default branch. Before tagging, update the README, security policy and
   changelog for the intended released state. Do not claim publication until the
   registry confirms it.
3. Create and push a reviewed `v0.1.3` tag matching the package version.
4. Dispatch the workflow against that tag (the workflow must also exist on the
   default branch):

   ```sh
   gh workflow run publish.yml --ref v0.1.3
   ```

5. Confirm the workflow succeeds, then verify the registry entry and provenance:

   ```sh
   npm view berthlint@0.1.3 version dist.attestations
   npx --yes berthlint@0.1.3 --version
   ```

6. Confirm the tagged Action can scan a consumer fixture before announcing it.
   Consumers can then use `elusivestudio/berthlint@v0.1.3` without a separate tool
   checkout, or pin the reviewed tag's full commit SHA.

Publishing and tagging are maintainer actions, not side effects of local
validation. No credentials, tags, GitHub releases or npm packages are created by
`npm run check`, `npm run smoke:package` or the dry run.

## Announcement gate

Before announcing, run additional read-only scans with `--no-plugins` on pinned
public inputs. Record tool and input commit IDs, dirty status, Node version,
exact command/configuration/suppressions, policy snapshot, timestamp and exit
code, along with raw text/JSON and separate human triage. Do not equate findings
with confirmed upstream defects or store rejection.
See [existing validation evidence](./release-validation.md) and
[capture limitations](../results/README.md#provenance-and-limits).
