import { Body, Controller, Delete, Get, Param, Post, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Roles, CurrentUser } from '../common/auth.guard';

/** Service API keys (used by the FreshRice MCP server / scripts). ADMIN only. The plain key is returned exactly once. */
@ApiTags('api-keys') @ApiBearerAuth() @Roles('ADMIN') @Controller('admin/api-keys')
export class ApiKeysController {
  constructor(private db: PrismaService) {}

  @Get() async list() {
    const keys = await this.db.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
    const users = await this.db.user.findMany({ where: { id: { in: keys.map((k) => k.userId) } }, select: { id: true, name: true, role: true, phone: true } });
    return keys.map((k) => ({ ...k, keyHash: undefined, user: users.find((u) => u.id === k.userId) }));
  }

  /** Create a key acting as a staff user. Defaults: the calling admin, read-only, no expiry. */
  @Post() async create(@CurrentUser() u: any, @Body() b: { name: string; userId?: string; scopes?: string[]; expiresInDays?: number }) {
    if (!b.name?.trim()) throw new BadRequestException('name required');
    const scopes = (b.scopes?.length ? b.scopes : ['read']).filter((s) => ['read', 'write'].includes(s)); if (!scopes.includes('read')) scopes.push('read');
    const userId = b.userId || u.sub; const usr = await this.db.user.findUnique({ where: { id: userId } });
    if (!usr || !['ADMIN', 'OPS', 'SALES', 'MARKETING'].includes(usr.role)) throw new BadRequestException('Key must be linked to a staff account (ADMIN/OPS/SALES/MARKETING)');
    if (usr.isSuperAdmin) throw new BadRequestException('Cannot link a key to the super-admin account');
    const plain = 'frk_' + randomBytes(24).toString('base64url');
    const key = await this.db.apiKey.create({ data: { name: b.name.trim(), keyHash: createHash('sha256').update(plain).digest('hex'), prefix: plain.slice(0, 12), userId, scopes, expiresAt: b.expiresInDays ? new Date(Date.now() + b.expiresInDays * 86400000) : null, createdById: u.sub } });
    await this.db.event.create({ data: { actor: u.sub, type: 'api_key_created', payload: { id: key.id, name: key.name, userId, scopes } } });
    return { id: key.id, name: key.name, prefix: key.prefix, scopes, user: { id: usr.id, name: usr.name, role: usr.role }, key: plain, note: 'Copy this key now — it is not shown again.' };
  }

  @Delete(':id') async revoke(@CurrentUser() u: any, @Param('id') id: string) {
    const k = await this.db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.db.event.create({ data: { actor: u.sub, type: 'api_key_revoked', payload: { id, name: k.name } } });
    return { ok: true };
  }
}
