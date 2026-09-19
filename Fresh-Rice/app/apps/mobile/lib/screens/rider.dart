import 'dart:convert';
import 'package:flutter/material.dart';
import 'dart:async';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import '../profiles.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import 'orders.dart';

class RiderScreen extends StatefulWidget {
  final VoidCallback onLogout;
  const RiderScreen({super.key, required this.onLogout});
  @override
  State<RiderScreen> createState() => _RiderScreenState();
}

class _RiderScreenState extends State<RiderScreen> {
  List? routes; Timer? gps;
  Position? get last => Duty.I.last;
  @override
  void initState() { super.initState(); load(); Duty.I.addListener(_r); Duty.I.refresh(); }
  @override
  void dispose() { Duty.I.removeListener(_r); super.dispose(); }
  void _r() { if (mounted) setState(() {}); }
  Future<void> duty() async { try { Duty.I.onDuty ? await Duty.I.clockOut() : await Duty.I.clockIn(); } catch (e) { snack('$e'); } }
  Widget dutyBar() { final d = Duty.I; return Material(color: d.onDuty ? Colors.green.shade50 : Colors.amber.shade50, child: ListTile(dense: true, leading: Icon(d.onDuty ? Icons.gps_fixed : Icons.gps_off, color: d.onDuty ? Colors.green : Colors.orange), title: Text(d.onDuty ? 'On duty · sharing live location · ${d.hoursToday.toStringAsFixed(1)} h today' : 'Off duty — clock in to start sharing your location', style: const TextStyle(fontSize: 13)), trailing: d.onDuty ? OutlinedButton(onPressed: duty, child: const Text('Clock out')) : FilledButton(onPressed: duty, child: const Text('Clock in')))); }
  Future<void> scan(Map s) async {
    final ctl = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(title: Text('Load bag for order #${s['order']['orderNo']}'), content: TextField(controller: ctl, autofocus: true, decoration: const InputDecoration(labelText: 'Scan / type lot number from bag QR')), actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Confirm'))]));
    if (ok != true) return;
    try { await Api.call('/rider/stops/${s['id']}/scan', body: {'lotNo': ctl.text.split('|').first.trim()}); snack('Loaded ✔'); load(); } catch (e) { snack('$e'); }
  }
  Future<void> load() async { try { routes = await Api.call('/rider/manifest'); } catch (e) { snack('$e'); } if (mounted) setState(() {}); }
  void snack(String m) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m))); }

  Future<void> start(String id) async { try { if (!Duty.I.onDuty) { await Duty.I.clockIn(); } await Api.call('/rider/routes/$id/start', method: 'POST'); snack('Route started — customers received their OTPs'); load(); } catch (e) { snack('$e'); } }

  Future<void> deliver(Map s) async {
    final otp = TextEditingController(); String? photoB64; String? fail;
    final res = await showModalBottomSheet<String>(context: context, isScrollControlled: true, builder: (ctx) => StatefulBuilder(builder: (ctx, ss) => Padding(padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16), child: Column(mainAxisSize: MainAxisSize.min, children: [
      Text('Deliver order #${s['order']['orderNo']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
      TextField(controller: otp, keyboardType: TextInputType.number, maxLength: 4, textAlign: TextAlign.center, style: const TextStyle(fontSize: 28, letterSpacing: 10), decoration: const InputDecoration(labelText: 'Customer OTP', border: OutlineInputBorder(), counterText: '')),
      const Text('— or —', style: TextStyle(color: Colors.grey)),
      OutlinedButton.icon(onPressed: () async { final x = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 800, imageQuality: 60); if (x != null) { final b = await x.readAsBytes(); ss(() => photoB64 = 'data:image/jpeg;base64,${base64Encode(b)}'); } }, icon: Icon(photoB64 != null ? Icons.check_circle : Icons.camera_alt, color: photoB64 != null ? Colors.green : null), label: Text(photoB64 != null ? 'Photo attached' : 'Photo at door')),
      const SizedBox(height: 8),
      FilledButton(onPressed: () => Navigator.pop(ctx, 'ok'), child: const Text('Confirm delivered')),
      const Divider(),
      DropdownButtonFormField<String>(value: fail, decoration: const InputDecoration(labelText: 'Could not deliver — reason'), items: const [DropdownMenuItem(value: 'Customer not available', child: Text('Customer not available')), DropdownMenuItem(value: 'Wrong address', child: Text('Wrong address')), DropdownMenuItem(value: 'Refused', child: Text('Refused'))], onChanged: (v) => ss(() => fail = v)),
      if (fail != null) TextButton(onPressed: () => Navigator.pop(ctx, 'fail'), child: const Text('Mark failed', style: TextStyle(color: Colors.red))),
    ]))));
    if (res == null) return;
    try {
      final r = await Api.call('/rider/stops/${s['id']}/deliver', body: res == 'fail' ? {'failReason': fail} : {if (otp.text.isNotEmpty) 'otp': otp.text, if (photoB64 != null) 'podPhotoUrl': photoB64, if (last != null) 'lat': last!.latitude, if (last != null) 'lng': last!.longitude});
      snack(r['status'] == 'DELIVERED' ? (r['otpVerified'] == true ? 'Delivered ✔ OTP verified' : 'Delivered (photo POD)') : 'Marked failed'); load();
    } catch (e) { snack('$e'); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text('🛵 ${Api.user?['name'] ?? 'Rider'}'), backgroundColor: Colors.grey.shade900, actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: load)]),
    body: Column(children: [dutyBar(), Expanded(child: RefreshIndicator(onRefresh: load, child: routes == null ? const Center(child: CircularProgressIndicator()) : routes!.isEmpty ? const Center(child: Text('No routes assigned. Check with ops.')) : ListView(padding: const EdgeInsets.all(12), children: [
      for (final r in routes!) Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [Expanded(child: Text('${r['zone']['name']} · ${fmtDate(r['date'])}', style: const TextStyle(fontWeight: FontWeight.bold))), StatusChip(r['status'])]),
        Text('${(r['vehicleType'] as String).replaceAll('_', ' ')} · ${r['loadKg']} kg · ${(r['stops'] as List).length} stops', style: const TextStyle(fontSize: 12, color: Colors.grey)),
        if (r['status'] == 'PUBLISHED') Padding(padding: const EdgeInsets.only(top: 8), child: FilledButton(onPressed: () => start(r['id']), child: Text('Start route (load ${r['loadKg']} kg)'))),
        for (final s in r['stops']) _stop(r, s),
      ]))),
    ])))]));

  Widget _stop(Map r, Map s) {
    final o = s['order']; final a = o['address']; final cod = o['payment']?['method'] == 'COD' && o['payment']?['status'] != 'PAID';
    return Container(margin: const EdgeInsets.only(top: 8), padding: const EdgeInsets.all(10), decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(8), color: s['status'] == 'DELIVERED' ? Colors.green.shade50 : s['status'] == 'FAILED' ? Colors.red.shade50 : Colors.white),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [Text('#${s['seq']} · Order ${o['orderNo']}', style: const TextStyle(fontWeight: FontWeight.bold)), const Spacer(), StatusChip(s['status'])]),
        Text('${a['line1']}${a['complex'] != null && a['complex'] != '' ? ', ${a['complex']}' : ''}${a['landmark'] != null && a['landmark'] != '' ? ' (${a['landmark']})' : ''}\nFloor ${a['floor']}${a['hasLift'] == true ? '' : ' · NO LIFT'}'),
        Text((o['items'] as List).map((i) => '${i['qty']}× ${i['sku']['variety']['name']} ${i['sku']['packKg']}kg [${i['lot']?['lotNo'] ?? '-'}]').join(', ') + ' · ${o['totalKg']} kg', style: const TextStyle(fontSize: 12, color: Colors.grey)),
        Row(children: [
          cod ? Text('Collect ${rupees(o['totalPaise'])}', style: TextStyle(color: Colors.orange.shade800, fontWeight: FontWeight.bold)) : const Text('Prepaid', style: TextStyle(color: Colors.green)),
          const Spacer(),
          IconButton(icon: const Icon(Icons.call), onPressed: () => launchUrl(Uri.parse('tel:${o['user']['phone']}'))),
          if (a['lat'] != null) IconButton(icon: const Icon(Icons.navigation), onPressed: () => launchUrl(Uri.parse('https://maps.google.com/?q=${a['lat']},${a['lng']}'), mode: LaunchMode.externalApplication)),
        ]),
        if (r['status'] != 'COMPLETED' && s['status'] == 'PENDING' && s['loadedAt'] == null) OutlinedButton.icon(onPressed: () => scan(s), icon: const Icon(Icons.qr_code_scanner), label: const Text('Scan bag to load')),
        if (s['loadedAt'] != null && s['status'] == 'PENDING') const Text('✔ Loaded', style: TextStyle(color: Colors.green, fontSize: 12)),
        if (r['status'] == 'IN_PROGRESS' && s['status'] == 'PENDING') FilledButton(onPressed: () => deliver(s), child: const Text('Deliver')),
      ]));
  }
}
