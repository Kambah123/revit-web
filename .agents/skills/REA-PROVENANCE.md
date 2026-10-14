# REA skill provenance

`reverse-engineer-anything/` contains the unmodified skill and reference files bundled with the official npm package `rea-agents@6.4.0`, published from https://github.com/morluto/rea.

- Installed/retrieved: 2026-10-13.
- Skill metadata: version `37`, tool count `170`.
- Package npm integrity: `sha512-Vj1zWfSlna5bphGoaoI/TcVBuYvze9u+OyPC3Shz8YkBqaCTqB4COnnRoX7XDwMpwI24ZlFEel2yEj0k8LTWEQ==`.
- The package's MIT `LICENSE` is included alongside the skill. Copyright remains with the upstream author.
- `rea setup --skill=true --yes` installed the home-directory copy; this matching copy is retained in the repository for future agents and fresh checkouts.
- The executable is installed separately, not as an application dependency. This directory does not activate MCP or install native analysis engines.
- Skill documentation is guidance, not evidence that a capability ran or that all prerequisites are available. Inspect actual CLI schemas and retain tool limitations.

See [the installation/use record](../../docs/research/synaps/REA.md) for the exact commands, partial analysis result and research boundaries. When updating, pin the package version and replace the skill plus references together after reviewing the change; do not silently mix a newer `main` skill with an older CLI.
