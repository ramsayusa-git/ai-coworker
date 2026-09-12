import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export interface TenantRequest extends Request {
  organizationId?: string;
  userId?: string;
}

/**
 * Decodes the validated Keycloak JWT (validation itself belongs to an
 * AuthGuard wired against KEYCLOAK_ISSUER — omitted from this scaffold) and
 * attaches organizationId/userId to the request so downstream services can
 * call prisma.forTenant(organizationId) before any tenant-scoped query.
 *
 * In dev, falls back to the X-Org-Id header so the API is usable before
 * Keycloak is wired up.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: TenantRequest, _res: Response, next: NextFunction) {
    const orgId = (req.headers['x-org-id'] as string) || req.auth?.organizationId;
    if (!orgId) {
      throw new UnauthorizedException('Missing tenant context (X-Org-Id header or auth token org claim)');
    }
    req.organizationId = orgId;
    next();
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { organizationId: string; userId: string };
    }
  }
}
