import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

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
  constructor(private jwt: JwtService, private reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest();
    const auth: string = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token) {
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
