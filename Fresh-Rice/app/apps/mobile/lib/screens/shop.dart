import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api.dart';
import '../cart.dart';
import 'checkout.dart';

class ShopScreen extends StatefulWidget {
  const ShopScreen({super.key});
  @override
  State<ShopScreen> createState() => _ShopScreenState();
}

class _ShopScreenState extends State<ShopScreen> {
  String pin = '500072'; Map<String, dynamic>? data; String? err; final pinCtl = TextEditingController();

  @override
  void initState() { super.initState(); _init(); Cart.I.addListener(_r); }
  @override
  void dispose() { Cart.I.removeListener(_r); super.dispose(); }
  void _r() => setState(() {});

  Future<void> _init() async { final p = await SharedPreferences.getInstance(); pin = p.getString('pin') ?? pin; pinCtl.text = pin; load(); }
  Future<void> load() async {
    setState(() { err = null; });
    try { data = await Api.call('/catalog?pincode=$pin'); final p = await SharedPreferences.getInstance(); p.setString('pin', pin); } catch (e) { err = '$e'; }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final items = (data?['items'] as List?) ?? [];
    return Scaffold(
      appBar: AppBar(title: const Text('🌾 FreshRice'), actions: [
        Padding(padding: const EdgeInsets.only(right: 8), child: Badge(label: Text('${Cart.I.count}'), isLabelVisible: Cart.I.count > 0, child: IconButton(icon: const Icon(Icons.shopping_cart), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CheckoutScreen()))))),
      ]),
      body: RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(12), children: [
        Row(children: [
          const Text('Delivering to '),
          SizedBox(width: 90, child: TextField(controller: pinCtl, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(counterText: '', isDense: true, border: OutlineInputBorder()), onSubmitted: (v) { pin = v; load(); })),
          const SizedBox(width: 8),
          if (data?['zone'] != null) Chip(label: Text(data!['zone']['name'], style: const TextStyle(fontSize: 12)), backgroundColor: Colors.green.shade50)
          else if (data != null) const Chip(label: Text('Not serviceable yet', style: TextStyle(fontSize: 12))),
        ]),
        if (err != null) Text(err!, style: const TextStyle(color: Colors.red)),
        if (data == null && err == null) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
        ...items.where((v) => v['isAddon'] != true).map((v) => _variety(v)),
        if (items.any((v) => v['isAddon'] == true)) const Padding(padding: EdgeInsets.only(top: 12, bottom: 4), child: Text('Add-ons — same delivery, no extra fee', style: TextStyle(fontWeight: FontWeight.bold))),
        ...items.where((v) => v['isAddon'] == true).map((v) => _variety(v)),
      ])),
    );
  }

  Widget _variety(Map v) {
    final lot = v['lot']; final aged = v['agedPreferred'] == true;
    return Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [Text(v['name'], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)), const SizedBox(width: 6), if (v['nameTe'] != null) Text(v['nameTe'], style: const TextStyle(color: Colors.grey))]),
      if (lot != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Lot ${lot['lotNo']} · ${lot['mill']}, ${lot['district'] ?? ''}\nHarvest ${lot['harvestSeason']} · Milled ${fmtDate(lot['milledOn'])} · ${aged ? 'Aged' : 'Fresh'} ${lot['agedMonths']} mo · Moisture ${lot['moisturePct']}% · Brokens ${lot['brokenPct']}%', style: TextStyle(fontSize: 12, color: aged && lot['agedMonths'] < 6 ? Colors.orange.shade800 : Colors.grey.shade700)))
      else const Text('Out of stock', style: TextStyle(color: Colors.red, fontSize: 12)),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 8, children: [for (final s in v['skus'])
        OutlinedButton(onPressed: s['inStock'] == true ? () { Cart.I.add(CartLine(skuId: s['id'], name: v['name'], packKg: s['packKg'], pricePaise: s['pricePaise'], gstPct: s['gstPct'])); ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Added ${v['name']} ${s['packKg']} kg'), duration: const Duration(seconds: 1))); } : null,
          child: Column(mainAxisSize: MainAxisSize.min, children: [Text('${s['packKg']} kg', style: const TextStyle(fontWeight: FontWeight.bold)), Text('${rupees(s['pricePaise'])} · ${rupees((s['pricePaise'] / s['packKg']).round())}/kg', style: const TextStyle(fontSize: 11))]))]),
    ])));
  }
}
