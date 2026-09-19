import 'package:flutter/material.dart';
import '../api.dart';

/// Marketing profile: last-7-day numbers, coupons (create / pause), referral snapshot.
class MarketingScreen extends StatefulWidget {
  const MarketingScreen({super.key});
  @override
  State<MarketingScreen> createState() => _MarketingScreenState();
}

class _MarketingScreenState extends State<MarketingScreen> {
  List coupons = []; List daily = []; bool loading = true;
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async {
    final to = DateTime.now(); final from = to.subtract(const Duration(days: 6)); String d(DateTime x) => x.toIso8601String().substring(0, 10);
    try { final r = await Future.wait([Api.call('/admin/coupons'), Api.call('/admin/reports/daily?from=${d(from)}&to=${d(to)}')]); coupons = r[0]; daily = r[1] is List ? r[1] : (r[1]['rows'] ?? []); } catch (e) { snack('$e'); }
    loading = false; if (mounted) setState(() {});
  }
  void snack(String m) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m))); }

  Future<void> addCoupon() async {
    final code = TextEditingController(), value = TextEditingController(), minOrder = TextEditingController(text: '0'); String type = 'PERCENT'; bool firstOnly = false;
    final ok = await showDialog<bool>(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, set) => AlertDialog(title: const Text('New coupon'), content: Column(mainAxisSize: MainAxisSize.min, children: [
      TextField(controller: code, decoration: const InputDecoration(labelText: 'Code'), textCapitalization: TextCapitalization.characters),
      Row(children: [Expanded(child: DropdownButton<String>(value: type, isExpanded: true, items: const [DropdownMenuItem(value: 'PERCENT', child: Text('% off')), DropdownMenuItem(value: 'FLAT', child: Text('₹ off'))], onChanged: (v) => set(() => type = v!))), const SizedBox(width: 8), Expanded(child: TextField(controller: value, decoration: InputDecoration(labelText: type == 'PERCENT' ? 'Percent' : 'Rupees'), keyboardType: TextInputType.number))]),
      TextField(controller: minOrder, decoration: const InputDecoration(labelText: 'Min order ₹'), keyboardType: TextInputType.number),
      CheckboxListTile(value: firstOnly, onChanged: (v) => set(() => firstOnly = v ?? false), title: const Text('First order only'), contentPadding: EdgeInsets.zero),
    ]), actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Create'))])));
    if (ok != true || code.text.isEmpty || value.text.isEmpty) return;
    try { await Api.call('/admin/coupons', body: {'code': code.text, 'type': type, 'value': num.parse(value.text), 'minOrderRupees': num.tryParse(minOrder.text) ?? 0, 'firstOrderOnly': firstOnly, 'usesPerUser': 1}); load(); } catch (e) { snack('$e'); }
  }
  Future<void> toggle(Map c) async { try { await Api.call('/admin/coupons/${c['id']}', method: 'PATCH', body: {'active': !(c['active'] == true)}); load(); } catch (e) { snack('$e'); } }

  @override
  Widget build(BuildContext context) {
    num orders = 0, delivered = 0, rev = 0, kg = 0; for (final r in daily) { orders += r['orders'] ?? 0; delivered += r['delivered'] ?? 0; rev += r['revenuePaise'] ?? 0; kg += r['kg'] ?? 0; }
    return Scaffold(appBar: AppBar(title: const Text('Marketing'), actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: load)]),
      floatingActionButton: FloatingActionButton.extended(onPressed: addCoupon, icon: const Icon(Icons.local_offer), label: const Text('Coupon')),
      body: loading ? const Center(child: CircularProgressIndicator()) : RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(12), children: [
        const Text('Last 7 days', style: TextStyle(fontWeight: FontWeight.bold)),
        Row(children: [for (final e in [['$orders', 'orders'], ['$delivered', 'delivered'], [rupees(rev), 'revenue'], ['${kg.round()} kg', 'rice']]) Expanded(child: Card(child: Padding(padding: const EdgeInsets.all(10), child: Column(children: [Text(e[0], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)), Text(e[1], style: const TextStyle(fontSize: 11, color: Colors.grey))]))))]),
        const SizedBox(height: 8), const Text('Coupons', style: TextStyle(fontWeight: FontWeight.bold)),
        for (final c in coupons) Card(child: SwitchListTile(value: c['active'] == true, onChanged: (_) => toggle(c), title: Text(c['code'], style: const TextStyle(fontWeight: FontWeight.w600)), subtitle: Text('${c['type'] == 'PERCENT' ? '${c['value']}% off' : '${rupees(c['value'])} off'}${(c['minOrderPaise'] ?? 0) > 0 ? ' · min ${rupees(c['minOrderPaise'])}' : ''}${c['firstOrderOnly'] == true ? ' · first order' : ''} · used ${c['usedCount']}${c['totalUses'] != null ? '/${c['totalUses']}' : ''}'))),
        if (coupons.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No coupons yet', style: TextStyle(color: Colors.grey)))),
        const SizedBox(height: 72),
      ])));
  }
}
