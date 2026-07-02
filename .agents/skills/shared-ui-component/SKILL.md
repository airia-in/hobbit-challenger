---
name: shared-ui-component
description: Use when adding or changing reusable React components in packages/ui for the JainParichay template-jp monorepo, especially when component location, CVA variants, cn class merging, src/index.ts exports, React peer dependencies, tsup build behavior, or apps/web usage needs to stay aligned.
---

# Shared UI Component

## Overview

Use this skill to keep shared UI components small, reusable, and safe to consume from `apps/web`. Prefer the repo's current React library pattern over introducing a new component architecture.

## First Decide If It Belongs In packages/ui

Put a component in `packages/ui` only when it is a reusable primitive or cross-app building block. Keep it local to `apps/web` when it is tied to one page, one data shape, one route, tRPC calls, Astro content, or business copy.

If a request asks to put a domain-specific component into `packages/ui`, push back and recommend a local web component unless the component can be named and used without JainParichay-specific data or copy.

## Component Shape

Use the existing package layout:

```text
packages/ui/src/components/ComponentName/ComponentName.tsx
```

Use `PascalCase` for the folder, file, exported component, and props type. Keep component files self-contained unless there is real shared logic worth extracting.

Follow this pattern for Tailwind variants:

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../utils/cn';

const badgeVariants = cva('inline-flex items-center font-medium', {
  variants: {
    variant: {
      default: 'bg-slate-950 text-white',
      outline: 'border border-slate-300 text-slate-900',
    },
    size: {
      sm: 'h-6 px-2 text-xs',
      md: 'h-8 px-3 text-sm',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'md',
  },
});

export interface BadgeProps
  extends ComponentPropsWithoutRef<'span'>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size, className }))} {...props} />;
}
```

For button-like controls, mirror `packages/ui/src/components/Button/Button.tsx`: extend the correct native element attributes, preserve `disabled`, focus-visible, hover, and icon-size states, and let consumers pass `className`.

## Exports

Every public component must be exported from `packages/ui/src/index.ts`:

```ts
export { Badge } from './components/Badge/Badge';
export type { BadgeProps } from './components/Badge/Badge';
```

Do not import consumers from internal component paths. If a component is not ready to be public API, keep it unexported and do not use it from `apps/web`.

## Dependencies And Build Boundaries

Keep `react` and `react-dom` as peer dependencies and tsup externals. Do not move them to regular dependencies.

Use dependency categories deliberately:

- `dependencies`: runtime helpers bundled or resolved by the UI package, such as `class-variance-authority`, `clsx`, and `tailwind-merge`.
- `peerDependencies`: React singletons or host-owned UI runtimes that the app must provide.
- `devDependencies`: build tools, TypeScript, eslint, and type packages.

Prefer existing `catalog:` entries from `pnpm-workspace.yaml` for shared versions. Add new runtime dependencies only when the component cannot be implemented cleanly with current dependencies.

## Web Usage

Use package imports from web code:

```tsx
import { Badge, Button } from '@workspace-starter/ui';

export function ExampleActions() {
  return (
    <div className="flex items-center gap-3">
      <Badge variant="outline">Verified</Badge>
      <Button size="sm">Continue</Button>
    </div>
  );
}
```

For Astro pages, import from the package root too:

```astro
---
import { Button } from '@workspace-starter/ui';
---

<Button variant="default" size="lg">Create profile</Button>
```

Only add a `client:*` directive when the shared component or its children need browser interactivity. Do not import from `../../packages/ui/src/...` in `apps/web`.

`apps/web/tsconfig.json` already maps `@workspace-starter/ui` to `../../packages/ui/src/index.ts`, and `apps/web/astro.config.mjs` already includes `@workspace-starter/ui` in `optimizeDeps`. Do not edit those files for a normal new component.

## Tailwind class scanning

`apps/web` is the Tailwind entrypoint. Utilities used only in `packages/ui` are not emitted unless the UI package is registered in `apps/web/src/styles/global.css`:

```css
@source '../../../../packages/ui/src';
```

The path is relative to `apps/web/src/styles/` and needs **four** `../` segments to reach the monorepo root. After adding responsive utilities to shared components, rebuild web and confirm the utility appears in `apps/web/dist/client/_astro/*.css` when debugging missing styles.

## Quality Bar

- Keep shared components free of data fetching, routing, app-specific copy, and tRPC calls.
- Use accessible native elements first. For icon-only controls, require an accessible name.
- Preserve `className` passthrough and merge it with `cn`.
- Keep variants small and predictable. Avoid one-off visual states that only one page needs.
- Avoid adding a new design system layer until multiple components prove the need.
- Keep styling in Tailwind utilities and CVA; do not add CSS files unless the component truly cannot be expressed with existing styling tools.

## Verification

Run the narrowest checks that prove the changed surface:

```bash
pnpm --filter @workspace-starter/ui lint
pnpm --filter @workspace-starter/ui typecheck
pnpm --filter @workspace-starter/ui build
```

If `apps/web` consumes the component, also run:

```bash
pnpm --filter @workspace-starter/web typecheck
```

Run broader `pnpm typecheck` or `pnpm build` when exports, dependency graph, package manifests, or shared runtime behavior changed.
