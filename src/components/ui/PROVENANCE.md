# shadcn/ui component sources

These are actual shadcn/ui registry components, retrieved from the official MIT-licensed repository, not CSS lookalikes.

- Upstream: https://github.com/shadcn-ui/ui
- Registry: `apps/v4/registry/new-york-v4/ui/`
- Upstream HEAD recorded at retrieval: `30a58d4498f270af1c1e981a7d78a15cf5740841`
- Components: button, input, badge, separator, dialog, dropdown-menu, tabs, tooltip, command.
- Original MIT license: `LICENSE.shadcn` in this directory.
- Changes: local import paths and formatting; Button and DialogOverlay use `forwardRef` for the existing React 18 runtime. Application-specific layouts/styles live in `src/studio`, not in a replacement component library.
- Runtime primitives: Radix UI, cmdk, Lucide, class-variance-authority, clsx, tailwind-merge. Tailwind 4 is integrated through `@tailwindcss/vite`; `components.json` and the `@/` alias are configured.

The registry sources were obtained through the GitHub API because this sandbox's outbound allowlist excludes ui.shadcn.com. The standard shadcn CLI was not falsely reported as having run.
