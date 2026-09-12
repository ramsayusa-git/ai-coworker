/**
 * The add-on manifest contract — deliberately modeled on Home Assistant's add-on
 * config.yaml (name/version/slug/options/schema/ports/image) so the pattern is
 * familiar and each AI capability can be developed, versioned, and deployed like
 * an independent add-on rather than a monolith AI layer.
 *
 * Every add-on ships an `addon.yaml` next to its Dockerfile validating against this
 * schema. The API's add-on supervisor (apps/api/src/addons) loads the registry,
 * exposes it to the web Add-ons store page, and proxies calls to enabled add-ons.
 */
import { z } from 'zod';

export const AddonConfigFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['string', 'secret', 'number', 'boolean', 'select']),
  required: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.string()).optional(), // for type: select — e.g. LLM/ASR provider choice
  help: z.string().optional(),
});

export const AddonManifestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  icon: z.string(), // lucide icon name shown in the Add-ons store
  category: z.enum(['clinical', 'engagement', 'revenue', 'compliance']),
  // Semantic version range of the core API this add-on expects.
  coreApiCompat: z.string().default('^0.1.0'),
  port: z.number().int(),
  healthPath: z.string().default('/health'),
  configSchema: z.array(AddonConfigFieldSchema).default([]),
  // Events this add-on subscribes to on the bus, and events it may publish.
  subscribesTo: z.array(z.string()).default([]),
  publishes: z.array(z.string()).default([]),
});
export type AddonManifest = z.infer<typeof AddonManifestSchema>;

export const AddonStateSchema = z.object({
  slug: z.string(),
  enabled: z.boolean(),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  installedAt: z.string().datetime(),
  lastHealthCheck: z
    .object({ at: z.string().datetime(), ok: z.boolean(), message: z.string().optional() })
    .optional(),
});
export type AddonState = z.infer<typeof AddonStateSchema>;
