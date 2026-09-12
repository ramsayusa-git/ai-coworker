import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * RBAC roles, matching the Prisma UserRole enum: OWNER, ADMIN, DOCTOR, FRONT_DESK.
 * Usage: @Roles('OWNER', 'ADMIN') on a controller method — RolesGuard (registered
 * globally in AuthModule) reads req.auth.role (set by the Keycloak JWT strategy,
 * see jwt.strategy.ts) and denies with 403 if it isn't in the allowed list.
 * A route with no @Roles() decorator is reachable by any authenticated role.
 */
export const Roles = (...roles: Array<'OWNER' | 'ADMIN' | 'DOCTOR' | 'FRONT_DESK'>) => SetMetadata(ROLES_KEY, roles);
