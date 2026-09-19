import 'package:flutter/material.dart';
import '../api.dart';
import '../cart.dart';
import 'orders.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});
  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  List addresses = []; String? addressId; String method = 'UPI'; String? slotId; List slots = []; DateTime date = DateTime.now().add(const Duration(days: 1)); String? err; bool busy = false; final couponCtl = TextEditingController(); Map? couponRes;
  @override
  void initState() { super.initState(); loadAddr(); Cart.I.addListener(_r); }
  @override
  void dispose() { Cart.I.removeListener(_r); super.dispose(); }
  void _r() => setState(() {});

  Future<void> loadAddr() async {
    addresses = await Api.call('/addresses');
    if (addresses.isNotEmpty) { addressId = addresses.first['id']; await loadSlots(); }
    if (mounted) setState(() {});
  }
  Future<void> loadSlots() async {
    final a = addresses.firstWhere((x) => x['id'] == addressId, orElse: () => null);
    if (a == null) return;
    final z = await Api.call('/zones/check?pincode=${a['pincode']}&date=${ymd(date)}');
    slots = z['slots'] ?? []; slotId = null;
  }

  Future<void> place() async {
    setState(() { busy = true; err = null; });
    try {
      final o = await Api.call('/orders', body: {'addressId': addressId, 'slotId': slotId, 'deliveryDate': ymd(date), 'items': Cart.I.lines.map((l) => {'skuId': l.skuId, 'qty': l.qty}).toList(), 'paymentMethod': method, if (couponRes != null) 'couponCode': couponRes!['code'], 'idempotencyKey': 'app:${Api.user?['id']}:${DateTime.now().millisecondsSinceEpoch}'});
      Cart.I.clear();
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(id: o['id'])));
    } catch (e) { setState(() => err = '$e'); } finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> addAddress() async {
    final f = {'label': 'Home', 'line1': '', 'complex': '', 'landmark': '', 'floor': '0', 'pincode': ''}; bool lift = true;
    final ok = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (ctx) => Padding(padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16), child: StatefulBuilder(builder: (ctx, ss) => Column(mainAxisSize: MainAxisSize.min, children: [
      const Text('New address', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
      for (final k in ['line1', 'complex', 'landmark', 'pincode', 'floor']) Padding(padding: const EdgeInsets.only(top: 8), child: TextField(decoration: InputDecoration(labelText: {'line1': 'Flat / house, street', 'complex': 'Apartment / complex', 'landmark': 'Landmark', 'pincode': 'Pincode', 'floor': 'Floor'}[k], border: const OutlineInputBorder(), isDense: true), keyboardType: k == 'pincode' || k == 'floor' ? TextInputType.number : null, onChanged: (v) => f[k] = v)),
      SwitchListTile(title: const Text('Building has a lift'), value: lift, onChanged: (v) => ss(() => lift = v)),
      FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
    ]))));
    if (ok == true) {
      try { await Api.call('/addresses', body: {...f, 'floor': int.tryParse(f['floor']!) ?? 0, 'hasLift': lift}); await loadAddr(); }
      catch (e) { setState(() => err = '$e'); }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = Cart.I;
    return Scaffold(appBar: AppBar(title: const Text('Cart & checkout')), body: c.lines.isEmpty ? const Center(child: Text('Your cart is empty')) : ListView(padding: const EdgeInsets.all(12), children: [
      ...c.lines.map((l) => Card(child: ListTile(title: Text('${l.name} ${l.packKg} kg'), subtitle: Text('${rupees(l.pricePaise)} each'), trailing: Row(mainAxisSize: MainAxisSize.min, children: [IconButton(icon: const Icon(Icons.remove), onPressed: () => c.setQty(l.skuId, l.qty - 1)), Text('${l.qty}'), IconButton(icon: const Icon(Icons.add), onPressed: () => c.setQty(l.skuId, l.qty + 1))])))),
      const SizedBox(height: 8), const Text('Deliver to', style: TextStyle(fontWeight: FontWeight.bold)),
      ...addresses.map((a) => RadioListTile<String>(value: a['id'], groupValue: addressId, onChanged: (v) async { addressId = v; await loadSlots(); setState(() {}); }, title: Text('${a['line1']}${a['complex'] != null && a['complex'] != '' ? ', ${a['complex']}' : ''}'), subtitle: Text('${a['pincode']} · ${a['zone']?['name'] ?? 'not serviceable'}'), dense: true)),
      TextButton.icon(onPressed: addAddress, icon: const Icon(Icons.add), label: const Text('Add address')),
      Row(children: [
        Expanded(child: ListTile(title: const Text('Delivery date'), subtitle: Text(ymd(date)), onTap: () async { final d = await showDatePicker(context: context, initialDate: date, firstDate: DateTime.now().add(const Duration(days: 1)), lastDate: DateTime.now().add(const Duration(days: 30))); if (d != null) setState(() => date = d); })),
        Expanded(child: DropdownButtonFormField<String>(value: slotId, decoration: const InputDecoration(labelText: 'Slot'), items: [const DropdownMenuItem(value: null, child: Text('Any')), ...slots.map((s) => DropdownMenuItem(value: s['id'] as String, enabled: (s['available'] ?? 1) > 0, child: Text('${s['label']}${(s['available'] ?? 1) <= 0 ? ' (full)' : ''}')))], onChanged: (v) => setState(() => slotId = v))),
      ]),
      const Text('Payment', style: TextStyle(fontWeight: FontWeight.bold)),
      for (final m in ['UPI', 'CARD', 'WALLET', 'COD']) RadioListTile<String>(value: m, groupValue: method, onChanged: (v) => setState(() => method = v!), dense: true, title: Text({'UPI': 'UPI (GPay / PhonePe)', 'CARD': 'Card', 'WALLET': 'Wallet (${rupees(Api.user?['walletBalance'])})', 'COD': 'Cash on delivery'}[m]!)),
      Card(child: Padding(padding: const EdgeInsets.all(12), child: Row(children: [Expanded(child: TextField(controller: couponCtl, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Coupon code', isDense: true, border: OutlineInputBorder()))), const SizedBox(width: 8), OutlinedButton(onPressed: () async { try { couponRes = await Api.call('/coupons/check', body: {'code': couponCtl.text, 'subtotalPaise': c.subtotal}); err = null; } catch (e) { couponRes = null; err = '$e'; } setState(() {}); }, child: const Text('Apply'))]))),
      if (couponRes != null) Text('${couponRes!['code']}: −${rupees(couponRes!['discountPaise'])}', style: const TextStyle(color: Colors.green)),
      Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(children: [
        _row('Subtotal (${c.kg} kg)', rupees(c.subtotal)), _row('GST', rupees(c.gst)), _row('Delivery', 'Free'), const Divider(), _row('Total', rupees(c.total - (couponRes?['discountPaise'] ?? 0)), bold: true)]))),
      if (err != null) Text(err!, style: const TextStyle(color: Colors.red)),
      const SizedBox(height: 8),
      FilledButton(onPressed: addressId == null || busy ? null : place, child: Text(busy ? 'Placing…' : 'Place order')),
    ]));
  }
  Widget _row(String a, String b, {bool bold = false}) => Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text(a, style: TextStyle(fontWeight: bold ? FontWeight.bold : null)), Text(b, style: TextStyle(fontWeight: bold ? FontWeight.bold : null))]));
}
