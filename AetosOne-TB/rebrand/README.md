# Aetos One Cloud — ThingsBoard CE rebrand

Local build of **ThingsBoard CE v4.3.1**, rebranded as **Aetos One Cloud**.

| | |
|---|---|
| Repo | `../thingsboard` (upstream tag `v4.3.1`) |
| Brand assets | `../logo-work` |
| Primary colour | `#273A80` (navy) |
| Accent colour | `#E6701C` (orange) |
| Database | PostgreSQL 18, db `thingsboard`, user/pass `postgres` / `postgres` |
| JDK | OpenJDK 17 (`/usr/lib/jvm/java-17-openjdk-amd64`) |
| Node | v22.18.0, downloaded by `frontend-maven-plugin` into `ui-ngx/target/node` |

## Scripts

| Script | What it does |
|---|---|
| `gen_assets.py` | Rebuilds the UI logo SVGs, favicon and PWA icons from `logo-work/` |
| `rebrand.sh` | Applies all text / colour / metadata rebranding (idempotent) |
| `install-db.sh` | Drops and recreates the schema, loads demo data |
| `run-backend.sh` | Runs the platform on `http://localhost:8080` |
| `run-ui-dev.sh` | Angular dev server with hot reload on `http://localhost:4200` |

## First run

```bash
cd .../AetosOne-TB/thingsboard
unset NODE_ENV                    # see gotcha below
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
mvn install -DskipTests

cd ../rebrand
./install-db.sh                   # one time only
./run-backend.sh                  # leave running
./run-ui-dev.sh                   # in a second terminal
```

Default logins: `sysadmin@thingsboard.org / sysadmin`, `tenant@thingsboard.org / tenant`.

## Logo and login page

The circular badge (`logo-work/AetosOne_badge.jpg`) is the mark used everywhere in
the UI chrome. `gen_assets.py` knocks out every near-white pixel, which makes both
the outer background and the interior disc transparent; the small white dots inside
the shield become holes, so they read as toolbar-coloured nodes against the white
shield. Navy artwork is recoloured white for dark surfaces, orange is preserved.

Favicons and PWA icons deliberately keep the **opaque** white disc — a transparent
interior makes the navy shield vanish on dark browser tab bars, and maskable icons
are required to be opaque.

The login page has a full-bleed animated mesh backdrop
(`modules/login/components/network-background.component.ts`): drifting nodes linked
by fading lines, plus twinkling stars, over a deep-navy gradient. It runs outside
Angular's zone so the 60 fps loop never triggers change detection, pauses on tab
hide, and draws a single static frame when `prefers-reduced-motion` is set. Speed is
tunable via the `driftSpeed` and `twinkleSpeed` inputs.

## Per-tenant white labeling

Branding resolves platform → tenant. A tenant stores only the fields it changed;
anything left blank falls through to the platform default.

Stored in `admin_settings` under keys `whiteLabelParams` / `loginWhiteLabelParams`,
scoped by `tenant_id` (CE already supports tenant-scoped admin settings).

| Endpoint | Who | Purpose |
|---|---|---|
| `GET /api/noauth/whiteLabel/loginWhiteLabelParams` | anyone | Login page branding, tenant chosen by request host name |
| `GET /api/whiteLabel/whiteLabelParams` | any user | Effective branding for the signed-in tenant |
| `GET /api/whiteLabel/currentWhiteLabelParams` | sysadmin / tenant admin | Raw overrides at the caller's own level, for the settings form |
| `POST /api/whiteLabel/whiteLabelParams` | sysadmin / tenant admin | Save |
| `DELETE /api/whiteLabel/whiteLabelParams` | sysadmin / tenant admin | Clear overrides, revert to inherited |

Run `python3 verify_white_labeling.py` to prove isolation: it creates a second
tenant, gives the two different branding, and asserts each sees only its own.

### How runtime re-theming works

Angular Material compiles the palette into thousands of `--mat-*` declarations
spread across ~58 selectors, so there is no single variable to flip. On branding
change, `WhiteLabelingService` walks the loaded stylesheets once, collects every
declaration mentioning a default brand colour, and re-emits just those with the
tenant's colours substituted, appended last so it wins the cascade.

