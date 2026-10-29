# Developer Portfolio + Admin Dashboard

Node.js, Express, EJS, PostgreSQL, Prisma. Public portfolio, admin dashboard, four-level administrator hierarchy, encrypted password vault, image management, Railway-ready.

## What is built

- Public site: hero, about, skills, filterable projects, experience, contact form (honeypot + timing token + rate limit). All text is editable in the dashboard. Nothing is invented: until you fill it in, placeholders are shown.
- Navbar: Home, username dropdown (Profile, Dashboard, Sign out) with avatar or initials, animated theme toggle. Light and dark themes, system preference on first visit, saved per browser (and per account when signed in), no flash on load.
- Dashboard: collapsible sidebar, breadcrumbs, real statistics, search, pagination, confirmation dialogs, toasts, loading and empty states. Sections: Overview, Projects, Skills, Experience, Profile Settings, Social Links, Images and Media, Password Vault, Administrators, Contact Messages, Audit Logs, General Settings. Lists have reorder arrows where order matters.
- Roles (`src/services/permissions.js` is the single policy file): 1 Super Administrator, 2 Senior Administrator, 3 Administrator, 4 Junior Administrator.
- Vault: AES-256-GCM, key only in the environment, list never loads ciphertext, secrets decrypted one at a time on request, password re-confirmation (10 minutes) for every sensitive action, copy actions clear the clipboard after 30 seconds (best effort), audit log never contains secrets.
- Images are stored in PostgreSQL (`Media.data`), so they survive Railway redeploys without extra services. Limit 3 MB, JPEG/PNG/WebP/GIF verified by file signature, SVG rejected. Upside: zero setup. Downside: large galleries grow the database; move to S3/Cloudinary if that becomes a problem.

## Run locally

```bash
npm install
cp .env.example .env        # then fill in the three required values (see below)
npx prisma migrate deploy   # applies prisma/migrations to your local Postgres
npm run seed                # optional: starter skill names (no percentages)
ADMIN_USERNAME=owner ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm run create-admin
npm run dev                 # http://localhost:3000
npm test
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"          # VAULT_ENCRYPTION_KEY
```

On Windows PowerShell set the admin variables first: `$env:ADMIN_USERNAME="owner"; $env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="a-long-password"; npm run create-admin`.

## Deploy on Railway

1. Push this folder to a GitHub repository (`.env` is git-ignored).
2. Railway: New Project, Deploy from GitHub repo.
3. Add a database: New, Database, PostgreSQL.
4. In the web service, Variables:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `SESSION_SECRET` = generated value
   - `VAULT_ENCRYPTION_KEY` = generated 64-hex value
   - `NODE_ENV` = `production`
   - optional: `SENIOR_CAN_MANAGE_USERS=true`
5. Settings, Networking, Generate Domain. `railway.json` already sets the pre-deploy migration (`prisma migrate deploy`), start command and `/health` check. The app binds to `0.0.0.0:$PORT` and trusts Railway's HTTPS proxy.
6. Create the first Super Administrator once, from your machine, against the Railway database:
   `railway run npm run create-admin` (with `ADMIN_*` variables set in your shell), or set `ADMIN_*` temporarily in Railway, run it from the service shell, then delete `ADMIN_PASSWORD`.
7. Sign in at `/login`, open Profile Settings and fill in your real details.

**Back up `VAULT_ENCRYPTION_KEY`.** It exists only in your environment. If it is lost or changed, every saved vault password and note is permanently unrecoverable. The vault is server-side encrypted at rest, not end-to-end encrypted: the server can decrypt entries while you are signed in and unlocked.

## Permission matrix (defaults)

| Area | Super | Senior | Admin | Junior |
|---|---|---|---|---|
| Dashboard, view content | yes | yes | yes | yes |
| Projects / skills create + edit | yes | yes | yes | no |
| Projects / skills delete | yes | yes | no | no |
| Experience, social links edit | yes | yes | no | no |
| Images upload | yes | yes | yes | no |
| Images delete | yes | yes | no | no |
| Contact messages | yes | yes | view + process | no |
| Profile Settings (public bio) | yes | yes | no | no |
| Audit logs | yes | yes | no | no |
| View administrators | yes | yes | no | no |
| Manage administrators | L2-L4 | L3-L4 only if `SENIOR_CAN_MANAGE_USERS=true` | no | no |
| General Settings, Password Vault | yes | no | no | no |

Rules enforced on the server: you can only manage accounts strictly below you, never yourself or a peer, nobody can create a Super Administrator from the dashboard (use the script), role/status/password changes sign the target out everywhere, and the last-level check uses the stored account, never submitted data. "Assigned projects" for Junior Administrators is not implemented; they get read-only access. Edit the matrix in `src/services/permissions.js`.

## Security notes

bcrypt (cost 12), 12-character minimum, lockout after 5 failures for 15 minutes, session fixation protection, PostgreSQL-backed sessions (HttpOnly, SameSite=Lax, Secure in production), CSRF token on every state-changing request, Helmet with strict CSP (no inline scripts, no third-party scripts), rate limits (login, contact, vault, general), Prisma parameterised queries, EJS output escaping, uploads verified by magic bytes, audit log without secrets, generic error pages in production.

## Layout

`src/` app code (controllers, middleware, services, validators), `views/` EJS, `public/` css + js, `prisma/` schema, migration, seed, `scripts/create-admin.js`, `tests/`.

## Known limitations

- The migration SQL in `prisma/migrations/20261028000000_init` was written by hand to match `schema.prisma`. If `prisma migrate deploy` or `prisma migrate dev` reports drift, delete the `prisma/migrations` folder and run `npx prisma migrate dev --name init` once against an empty local database, then commit the result.
- No email notifications for contact messages; they appear in the dashboard inbox.
- The contact form's spam protection is a honeypot, timing token and rate limit, not a CAPTCHA.
