// Twitter/X — ads via the X Ads API, organic posts via X API v2. Same honest pattern:
// real calls when configured, a clear thrown error naming the missing env vars otherwise.
export function hasTwitterAdsCredentials() {
  return !!(process.env.TWITTER_ADS_ACCOUNT_ID && process.env.TWITTER_ADS_BEARER_TOKEN);
}
export function hasTwitterPostCredentials() {
  return !!process.env.TWITTER_ACCESS_TOKEN;
}

export async function createTwitterAdCampaign(name: string, dailyBudgetPaise: number) {
  if (!hasTwitterAdsCredentials()) {
    throw new Error("Twitter/X Ads is not configured — set TWITTER_ADS_ACCOUNT_ID and TWITTER_ADS_BEARER_TOKEN in apps/api/.env and restart whatsup-api");
  }
  const accountId = process.env.TWITTER_ADS_ACCOUNT_ID!;
  const res = await fetch(`https://ads-api.x.com/12/accounts/${accountId}/campaigns`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.TWITTER_ADS_BEARER_TOKEN}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      name,
      funding_instrument_id: process.env.TWITTER_ADS_FUNDING_INSTRUMENT_ID ?? "",
      daily_budget_amount_local_micro: String(Math.round((dailyBudgetPaise / 100) * 1_000_000)),
      entity_status: "PAUSED",
      standard_delivery: "true",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.errors?.[0]?.message ?? `X Ads API error (${res.status})`);
  return { id: body.data?.id };
}

export async function publishTweet(caption: string) {
  if (!hasTwitterPostCredentials()) {
    throw new Error("Twitter/X posting is not configured — set TWITTER_ACCESS_TOKEN (OAuth2 user token with tweet.write scope) in apps/api/.env and restart whatsup-api");
  }
  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.TWITTER_ACCESS_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text: caption }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.detail ?? body?.title ?? `X API error (${res.status})`);
  return { externalId: body.data?.id };
}
