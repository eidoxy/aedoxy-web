/**
 * Runs before every test file. Pins the environment so tests never reach the
 * dev database (`aedoxy`), real Poketo or a real New API: the app database URL
 * becomes DATABASE_URL_TEST (or stays unset) and integrations get fake hosts.
 * Values below are dummy test constants, not secrets.
 */
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
else delete process.env.DATABASE_URL;

process.env.ENV_STRICT = "false";
// Dummy provider credentials so the social providers exist; the tests answer the provider HTTP calls themselves.
process.env.GITHUB_CLIENT_ID = "gh-test-id";
process.env.GITHUB_CLIENT_SECRET = "gh-test-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://aedoxy.test";
process.env.POKETO_BASE_URL = "http://poketo.test/api/v1";
process.env.POKETO_SECRET_KEY = "sk_test_unit";
process.env.POKETO_WEBHOOK_SECRET = "whsec_unit";
process.env.NEWAPI_INTERNAL_URL = "http://newapi.test";
process.env.NEWAPI_BRIDGE_TOKEN = "bridge-test-token";
