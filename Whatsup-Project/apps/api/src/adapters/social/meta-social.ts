// Facebook + Instagram ad campaigns (Meta Marketing API — same account/token as WhatsApp
// Click-to-WhatsApp ads) and organic posts (Facebook Page feed / Instagram Graph API).
// Same honest pattern throughout: real API calls, clear thrown errors naming the exact
// missing env var when not configured, never a fabricated success.
import { hasMetaAdsCredentials, createClickToWhatsAppCampaign } from "../meta-ads.js";

const GRAPH_VERSION = "v20.0";

export function hasFacebookPageCredentials() {
  return !!(process.env.META_PAGE_ID && process.env.META_PAGE_ACCESS_TOKEN);
}
export function hasInstagramCredentials() {
  return !!(process.env.META_IG_USER_ID && process.env.META_PAGE_ACCESS_TOKEN);
}
export { hasMetaAdsCredentials as hasFacebookAdsCredentials, hasMetaAdsCredentials as hasInstagramAdsCredentials };

// Facebook/Instagram ads share the same Marketing API campaign object as WhatsApp CTWA —
// only the objective/placement differs, which is finished in Ads Manager same as WhatsApp.
export async function createMetaPlatformAdCampaign(name: string, dailyBudgetPaise: number) {
  return createClickToWhatsAppCampaign({ name, dailyBudgetPaise });
}

export async function publishFacebookPost(caption: string, mediaUrl?: string) {
  if (!hasFacebookPageCredentials()) {
    throw new Error("Facebook is not configured — set META_PAGE_ID and META_PAGE_ACCESS_TOKEN in apps/api/.env and restart whatsup-api");
  }
  const pageId = process.env.META_PAGE_ID!;
  const token = process.env.META_PAGE_ACCESS_TOKEN!;
  const endpoint = mediaUrl ? `photos` : `feed`;
  const params: Record<string, string> = mediaUrl
    ? { url: mediaUrl, caption, access_token: token }
    : { message: caption, access_token: token };
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Facebook Graph API error (${res.status})`);
  return { externalId: body.post_id ?? body.id };
}

export async function publishInstagramPost(caption: string, mediaUrl?: string) {
  if (!hasInstagramCredentials()) {
    throw new Error("Instagram is not configured — set META_IG_USER_ID and META_PAGE_ACCESS_TOKEN in apps/api/.env and restart whatsup-api");
  }
  if (!mediaUrl) throw new Error("Instagram posts require a media URL (image/video) — the Graph API has no text-only post type");
  const igUserId = process.env.META_IG_USER_ID!;
  const token = process.env.META_PAGE_ACCESS_TOKEN!;
  const createRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ image_url: mediaUrl, caption, access_token: token }),
  });
  const createBody = await createRes.json();
  if (!createRes.ok) throw new Error(createBody?.error?.message ?? `Instagram Graph API error (${createRes.status})`);
  const publishRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: createBody.id, access_token: token }),
  });
  const publishBody = await publishRes.json();
  if (!publishRes.ok) throw new Error(publishBody?.error?.message ?? `Instagram Graph API error (${publishRes.status})`);
  return { externalId: publishBody.id };
}
