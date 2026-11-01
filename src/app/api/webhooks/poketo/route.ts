import { handlePoketoWebhook } from "@/server/domain/poketo-webhook";

// Node.js runtime: the default, and `export const runtime` is rejected with cacheComponents.
// The handler reads the raw body itself: the HMAC must cover the exact bytes Poketo sent.
export async function POST(request: Request) {
  return handlePoketoWebhook(request);
}
