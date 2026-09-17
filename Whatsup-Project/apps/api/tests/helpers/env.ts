// Vitest does not read .env on its own. This runs before every test file so the
// integration tests find DATABASE_URL, JWT_SECRET and LICENSE_SIGNING_SECRET exactly
// the way the server does.
import "dotenv/config";

process.env.NODE_ENV ??= "test";
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.LICENSE_SIGNING_SECRET ??= "test-license-secret";
