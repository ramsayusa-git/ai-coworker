import 'package:flutter/material.dart';
import '../api.dart';

/// Rider's vehicle card: pre-trip checklist, end-of-day odometer, fuel/toll log. Rendered inside the rider screen.
class VehicleBar extends StatefulWidget {
  const VehicleBar({super.key});
  @override
  State<VehicleBar> createState() => VehicleBarState();
}

class VehicleBarState extends State<VehicleBar> {
  Map<String, dynamic>? v; bool loaded = false;
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async { try { final r = await Api.call('/rider/vehicle'); if (mounted) setState(() { v = r == null ? null : Map<String, dynamic>.from(r); loaded = true; }); } catch (_) { if (mounted) setState(() => loaded = true); } }
  void snack(String m) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m))); }

  /// Returns true once today's check exists (or the rider has no vehicle) so the route can start.
  Future<bool> ensureChecked() async {
    if (v == null) return true;
    if (v!['checkedToday'] == true) return true;
    final ok = await check();
    return ok;
  }

  Future<bool> check() async {
    final items = List<String>.from(v!['checklistItems'] ?? []); final state = {for (final i in items) i: true};
    final odo = TextEditingController(text: '${v!['odometerKm']}'); final issues = TextEditingController();
    final res = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (ctx) => StatefulBuilder(builder: (ctx, ss) => Padding(padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Pre-trip check · ${v!['regNo']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
      const Text('Untick anything that is not OK. Brakes, tyres or lights failing puts the vehicle in maintenance.', style: TextStyle(fontSize: 12, color: Colors.black54)),
      Wrap(children: items.map((i) => SizedBox(width: 160, child: CheckboxListTile(dense: true, contentPadding: EdgeInsets.zero, controlAffinity: ListTileControlAffinity.leading, title: Text(i[0].toUpperCase() + i.substring(1)), value: state[i], onChanged: (x) => ss(() => state[i] = x ?? true)))).toList()),
      TextField(controller: odo, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Odometer now (km)')),
      TextField(controller: issues, decoration: const InputDecoration(labelText: 'Anything to report?')),
      const SizedBox(height: 10),
      Row(children: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Later')), const Spacer(), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Submit check'))]),
    ]))));
    if (res != true) return false;
    try {
      final r = await Api.call('/rider/vehicle/check', body: {'odometerStart': int.tryParse(odo.text), 'checklist': state, 'issues': issues.text.trim()});
      snack(r['ok'] == true ? 'Vehicle checked ✔' : 'Reported to Ops — vehicle ${r['vehicleStatus']}');
      await load(); return r['ok'] == true;
    } catch (e) { snack('$e'); return false; }
  }

  Future<void> endTrip() async {
    final odo = TextEditingController(text: '${v!['odometerKm']}');
    final ok = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(title: const Text('End of day odometer'), content: TextField(controller: odo, keyboardType: TextInputType.number, autofocus: true, decoration: const InputDecoration(suffixText: 'km')), actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save'))]));
    if (ok != true) return;
    try { await Api.call('/rider/vehicle/end-trip', body: {'odometerEnd': int.tryParse(odo.text) ?? 0}); snack('Saved'); load(); } catch (e) { snack('$e'); }
  }

  Future<void> logExpense() async {
    String type = 'FUEL'; final amt = TextEditingController(); final litres = TextEditingController(); final odo = TextEditingController(text: '${v!['odometerKm']}'); final desc = TextEditingController();
    final ok = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (ctx) => StatefulBuilder(builder: (ctx, ss) => Padding(padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Log fuel / toll', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
      SegmentedButton<String>(segments: const [ButtonSegment(value: 'FUEL', label: Text('Fuel')), ButtonSegment(value: 'TOLL', label: Text('Toll'))], selected: {type}, onSelectionChanged: (s) => ss(() => type = s.first)),
      TextField(controller: amt, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount ₹')),
      if (type == 'FUEL') TextField(controller: litres, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Litres')),
      TextField(controller: odo, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Odometer (km)')),
      TextField(controller: desc, decoration: const InputDecoration(labelText: 'Pump / note')),
      const SizedBox(height: 10),
      Row(children: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), const Spacer(), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save'))]),
    ]))));
    if (ok != true) return;
    try { await Api.call('/rider/vehicle/${v!['id']}/logs', body: {'type': type, 'amountPaise': ((double.tryParse(amt.text) ?? 0) * 100).round(), if (litres.text.isNotEmpty) 'litres': double.tryParse(litres.text), 'odometerKm': int.tryParse(odo.text), 'vendorName': desc.text.trim()}); snack('Logged — Ops will reimburse per policy'); load(); } catch (e) { snack('$e'); }
  }

  @override
  Widget build(BuildContext context) {
    if (!loaded || v == null) return const SizedBox();
    final checked = v!['checkedToday'] == true; final alerts = List.from(v!['docAlerts'] ?? []); final maint = v!['status'] == 'MAINTENANCE';
    return Material(color: maint ? Colors.red.shade50 : checked ? Colors.blue.shade50 : Colors.orange.shade50, child: Column(mainAxisSize: MainAxisSize.min, children: [
      ListTile(dense: true, leading: Icon(maint ? Icons.build : Icons.two_wheeler, color: maint ? Colors.red : Colors.blueGrey),
        title: Text('${v!['regNo']} · ${v!['odometerKm']} km${maint ? ' · IN MAINTENANCE' : checked ? ' · checked today' : ' · pre-trip check pending'}', style: const TextStyle(fontSize: 13)),
        subtitle: alerts.isNotEmpty ? Text(alerts.map((a) => '${a['doc']} ${a['expired'] == true ? 'EXPIRED' : 'expiring'}').join(' · '), style: const TextStyle(color: Colors.red, fontSize: 11)) : null,
        trailing: Wrap(spacing: 4, children: [
          if (!checked) FilledButton.tonal(onPressed: check, child: const Text('Check')),
          if (checked && v!['todayCheck']?['odometerEnd'] == null) OutlinedButton(onPressed: endTrip, child: const Text('End day')),
          IconButton(tooltip: 'Log fuel / toll', icon: const Icon(Icons.local_gas_station), onPressed: logExpense),
        ])),
    ]));
  }
}
