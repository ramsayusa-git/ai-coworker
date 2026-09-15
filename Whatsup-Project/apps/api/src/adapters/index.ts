import type { ChannelAdapter } from "./types.js";
import { metaAdapter } from "./meta.js";
import { whapiAdapter } from "./whapi.js";
import { messengerAdapter, instagramAdapter } from "./messenger.js";

export function getAdapter(provider: string): ChannelAdapter | null {
  if (provider === "meta") return metaAdapter;
  if (provider === "whapi") return whapiAdapter;
  if (provider === "messenger") return messengerAdapter;
  if (provider === "instagram") return instagramAdapter;
  return null; // waha not implemented yet
}

export * from "./types.js";
