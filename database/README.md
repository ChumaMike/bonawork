# database

Owner: **Backend team**.

Schema (`schema.ts`, Drizzle ORM) and migrations. Rows must parse with the schemas in `@/shared`
(`docs/INTERFACES.md`). Case events are append-only: no update, no delete (only the ledger
receipt is attached once a write is anchored).

## Drivers

| `DATABASE_URL` | Driver                                | Where                                                                           |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| set            | Postgres via `postgres` (postgres-js) | Neon on Vercel                                                                  |
| unset          | PGlite (Postgres in WASM)             | `.data/pglite` locally (`PGLITE_DATA_DIR`), in memory under test and on Vercel |

One `Db` type (`src/server/db`) serves both. Migrations are applied automatically at startup and
the demo seed (`src/server/seed`) runs when the `institutions` table is empty.

## Changing the schema

```bash
# edit database/schema.ts, then
pnpm db:generate   # drizzle-kit generate + bundle into migrations/bundle.ts
pnpm test
```

`migrations/bundle.ts` is generated: it embeds the SQL so the app needs no file-system access at
runtime (serverless bundles, PGlite in tests). Commit the `.sql`, `meta/` and `bundle.ts` together.
