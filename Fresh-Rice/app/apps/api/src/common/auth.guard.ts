import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export const WRITE_KEY = 'requiresWrite';
/** Mark a handler as a write for API-key callers (keys with only the `read` scope get 403). JWT users are unaffected. */
export const Write = () => SetMetadata(WRITE_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata('isPublic', true);
export const CurrentUser = createParamDecorator((_d, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user);

// Scoping: restricts WAREHOUSE_STAFF to their own warehouseId and VENDOR_USER to their own
// vendorId. Pass the route param name that carries the warehouse/vendor id being accessed.
// ADMIN and OPS always bypass warehouse scoping; ADMIN always bypasses vendor scoping.
export const SCOPE_WAREHOUSE_KEY = 'scopeWarehouseParam';
export const ScopeWarehouse = (paramName: string) => SetMetadata(SCOPE_WAREHOUSE_KEY, paramName);
export const SCOPE_VENDOR_KEY = 'scopeVendorParam';
export const ScopeVendor = (paramName: string) => SetMetadata(SCOPE_VENDOR_KEY, paramName);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector, private db: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest();
    const auth: string = req.headers['authorization'] || '';
    // GET downloads opened in a new tab (exports, PDFs) can't set headers — accept ?t=<jwt> there only.
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.method === 'GET' && typeof req.query?.t === 'string' && req.query.t.length > 20 ? req.query.t : null);
    if (token && token.startsWith('frk_')) {
      // Service API key (MCP server, scripts): resolves to its linked user; read-only keys can't hit @Write() handlers.
      const key = await this.db.apiKey.findUnique({ where: { keyHash: createHash('sha256').update(token).digest('hex') } });
      if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) throw new UnauthorizedException('Invalid or revoked API key');
      const u = await this.db.user.findUnique({ where: { id: key.userId } });
      if (!u || !u.active) throw new UnauthorizedException('API key user inactive');
      req.user = { sub: u.id, role: u.role, phone: u.phone, b2b: u.b2bAccountId || undefined, warehouseId: u.warehouseId || undefined, vendorId: u.vendorId || undefined, isField: u.isField || undefined, apiKey: { id: key.id, name: key.name, scopes: key.scopes } };
      const isWrite = this.reflector.getAllAndOverride<boolean>(WRITE_KEY, [ctx.getHandler(), ctx.getClass()]) || !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (isWrite && !key.scopes.includes('write')) throw new ForbiddenException('This API key is read-only');
      this.db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    } else if (token) {
      try { req.user = await this.jwt.verifyAsync(token, { secret: process.env.JWT_SECRET || 'dev' }); } catch { if (!isPublic) throw new UnauthorizedException('Invalid token'); }
    } else if (!isPublic) throw new UnauthorizedException('Missing token');
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(req.user?.role)) throw new ForbiddenException('Insufficient role');

    const whParam = this.reflector.getAllAndOverride<string>(SCOPE_WAREHOUSE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (whParam && req.user?.role === 'WAREHOUSE_STAFF') {
      const target = req.params?.[whParam] || req.body?.[whParam] || req.query?.[whParam];
      if (target && target !== req.user.warehouseId) throw new ForbiddenException('Not your warehouse');
    }
    const vParam = this.reflector.getAllAndOverride<string>(SCOPE_VENDOR_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (vParam && req.user?.role === 'VENDOR_USER') {
      const target = req.params?.[vParam] || req.body?.[vParam] || req.query?.[vParam];
      if (target && target !== req.user.vendorId) throw new ForbiddenException('Not your vendor account');
    }
    return true;
  }
}
