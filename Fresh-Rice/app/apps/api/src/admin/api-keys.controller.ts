import { Body, Controller, Delete, Get, Param, Patch, Post, BadRequestException, NotFoundException } from '@nestjs/common';
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

  /** Edit a key: rename, change scopes, change expiry. The secret itself is never
   *  editable (we only store its hash), and a revoked key cannot be brought back —
   *  if you need it working again, issue a new one. */
  @Patch(':id') async update(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { name?: string; scopes?: string[]; expiresInDays?: number | null }) {
    const cur = await this.db.apiKey.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Key not found');
    if (cur.revokedAt) throw new BadRequestException('This key is revoked — issue a new one instead of editing it');

    const data: any = {};
    if (b.name !== undefined) {
      if (!b.name.trim()) throw new BadRequestException('name cannot be empty');
      data.name = b.name.trim();
    }
    if (b.scopes !== undefined) {
      const scopes = b.scopes.filter((s) => ['read', 'write'].includes(s));
      if (!scopes.includes('read')) scopes.push('read'); // read is implied by write; never leave a key with nothing
      data.scopes = scopes;
    }
    if (b.expiresInDays !== undefined) {
      data.expiresAt = b.expiresInDays === null ? null : new Date(Date.now() + Number(b.expiresInDays) * 86400000);
    }
    if (!Object.keys(data).length) throw new BadRequestException('Nothing to update');

    const k = await this.db.apiKey.update({ where: { id }, data });
    await this.db.event.create({ data: { actor: u.sub, type: 'api_key_updated', payload: { id, before: { name: cur.name, scopes: cur.scopes, expiresAt: cur.expiresAt }, after: data } } });
    return { ...k, keyHash: undefined };
  }

  /** Revoke: the key stops working immediately but the row stays, so the audit trail
   *  and lastUsedAt survive. This is the safe default and what the UI offers first. */
  @Delete(':id') async revoke(@CurrentUser() u: any, @Param('id') id: string) {
    const k = await this.db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.db.event.create({ data: { actor: u.sub, type: 'api_key_revoked', payload: { id, name: k.name } } });
    return { ok: true };
  }

  /** Hard delete, for clearing out old revoked keys. Deliberately only possible on a
   *  key that is ALREADY revoked — that makes destroying a working integration a
   *  two-step action rather than one mis-click, and the Event row keeps the history. */
  @Delete(':id/permanent') async purge(@CurrentUser() u: any, @Param('id') id: string) {
    const k = await this.db.apiKey.findUnique({ where: { id } });
    if (!k) throw new NotFoundException('Key not found');
    if (!k.revokedAt) throw new BadRequestException('Revoke the key first — a key still in use cannot be deleted outright');
    await this.db.apiKey.delete({ where: { id } });
    await this.db.event.create({ data: { actor: u.sub, type: 'api_key_deleted', payload: { id, name: k.name, prefix: k.prefix, revokedAt: k.revokedAt } } });
    return { ok: true, deleted: k.name };
  }
}
