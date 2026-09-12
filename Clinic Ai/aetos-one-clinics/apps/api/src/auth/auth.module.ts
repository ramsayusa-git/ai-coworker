import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

/**
 * JWT validation against Keycloak (KEYCLOAK_ISSUER/KEYCLOAK_AUDIENCE) is the
 * production auth path — wire a passport-jwt strategy here that verifies the
 * token, loads the User row by keycloakSub, and sets req.auth = { organizationId,
 * userId, role }. This scaffold ships the RolesGuard and the dev X-Org-Id/X-Role
 * header fallback (see tenant.middleware.ts and roles.guard.ts) so the rest of
 * the API can be built and tested before Keycloak is stood up.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService, { provide: APP_GUARD, useClass: RolesGuard }],
  exports: [UsersService],
})
export class AuthModule {}
