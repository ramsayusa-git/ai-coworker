// Google Ads — real Google Ads API call. No organic-post equivalent (Google has no
// organic social feed), so this adapter only covers ad campaigns. Same honest pattern.
export function hasGoogleAdsCredentials() {
  return !!(process.env.GOOGLE_ADS_CUSTOMER_ID && process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_ACCESS_TOKEN);
}

export async function createGoogleAdCampaign(name: string, dailyBudgetPaise: number) {
  if (!hasGoogleAdsCredentials()) {
    throw new Error(
      "Google Ads is not configured — set GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN, and GOOGLE_ADS_ACCESS_TOKEN in apps/api/.env and restart whatsup-api"
    );
  }
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!;
  // A real campaign also requires a linked Budget resource created first; we create that
  // budget resource then the campaign in one mutate call via the campaignBudgets service.
  const budgetRes = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/campaignBudgets:mutate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GOOGLE_ADS_ACCESS_TOKEN}`,
      "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      operations: [{ create: { name: `${name}-budget`, amountMicros: String(dailyBudgetPaise * 10000), deliveryMethod: "STANDARD" } }],
    }),
  });
  const budgetBody = await budgetRes.json();
  if (!budgetRes.ok) throw new Error(budgetBody?.error?.message ?? `Google Ads API error (${budgetRes.status})`);
  const budgetResourceName = budgetBody.results?.[0]?.resourceName;

  const campaignRes = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/campaigns:mutate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GOOGLE_ADS_ACCESS_TOKEN}`,
      "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      operations: [{ create: { name, status: "PAUSED", advertisingChannelType: "SEARCH", campaignBudget: budgetResourceName } }],
    }),
  });
  const campaignBody = await campaignRes.json();
  if (!campaignRes.ok) throw new Error(campaignBody?.error?.message ?? `Google Ads API error (${campaignRes.status})`);
  return { id: campaignBody.results?.[0]?.resourceName };
}
