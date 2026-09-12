/**
 * Resolves the hostname used to reach an add-on's HTTP service.
 *
 * In Docker Compose, each add-on is reachable by its manifest slug as the
 * service/DNS name (e.g. `http://lab-insights:8108`). In native (non-Docker)
 * dev, every add-on instead runs as a plain process bound to `localhost` on
 * its manifest port, so the slug can't resolve as a hostname at all
 * ("getaddrinfo EAI_AGAIN <slug>"). Setting ADDON_HOST_OVERRIDE=localhost in
 * apps/api/.env switches every add-on lookup to localhost without touching
 * docker-compose.yml, which never sets this var and keeps resolving by slug.
 */
export function resolveAddonHost(slug: string): string {
  return process.env.ADDON_HOST_OVERRIDE || slug;
}
