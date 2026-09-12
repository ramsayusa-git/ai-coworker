import type { ChannelAdapter } from "./types.js";
import { metaAdapter } from "./meta.js";
import { whapiAdapter } from "./whapi.js";

export function getAdapter(provider: string): ChannelAdapter | null {
  if (provider === "meta") return metaAdapter;
  if (provider === "whapi") return whapiAdapter;
  return null; // waha/messenger/instagram not implemented yet
}

export * from "./types.js";