Consequence: `DEFAULT_PRIMARY_COLOR` / `DEFAULT_ACCENT_COLOR` in
`shared/models/white-labeling.models.ts` **must** stay in sync with
`scss/constants.scss`. If they drift, re-theming silently stops matching.

Known limitation: contrast text is not recalculated, so a very light primary
colour will leave white-on-light text. Pick dark brand colours, or extend
`applyPalette` to derive contrast.

### Settings UI

**Settings → White labeling** (`/settings/white-labeling`), visible to both sysadmin and
tenant admin. Sysadmin edits the platform defaults, tenant admin edits its own overrides —
the controller picks the record from the caller's authority, so the same page serves both.

Blank fields mean *inherit*: the form sends `null` rather than an empty string, and the
tenant view shows "Inheriting logo" placeholders plus a **Revert to inherited** action that
deletes the tenant record outright.

Logos and favicons are stored as data URLs inside the params JSON, capped at 512 KB —
they are inlined into every page load, so large files would cost every request.

## SUPER_ADMIN

`Authority.SUPER_ADMIN` ranks above `SYS_ADMIN` and is the platform root. Seeded as
`superadmin@aetosone.cloud` / `superadmin` — but only on a **fresh** install, so on an
existing database run `verify_super_admin.py`, which creates and activates it.

The trick that keeps this cheap: `SecurityUser.getAuthorities()` grants a super admin
*both* SUPER_ADMIN and SYS_ADMIN, so every existing `hasAuthority('SYS_ADMIN')` annotation
admits it with no edit. The frontend auth guard does the same.

What did need changing were the ~20 places comparing `getAuthority() == Authority.SYS_ADMIN`
directly — an exact enum match excludes SUPER_ADMIN. Those now call
`Authority.isSystemAdmin()`. **Use that helper for any new "is this a system user?" check**;
a direct comparison will silently lock out super admins.

Run `python3 verify_super_admin.py` to confirm the authority, access to a SYS_ADMIN-only
endpoint, and that it edits platform rather than tenant branding.

## RBAC

See `RBAC-DESIGN.md` — a proposal, not yet implemented. It needs three decisions before
coding starts (nested sub-customers, list-filtering approach, and whether platform roles
reach into tenant data).

## Gotcha: `NODE_ENV=production`

This machine exports `NODE_ENV=production` globally. Yarn then silently skips
**devDependencies**, so `@angular/cli` never installs and the `ui-ngx` module fails with
`Cannot find module '.../@angular/cli/bin/ng'`. Always `unset NODE_ENV` before building,
or install with `yarn install --production=false`.

## Re-applying the rebrand after an upstream bump

```bash
cd ../thingsboard && git fetch --tags && git checkout <new-tag>
cd ../rebrand && python3 gen_assets.py && ./rebrand.sh
```

Then re-check the two hand-edited theme files for upstream conflicts:

- `ui-ngx/src/scss/constants.scss` — `$tb-primary-color` / `$tb-secondary-color` / `$tb-hue3-color`
- `ui-ngx/src/theme.scss` — `$tb-mat-indigo` navy scale and the custom `$tb-mat-aetos-orange`
  palette that replaces `mat.$m2-deep-orange-palette`

## What was rebranded

- Browser tab title, `appTitle`, favicon (`aetosone.ico`), apple-touch-icon, web manifest, theme-color
- Toolbar + login logos (`assets/logo_title_white.svg`, `assets/logo_white.svg`), plus new
  full-colour variants for light backgrounds
- Loading-spinner colour, Angular Material primary + accent palettes, and every hardcoded
  `#305680` in the UI source
- All 30 locale bundles, home-page seed dashboards
- Transactional email templates (`application/src/main/resources/templates/*.ftl`)
- Swagger / REST API docs metadata in `thingsboard.yml`
- 2FA authenticator issuer name

Apache-2.0 licence headers and `org.thingsboard` package names were deliberately **left alone** —
changing them would break the build and violate the licence.
