# Repository Guidelines

Next.js 16 application (App Router) with React 19, TypeScript 5, and Tailwind CSS 4. Package manager is npm. Fresh scaffold with no custom business logic yet.

## Hard Rules

- Do not install a CSS-in-JS library — use Tailwind utilities or `globals.css`
- Do not add `pages/` directory — this project uses App Router exclusively
- Keep `public/` for truly static files only; co-locate assets with components when possible

## Project Structure

```
src/app/          — App Router pages and layouts (file-based routing)
public/           — static assets served at /
context/          — project context docs (PRD, tech-stack, change logs)
```

All source lives under `src/`. The path alias `@/*` maps to `./src/*` (see `@tsconfig.json`). Next.js configuration lives in `@next.config.ts`.

## Coding Style & Naming

- Tailwind CSS 4 via PostCSS — utility classes in JSX, no separate CSS modules
- Components use PascalCase filenames; route segments use lowercase directories
- Prefer named exports for components; default export only for page/layout route files
- Lint/type rules enforced by `@eslint.config.mjs` and `@tsconfig.json`

## Build, Test, and Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (Turbopack) at localhost:3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint check (flat config) |

No test runner configured yet; when adding one, prefer Vitest with React Testing Library.

## Commit Conventions

Adopt short imperative summaries (e.g. "Add user profile page"). No enforced prefix convention yet.
