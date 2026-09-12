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
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  body: string;
  variables: string[];
  quality?: "green" | "yellow" | "red";
  rejectionReason?: string;
  updatedAt: string;
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
