# Security policy

## Supported versions

Only the latest published release receives security fixes. Fixes are developed
on the default branch before publication.

## Report a vulnerability

Do not post exploit details, credentials or private app sources in a public issue.
Use GitHub's [private vulnerability reporting form](https://github.com/elusivestudio/berthlint/security/advisories/new).
If the form is unavailable, open a public issue requesting a private reporting
channel without including sensitive details.

Include the affected tool version/commit, Node version, a minimal sanitized
reproduction, expected and actual behavior, and the potential impact. Reports
will be triaged by the maintainers; no response-time guarantee is currently made.
Ordinary inaccurate rule findings belong in the false-positive issue template.

## Trust boundaries

- Plugins are arbitrary JavaScript with the scanner user's permissions, not
  sandboxed rules. Use `--no-plugins` (Action input `no-plugins: "true"`) for
  untrusted PRs, even if a configured plugin is not referenced by an enabled rule.
- The scanner reads project files but does not execute Gradle, Xcode or app build
  scripts. This does not make it safe to run arbitrary package installation or
  build commands from an untrusted repository.
- Run untrusted scans in isolated, least-privilege jobs without secrets. Do not
  combine untrusted checkout contents with privileged `pull_request_target` jobs.
  Use trusted tool revisions, configuration and suppressions: an attacker able to
  alter those files can weaken the gate without executing a plugin.
- Review suppressions as release exceptions. Exact rule/file/message matches
  remove findings from reports and exit-code decisions; reasons are audit context,
  not proof that the underlying issue is safe.
- Reports can include paths, metadata and source-derived text. Review them before
  uploading artifacts or sharing them publicly.
- Offline static checks do not certify artifacts, compliance or store acceptance.
