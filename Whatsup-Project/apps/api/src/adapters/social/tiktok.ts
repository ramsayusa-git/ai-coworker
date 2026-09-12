// TikTok — ads via the Marketing API, organic posts via the Content Posting API. Same
// honest pattern: real calls when configured, a clear thrown error otherwise.
export function hasTikTokAdsCredentials() {
  return !!(process.env.TIKTOK_ADVERTISER_ID && process.env.TIKTOK_ACCESS_TOKEN);
}
export function hasTikTokPostCredentials() {
  return !!(process.env.TIKTOK_OPEN_ID && process.env.TIKTOK_ACCESS_TOKEN);
}

export async function createTikTokAdCampaign(name: string, dailyBudgetPaise: number) {
  if (!hasTikTokAdsCredentials()) {
    throw new Error("TikTok Ads is not configured — set TIKTOK_ADVERTISER_ID and TIKTOK_ACCESS_TOKEN in apps/api/.env and restart whatsup-api");
  }
  const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/campaign/create/", {
    method: "POST",
    headers: { "Access-Token": process.env.TIKTOK_ACCESS_TOKEN!, "content-type": "application/json" },
    body: JSON.stringify({
      advertiser_id: process.env.TIKTOK_ADVERTISER_ID,
      campaign_name: name,
      objective_type: "ENGAGEMENT",
      budget_mode: "BUDGET_MODE_DAY",
      budget: Math.round(dailyBudgetPaise / 100),
      operation_status: "DISABLE",
    }),
  });
  const body = await res.json();
  if (!res.ok || body.code !== 0) throw new Error(body?.message ?? `TikTok Marketing API error (${res.status})`);
  return { id: body.data?.campaign_id };
}

export async function publishTikTokPost(caption: string, mediaUrl?: string) {
  if (!hasTikTokPostCredentials()) {
    throw new Error("TikTok posting is not configured — set TIKTOK_OPEN_ID and TIKTOK_ACCESS_TOKEN in apps/api/.env and restart whatsup-api");
  }
  if (!mediaUrl) throw new Error("TikTok posts require a video URL — the Content Posting API has no text-only post type");
  const res = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      post_info: { title: caption, privacy_level: "SELF_ONLY" },
      source_info: { source: "PULL_FROM_URL", video_url: mediaUrl },
    }),
  });
  const body = await res.json();
  if (!res.ok || body?.error?.code !== "ok") throw new Error(body?.error?.message ?? `TikTok Content Posting API error (${res.status})`);
  return { externalId: body.data?.publish_id };
}
