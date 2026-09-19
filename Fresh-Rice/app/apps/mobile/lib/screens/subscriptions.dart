import 'package:flutter/material.dart';
import '../api.dart';
import 'orders.dart';

class SubscriptionsScreen extends StatefulWidget {
  const SubscriptionsScreen({super.key});
  @override
  State<SubscriptionsScreen> createState() => _SubscriptionsScreenState();
}

class _SubscriptionsScreenState extends State<SubscriptionsScreen> {
  List? subs;
  static const freq = {'WEEKLY': 'week', 'BIWEEKLY': '2 weeks', 'TRIWEEKLY': '3 weeks', 'MONTHLY': 'month'};
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async { subs = await Api.call('/subscriptions/mine'); if (mounted) setState(() {}); }
  Future<void> act(String id, String action) async { try { await Api.call('/subscriptions/$id', method: 'PATCH', body: {'action': action}); load(); } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'))); } }

  Future<void> create() async {
    final cat = await Api.call('/catalog'); final addrs = await Api.call('/addresses');
    final skus = [for (final v in cat['items']) if (v['isAddon'] != true) for (final s in v['skus']) {'id': s['id'], 'label': '${v['name']} ${s['packKg']}kg — ${rupees(s['pricePaise'])}'}];
    String? skuId; String? addressId = addrs.isNotEmpty ? addrs.first['id'] : null; String f = 'TRIWEEKLY'; int qty = 1; DateTime first = DateTime.now().add(const Duration(days: 1));
    if (!mounted) return;
    final ok = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (ctx) => StatefulBuilder(builder: (ctx, ss) => Padding(padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16), child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Text('New subscription', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
      DropdownButtonFormField<String>(value: skuId, decoration: const InputDecoration(labelText: 'Product'), items: [for (final s in skus) DropdownMenuItem(value: s['id'] as String, child: Text(s['label'] as String, overflow: TextOverflow.ellipsis))], onChanged: (v) => ss(() => skuId = v)),
      DropdownButtonFormField<String>(value: addressId, decoration: const InputDecoration(labelText: 'Address'), items: [for (final a in addrs) DropdownMenuItem(value: a['id'] as String, child: Text('${a['line1']} · ${a['pincode']}', overflow: TextOverflow.ellipsis))], onChanged: (v) => ss(() => addressId = v)),
      Row(children: [
        Expanded(child: DropdownButtonFormField<String>(value: f, decoration: const InputDecoration(labelText: 'Every'), items: [for (final e in freq.entries) DropdownMenuItem(value: e.key, child: Text(e.value))], onChanged: (v) => ss(() => f = v!))),
        const SizedBox(width: 8),
        Expanded(child: DropdownButtonFormField<int>(value: qty, decoration: const InputDecoration(labelText: 'Qty'), items: [for (var i = 1; i <= 5; i++) DropdownMenuItem(value: i, child: Text('$i'))], onChanged: (v) => ss(() => qty = v!))),
      ]),
      ListTile(title: const Text('First delivery'), subtitle: Text(ymd(first)), onTap: () async { final d = await showDatePicker(context: ctx, initialDate: first, firstDate: DateTime.now().add(const Duration(days: 1)), lastDate: DateTime.now().add(const Duration(days: 60))); if (d != null) ss(() => first = d); }),
      const Text('Paid via UPI AutoPay mandate. We message you 24 h before each delivery — reply SKIP to skip.', style: TextStyle(fontSize: 12, color: Colors.grey)),
      const SizedBox(height: 8),
      FilledButton(onPressed: skuId == null || addressId == null ? null : () => Navigator.pop(ctx, true), child: const Text('Start subscription')),
    ]))));
    if (ok == true) { try { await Api.call('/subscriptions', body: {'skuId': skuId, 'addressId': addressId, 'qty': qty, 'frequency': f, 'firstDeliveryOn': ymd(first)}); load(); } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'))); } }
  }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Subscriptions')), floatingActionButton: FloatingActionButton.extended(onPressed: create, icon: const Icon(Icons.add), label: const Text('New')),
    body: RefreshIndicator(onRefresh: load, child: subs == null ? const Center(child: CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(12), children: [
      const Text('Set & forget. Pause, skip or change anytime.', style: TextStyle(color: Colors.grey)),
      for (final s in subs!) Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [Expanded(child: Text('${s['qty']}× ${s['sku']['variety']['name']} ${s['sku']['packKg']}kg', style: const TextStyle(fontWeight: FontWeight.bold))), StatusChip(s['status'])]),
        Text('Every ${freq[s['frequency']]} · next ${fmtDate(s['nextRunOn'])}${s['skipNext'] == true ? ' (skipping)' : ''}\n${s['address']['line1']}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
        Wrap(spacing: 4, children: [
          if (s['status'] == 'ACTIVE') ...[TextButton(onPressed: () => act(s['id'], 'skip'), child: const Text('Skip next')), TextButton(onPressed: () => act(s['id'], 'pause'), child: const Text('Pause'))],
          if (s['status'] == 'PAUSED') TextButton(onPressed: () => act(s['id'], 'resume'), child: const Text('Resume')),
          TextButton(onPressed: () => act(s['id'], 'cancel'), child: const Text('Cancel', style: TextStyle(color: Colors.red))),
        ]),
      ]))),
    ])));
}
