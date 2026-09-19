import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List? orders;
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async { orders = await Api.call('/orders/mine'); if (mounted) setState(() {}); }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('My orders')), body: RefreshIndicator(onRefresh: load, child: orders == null ? const Center(child: CircularProgressIndicator()) : orders!.isEmpty ? const Center(child: Text('No orders yet')) : ListView(padding: const EdgeInsets.all(12), children: [
    for (final o in orders!) Card(child: ListTile(onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(id: o['id']))).then((_) => load()),
      title: Row(children: [Text('#${o['orderNo']}', style: const TextStyle(fontWeight: FontWeight.bold)), const Spacer(), StatusChip(o['status'])]),
      subtitle: Text('${(o['items'] as List).map((i) => '${i['qty']}× ${i['sku']['variety']['name']} ${i['sku']['packKg']}kg').join(', ')}\nDelivery ${fmtDate(o['deliveryDate'])} ${o['slot']?['label'] ?? ''} · ${rupees(o['totalPaise'])}'), isThreeLine: true)),
  ])));
}

class StatusChip extends StatelessWidget {
  final String s;
  const StatusChip(this.s, {super.key});
  @override
  Widget build(BuildContext context) {
    final c = {'DELIVERED': Colors.green, 'OUT_FOR_DELIVERY': Colors.orange, 'CANCELLED': Colors.red, 'FAILED': Colors.red, 'PACKED': Colors.indigo, 'CONFIRMED': Colors.blue, 'ACTIVE': Colors.green, 'PAUSED': Colors.orange}[s] ?? Colors.grey;
    return Chip(label: Text(s.replaceAll('_', ' '), style: TextStyle(fontSize: 11, color: c.shade800)), backgroundColor: c.shade50, visualDensity: VisualDensity.compact, padding: EdgeInsets.zero);
  }
}

class OrderDetailScreen extends StatefulWidget {
  final String id;
  const OrderDetailScreen({super.key, required this.id});
  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  Map? o; int score = 9; bool rated = false;
  static const steps = ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async { o = await Api.call('/orders/${widget.id}'); if (mounted) setState(() {}); }
  @override
  Widget build(BuildContext context) {
    if (o == null) return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    final idx = steps.indexOf(o!['status']); final rider = o!['stop']?['route']?['rider'];
    return Scaffold(appBar: AppBar(title: Text('Order #${o!['orderNo']}'), actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: load)]), body: ListView(padding: const EdgeInsets.all(12), children: [
      Row(children: [StatusChip(o!['status']), const Spacer(), Text('Delivery ${fmtDate(o!['deliveryDate'])} ${o!['slot']?['label'] ?? ''}')]),
      const SizedBox(height: 8),
      Row(children: [for (var i = 0; i < steps.length; i++) Expanded(child: Column(children: [Container(height: 6, margin: const EdgeInsets.symmetric(horizontal: 2), decoration: BoxDecoration(color: i <= idx ? Colors.green : Colors.grey.shade300, borderRadius: BorderRadius.circular(3))), Text(steps[i].replaceAll('_', ' '), style: TextStyle(fontSize: 9, color: i <= idx ? Colors.green.shade800 : Colors.grey))]))]),
      if (rider != null && o!['status'] == 'OUT_FOR_DELIVERY') Card(child: ListTile(leading: const Icon(Icons.delivery_dining), title: Text('Rider ${rider['name']} · stop ${o!['stop']['seq']}'), trailing: IconButton(icon: const Icon(Icons.call), onPressed: () => launchUrl(Uri.parse('tel:${rider['phone']}'))))),
      Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(children: [
        for (final i in o!['items']) ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text('${i['qty']}× ${i['sku']['variety']['name']} ${i['sku']['packKg']}kg'), subtitle: i['lot'] != null ? Text('Lot ${i['lot']['lotNo']} · ${i['lot']['vendor']?['name'] ?? ''} · milled ${fmtDate(i['lot']['milledOn'])}', style: const TextStyle(fontSize: 11)) : null, trailing: Text(rupees(i['unitPaise'] * i['qty']))),
        const Divider(), Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('GST'), Text(rupees(o!['gstPaise']))]),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('Total', style: TextStyle(fontWeight: FontWeight.bold)), Text(rupees(o!['totalPaise']), style: const TextStyle(fontWeight: FontWeight.bold))]),
        Text('${o!['payment']?['method']} · ${o!['payment']?['status']}', style: const TextStyle(color: Colors.grey, fontSize: 12)),
      ]))),
      Row(children: [
        if (['CONFIRMED', 'PENDING_PAYMENT'].contains(o!['status'])) TextButton(onPressed: () async { await Api.call('/orders/${widget.id}/cancel', method: 'POST'); load(); }, child: const Text('Cancel order', style: TextStyle(color: Colors.red))),
        if (!['PENDING_PAYMENT', 'CANCELLED'].contains(o!['status'])) TextButton.icon(onPressed: () => launchUrl(Uri.parse('$apiUrl/v1/orders/${widget.id}/invoice.html?t=${Api.token}'), mode: LaunchMode.externalApplication), icon: const Icon(Icons.receipt), label: const Text('Invoice')),
        if (!['PENDING_PAYMENT', 'CANCELLED'].contains(o!['status'])) TextButton.icon(onPressed: () async { try { final r = await Api.call('/orders/${widget.id}/invoice/resend', body: {}); if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Invoice ${r['invoiceNo']} sent · WhatsApp: ${r['results']['whatsapp'] ?? '-'}'))); } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'))); } }, icon: const Icon(Icons.send), label: const Text('Resend invoice')),
      ]),
      if (o!['status'] == 'DELIVERED' && !rated && !(o!['events'] as List).any((e) => e['type'] == 'RATED')) Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(children: [
        const Text('How likely are you to recommend FreshRice? (0–10)'),
        Slider(value: score.toDouble(), min: 0, max: 10, divisions: 10, label: '$score', onChanged: (v) => setState(() => score = v.round())),
        FilledButton(onPressed: () async { await Api.call('/orders/${widget.id}/rate', body: {'score': score}); setState(() => rated = true); }, child: const Text('Submit')),
      ]))),
      const SizedBox(height: 8),
      for (final e in o!['events']) Text('${fmtDate(e['at'])} · ${e['type']}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
    ]));
  }
}
