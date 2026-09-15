export type Direction = "in" | "out";
export type MsgStatus = "sent" | "delivered" | "read" | "failed";
export type ConvStatus = "open" | "pending" | "snoozed" | "resolved";

export interface Contact {
  id: string;
  name: string;
  phone: string;
  tags: string[];
}

export interface Message {
  id: string;
  conversationId: string;
  direction: Direction;
  body: string;
  status: MsgStatus;
  createdAt: string;
  // text | interactive | template | button_reply | list_reply | flow_reply | product
  msgType?: string;
  // Outbound: the interactive spec that was sent. Inbound: the structured reply payload.
  interactive?: Record<string, any> | null;
}

export interface Conversation {
  id: string;
  contact: Contact;
  channel: { id: string; name: string; provider: "meta" | "whapi" };
  status: ConvStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  assignedTeamId: string | null;
  unread: number;
  lastMessage: string;
  lastMessageAt: string;
  serviceWindowExpiresAt: string;
  pinned: boolean;
  pendingReply: boolean;
  slaBreached: boolean;
}

export interface CannedResponse {
  id: string;
  shortcut: string;
  body: string;
  createdBy: string | null;
  createdAt: string;
}

export interface ConversationNote {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string | null;
}

export interface SavedView {
  id: string;
  name: string;
  filters: { status?: string; assignFilter?: string; tag?: string };
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface OrgMember {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  status: string | null;
}

export interface ContactFull extends Contact {
  email?: string;
  stage: "lead" | "customer" | "vip";
  optIn: boolean;
  createdAt: string;
  lastContactedAt: string;
}

export interface Channel {
  id: string;
  provider: "meta" | "whapi" | "waha";
  displayName: string;
  phone: string;
  status: "connected" | "connecting" | "disconnected";
  qualityRating?: "green" | "yellow" | "red";
  messageLimitTier?: string;
  safetyScore?: number;
  warmupDay?: number;
  connectedAt: string;
}

export type TemplateCategory = "marketing" | "utility" | "authentication";
export type TemplateStatus = "approved" | "pending" | "rejected" | "draft";

export interface Template {
  id: string;
  name: string;
  channel: "whatsapp" | "sms";
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  body: string;
  variables: string[];
  quality?: "green" | "yellow" | "red";
  rejectionReason?: string;
  updatedAt: string;
  // Meta interactive components
  headerType?: "none" | "text" | "image" | "video" | "document";
  headerText?: string | null;
  headerMediaUrl?: string | null;
  footer?: string | null;
  interactiveType?: InteractiveType;
  buttons?: TemplateButton[];
  listButtonText?: string | null;
  listSections?: ListSection[];
  catalogId?: string | null;
  catalogSections?: CatalogSection[];
  flowId?: string | null;
  flowCtaText?: string | null;
}

export type InteractiveType = "none" | "buttons" | "list" | "catalog" | "flow";
export type TemplateButton = { kind: "quick_reply" | "url" | "phone"; text: string; url?: string; phone?: string; payload?: string };
export type ListSection = { title: string; rows: Array<{ id: string; title: string; description?: string }> };
export type CatalogSection = { title: string; productRetailerIds: string[] };

export type FlowField = { name: string; label: string; type: string; required?: boolean; options?: string[] };
export type FlowScreen = { id: string; title: string; terminal?: boolean; ctaLabel?: string; fields: FlowField[] };
export interface Flow {
  id: string;
  name: string;
  status: "draft" | "published" | "deprecated";
  categories: string[];
  screens: FlowScreen[];
  metaFlowId?: string | null;
  channelId?: string | null;
  publishError?: string | null;
  publishedAt?: string | null;
  updatedAt: string;
}
export interface FlowResponseRow {
  id: string; flowId: string | null; flowName?: string | null;
  answers: Record<string, unknown>; createdAt: string;
  contactName?: string | null; contactPhone?: string | null; conversationId?: string | null;
}

export interface Plan {
  id: string; name: string; tagline?: string | null; position: number;
  priceMonthlyPaise: number; priceQuarterlyPaise: number; priceAnnualPaise: number;
  limits: Record<string, number>; features: Record<string, boolean>; highlights: string[];
}
export interface ConversationRate {
  id: string; country: string; countryCode: string;
  marketingMilliPaise: number; utilityMilliPaise: number;
  authenticationMilliPaise: number; serviceMilliPaise: number; markupBps: number;
}
export interface BillingSummary {
  plan: Plan | null;
  planCycle: "monthly" | "quarterly" | "annual";
  planStatus: string;
  planRenewsAt: string | null;
  billingCountryCode: string;
  walletPaise: number;
  rateCard: ConversationRate | null;
  usageThisMonth: { byCategory: Array<{ category: string; conversations: number; milliPaise: number }>; spentPaise: number; since: string };
}
export interface WalletTransaction {
  id: string; kind: string; amountPaise: number; balanceAfterPaise: number; reason: string; createdAt: string;
}
export interface WebhookEndpoint {
  id: string; url: string; description?: string | null; events: string[]; active: boolean; createdAt: string; secretSet?: boolean;
}
export interface WebhookDelivery {
  id: string; endpointId: string; event: string; status: string; attempts: number;
  responseCode?: number | null; error?: string | null; createdAt: string; deliveredAt?: string | null;
}
export interface ApiKey {
  id: string; name: string; prefix: string; scopes: string[];
  lastUsedAt?: string | null; revokedAt?: string | null; createdAt: string;
}

export type BroadcastStatus = "draft" | "scheduled" | "sending" | "completed" | "paused";

export interface CampaignStep {
  id?: string;
  stepIndex: number;
  templateId: string;
  delayHours: number;
}

export interface Broadcast {
  id: string;
  name: string;
  templateId: string;
  segment: string;
  audienceCount: number;
  status: BroadcastStatus;
  scheduledAt: string | null;
  stats: { sent: number; delivered: number; read: number; failed: number };
  dailyLimit: number;
  channelId: string | null;
  funnel: { sent: number; delivered: number; read: number; failed: number; queued: number };
  kind: "single" | "drip";
  smsFallback: boolean;
  steps: CampaignStep[];
  createdAt: string;
}

export interface TeamMember {
  userId: string;
  name: string | null;
  email: string;
}

export interface Team {
  id: string;
  orgId: string;
  name: string;
  createdAt: string;
  members: TeamMember[];
}

// Wati-style multi-select functional roles — additive to the single hierarchical `role`.
export const FUNCTIONAL_ROLES = [
  "administrator", "broadcast_manager", "template_manager", "contact_manager",
  "operator", "developer", "billing_manager", "dashboard_viewer",
] as const;
export type FunctionalRole = (typeof FUNCTIONAL_ROLES)[number];

export type AutomationTriggerType = "new_conversation" | "keyword_received";
export interface AutomationFilter { field: "channel" | "tag"; op: "eq" | "contains"; value: string }
export type AutomationAction =
  | { type: "assign_team"; teamId: string }
  | { type: "add_tag"; tag: string }
  | { type: "send_template"; templateId: string }
  | { type: "change_status"; status: string };

export interface AutomationRule {
  id: string;
  orgId: string;
  name: string;
  enabled: boolean;
  triggerType: AutomationTriggerType;
  triggerConfig: { keyword?: string };
  filters: AutomationFilter[];
  actions: AutomationAction[];
  createdAt: string;
  updatedAt: string;
}

export const AD_PLATFORMS = ["whatsapp", "facebook", "instagram", "twitter", "linkedin", "google_ads", "tiktok"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];
export const AD_PLATFORM_LABELS: Record<AdPlatform, string> = {
  whatsapp: "WhatsApp", facebook: "Facebook", instagram: "Instagram", twitter: "Twitter / X",
  linkedin: "LinkedIn", google_ads: "Google Ads", tiktok: "TikTok",
};

export interface AdCampaign {
  id: string;
  orgId: string;
  channelId: string | null;
  templateId: string | null;
  platform: AdPlatform;
  name: string;
  dailyBudgetPaise: number;
  scheduledAt: string | null;
  status: "draft" | "scheduled" | "active" | "failed";
  externalCampaignId: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export const ORGANIC_PLATFORMS = ["facebook", "instagram", "twitter", "linkedin", "tiktok"] as const;
export type OrganicPlatform = (typeof ORGANIC_PLATFORMS)[number];
export const ORGANIC_PLATFORM_LABELS: Record<OrganicPlatform, string> = {
  facebook: "Facebook", instagram: "Instagram", twitter: "Twitter / X", linkedin: "LinkedIn", tiktok: "TikTok",
};

export interface SocialPostResult { status: "published" | "failed"; externalId?: string; error?: string }
export interface SocialPost {
  id: string;
  orgId: string;
  platforms: OrganicPlatform[];
  caption: string;
  mediaUrl: string | null;
  scheduledAt: string | null;
  status: "draft" | "scheduled" | "published" | "failed";
  results: Record<string, SocialPostResult>;
  createdAt: string;
}

export type BotNodeType = "trigger" | "message" | "condition" | "ai" | "handoff";

export interface BotNode {
  id: string;
  type: BotNodeType;
  label: string;
  detail: string;
  x: number;
  y: number;
}

export interface BotEdge { from: string; to: string; label?: string }

export interface Bot {
  id: string;
  name: string;
  enabled: boolean;
  channels: string[];
  triggerSummary: string;
  sessionsToday: number;
  handoffRate: number;
  nodes: BotNode[];
  edges: BotEdge[];
  updatedAt: string;
}

export interface AnalyticsSummary {
  messagesSent: number;
  messagesReceived: number;
  activeConversations: number;
  avgResponseTimeMin: number | null;
  deliveryRate: number;
  readRate: number;
  costPaise: number;
  dailySeries: { date: string; sent: number; received: number }[];
  channelSplit: { channel: string; count: number }[];
  topCampaigns: { name: string; delivered: number; read: number; ctr: number }[];
  newContacts: number;
  statusBreakdown: { open: number; pending: number; snoozed: number; resolved: number };
  agentLeaderboard: { name: string; assigned: number; resolved: number }[];
}


export type DealStatus = "open" | "won" | "lost";

export interface PipelineStage {
  id: string;
  pipelineId: string;
  name: string;
  color: string;
  position: number;
}

export interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  stages: PipelineStage[];
}

export interface Deal {
  id: string;
  pipelineId: string;
  stageId: string;
  title: string;
  valuePaise: number;
  contactId: string | null;
  conversationId: string | null;
  assigneeId: string | null;
  expectedCloseDate: string | null;
  notes: string | null;
  status: DealStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface DealsAnalytics {
  totalOpenValuePaise: number;
  openDealCount: number;
  countByStage: Record<string, number>;
  winRate90d: number | null;
  won90d: number;
  lost90d: number;
}

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  ownerId: string | null;
  createdAt: string;
  contactCount: number;
  openDealCount: number;
}

export type TaskType = "call" | "whatsapp" | "meeting" | "follow_up" | "other";
export type TaskStatus = "open" | "done";

export interface CrmTask {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  dueAt: string | null;
  contactId: string | null;
  dealId: string | null;
  assigneeId: string | null;
  createdBy: string | null;
  completedAt: string | null;
  createdAt: string;
  contactName?: string | null;
  dealTitle?: string | null;
  assigneeName?: string | null;
}

export interface ContactRecord {
  id: string;
  waId: string | null;
  phoneE164: string;
  name: string;
  email: string | null;
  jobTitle: string | null;
  companyId: string | null;
  companyName?: string | null;
  ownerId: string | null;
  source: string | null;
  tags: string[];
  stage: string;
  optIn: boolean;
  createdAt: string;
  lastContactedAt: string;
}

export interface ContactDetail {
  contact: ContactRecord & { attributes: Record<string, unknown> };
  deals: Deal[];
  tasks: CrmTask[];
  conversations: Conversation[];
}
