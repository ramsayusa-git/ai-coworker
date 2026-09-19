import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as QRCode from 'qrcode';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, Roles } from '../common/auth.guard';
import { StickersService } from './stickers.service';

const PUBLIC_BASE = process.env.PUBLIC_WEB_URL || 'https://freshrice.in';

@ApiTags('inventory') @ApiBearerAuth()
@Roles('ADMIN', 'OPS', 'WAREHOUSE_STAFF')
@Controller('inventory/stickers')
export class StickersController {
  constructor(private svc: StickersService, private jwt: JwtService) {}

  @Get('stats') stats() { return this.svc.stats(); }
  @Get('suspicious') suspicious(@Query('hours') hours = '720', @Query('minIps') minIps = '3') {
    return this.svc.suspicious(Number(hours), Number(minIps));
  }
  @Get('batches') batches(@Query('lotId') lotId?: string) { return this.svc.batches(lotId); }

  @Post('batches') create(@CurrentUser() u: any, @Body() b: { lotId: string; packKg: number; count: number; note?: string }) {
    return this.svc.createBatch(b, u?.sub);
  }

  @Post(':code/apply') apply(@Param('code') code: string) { return this.svc.apply(code); }
  @Post(':code/void') voidOne(@Param('code') code: string) { return this.svc.void(code); }

  /** Printable sticker sheet. Opened as a plain link in a new tab (browser navigation, no
   *  Authorization header), so it is @Public() + @Roles() and the ?t= JWT below is what
   *  actually enforces access — same pattern as lots/:id/labels.html. */
  @Public() @Roles() @Get('batches/:id/print.html')
  async print(@Param('id') id: string, @Query('t') t: string, @Res() res: Response) {
    try {
      const u: any = await this.jwt.verifyAsync(t || '', { secret: process.env.JWT_SECRET || 'dev' });
      if (!['ADMIN', 'OPS', 'WAREHOUSE_STAFF'].includes(u.role)) throw new Error();
    } catch { return res.status(401).send('Login required'); }

    const stickers = await this.svc.stickersOf(id);
    if (!stickers.length) return res.status(404).send('Batch not found or empty');
    const lot = stickers[0].lot;
    const aged = Math.floor((Date.now() - lot.milledOn.getTime()) / 2592000000);
    await this.svc.markPrinted(id);

    const cells = await Promise.all(stickers.map(async (s) => {
      const qr = await QRCode.toDataURL(`${PUBLIC_BASE}/trace/${s.code}`, { margin: 0, width: 150 });
      return `<div class=s>
        <div class=hd><b>FreshRice</b><span>${lot.variety.name}</span></div>
        <div class=mid><img src="${qr}" alt=""><div class=meta>
          <div class=big>${s.packKg} kg</div>
          <div>Lot <b>${lot.lotNo}</b> · #${s.serial}</div>
          <div>${lot.vendor.name}${lot.vendor.district ? ', ' + lot.vendor.district : ''}</div>
          <div>${lot.variety.agedPreferred ? 'Aged ' + aged + ' mo' : 'Milled ' + aged + ' mo ago'} · Moist ${lot.moisturePct}%</div>
        </div></div>
        <div class=code>${s.code}</div>
      </div>`;
    }));

    // 50mm x 30mm stickers, laid out to fill an A4 sheet on standard label stock.
    const css = `@page{size:A4;margin:8mm}
      body{font-family:Arial,sans-serif;margin:0}
      .bar{padding:6px 0 10px;font-size:12px;color:#444}
      .sheet{display:flex;flex-wrap:wrap;gap:2mm}
      .s{width:50mm;height:30mm;border:1px dashed #bbb;border-radius:2mm;padding:2mm;
         box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;
         page-break-inside:avoid;overflow:hidden}
      .hd{display:flex;justify-content:space-between;font-size:7pt;line-height:1}
      .mid{display:flex;gap:2mm;align-items:center}
      .mid img{width:18mm;height:18mm}
      .meta{font-size:5.6pt;line-height:1.3}
      .big{font-size:11pt;font-weight:bold;line-height:1}
      .code{font-family:monospace;font-size:6.5pt;letter-spacing:.5px;text-align:center;color:#333}
      @media print{.bar{display:none}}`;
    res.type('html').send(`<!doctype html><meta charset=utf-8><title>Stickers ${lot.lotNo}</title>
      <style>${css}</style>
      <div class=bar><button onclick="print()">Print</button>
        &nbsp;${stickers.length} stickers · lot ${lot.lotNo} · ${stickers[0].packKg} kg ·
        each QR opens ${PUBLIC_BASE}/trace/&lt;code&gt;</div>
      <div class=sheet>${cells.join('')}</div>`);
  }
}
