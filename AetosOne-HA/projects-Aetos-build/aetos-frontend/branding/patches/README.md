# Optional source patches

Drop version-specific source overrides here. The overlay script copies them in.

## ha-logo-svg.ts (the in-app "Home Assistant" logo)
The app draws its logo from a Lit component, historically
`src/components/ha-logo-svg.ts`, exporting an SVG. To replace it with the Aetos
mark, add a file here named `ha-logo-svg.ts` that exports the same symbol but
draws your shield. Confirm the exact export/signature against your pinned
`FRONTEND_REF` before committing — it changes occasionally, which is why the
overlay only copies this in if BOTH the target and this patch exist.

Keep patches minimal and version-checked; the fewer source files you override,
the less breaks when you bump HA versions.
