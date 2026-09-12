// LinkedIn — ads via the Marketing API, organic posts via the UGC Posts API. Same honest
// pattern: real calls when configured, a clear thrown error naming the missing env vars.
export function hasLinkedInAdsCredentials() {
  return !!(process.env.LINKEDIN_AD_ACCOUNT_ID && process.env.LINKEDIN_ACCESS_TOKEN);
}
export function hasLinkedInPostCredentials() {
  return !!(process.env.LINKEDIN_ORG_URN && process.env.LINKEDIN_ACCESS_TOKEN);
}

export async function createLinkedInAdCampaign(name: string, dailyBudgetPaise: number) {
  if (!hasLinkedInAdsCredentials()) {
    throw new Error("LinkedIn Ads is not configured — set LINKEDIN_AD_ACCOUNT_ID and LINKEDIN_ACCESS_TOKEN in apps/api/.env and restart whatsup-api");
  }
  const res = await fetch("https://api.linkedin.com/rest/adCampaigns", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
      "content-type": "application/json",
      "LinkedIn-Version": "202401",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      account: `urn:li:sponsoredAccount:${process.env.LINKEDIN_AD_ACCOUNT_ID}`,
      name,
      type: "SPONSORED_UPDATES",
      status: "DRAFT",
      dailyBudget: { amount: String(Math.round(dailyBudgetPaise / 100)), currencyCode: "INR" },
      costType: "CPM",
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn Marketing API error (${res.status}): ${await res.text()}`);
  const location = res.headers.get("x-linkedin-id") ?? res.headers.get("location");
  return { id: location ?? "unknown" };
}

export async function publishLinkedInPost(caption: string) {
  if (!hasLinkedInPostCredentials()) {
    throw new Error("LinkedIn posting is not configured — set LINKEDIN_ORG_URN and LINKEDIN_ACCESS_TOKEN in apps/api/.env and restart whatsup-api");
  }
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
      "content-type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: process.env.LINKEDIN_ORG_URN,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: caption },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? `LinkedIn UGC API error (${res.status})`);
  return { externalId: body.id ?? res.headers.get("x-restli-id") };
}
