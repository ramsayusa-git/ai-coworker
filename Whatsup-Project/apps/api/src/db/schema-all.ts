// Single import point for the whole schema. schema.ts had grown past the point where
// anything could be found in it, so new modules live in schema-crm.ts; this re-export
// means callers never have to care which file a table is declared in.
export * from "./schema.js";
export * from "./schema-crm.js";
