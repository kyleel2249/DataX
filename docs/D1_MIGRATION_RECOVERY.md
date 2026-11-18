# DataX D1 migration recovery

## Use the repository's D1 configuration explicitly

The production D1 binding is defined in the repository-root `wrangler.toml`:

- Binding: `DATA_DB`
- Database: `datax-db`
- Database ID: `68383689-3265-4e14-8bbe-f418d5ca8fce`
- Migrations directory: `migrations`

If Wrangler reports that it cannot find `datax-db` in `wrangler.jsonc`, a local `wrangler.jsonc` is being selected instead of the repository configuration. Do not create another database or edit the production database ID. Run commands from the DataX repository root and explicitly select the tracked TOML file:

```powershell
npx wrangler --config .\wrangler.toml d1 migrations list datax-db --remote
```

## Important production recovery warning

The production database already contains application tables. The D1 `d1_migrations` table must be reconciled with the live schema before applying the full migration directory. An empty migration history does **not** mean the database is empty.

Do not run `d1 migrations apply` against production until the schema audit confirms which earlier migrations have already been represented in the live database. In particular, migrations 0003 and 0004 contain `ALTER TABLE` statements that are not safe to replay against an already-upgraded schema.

After a verified migration baseline has been established, apply pending migrations with:

```powershell
npx wrangler --config .\wrangler.toml d1 migrations apply datax-db --remote
```

Then verify:

```powershell
npx wrangler --config .\wrangler.toml d1 migrations list datax-db --remote
```

## ETI integration migrations

The ETI integration depends on migrations:

- `0005_auth_rate_limits.sql` — authentication rate-limit storage.
- `0006_eti_integration_nonces.sql` — replay protection for signed ETI requests.

Both must be present in the production D1 schema before authenticated ETI summary requests can succeed. Do not mark a migration as applied unless its SQL has been successfully executed and its expected table and index have been verified.

## Windows shutdown assertion

If the correct configuration is loaded and Wrangler completes its operation but Node subsequently prints a libuv `UV_HANDLE_CLOSING` assertion, treat that as a separate Node/Windows process-shutdown issue. First capture the Wrangler command's actual exit code and migration result; do not mistake the shutdown assertion for proof that the migration failed or succeeded.
