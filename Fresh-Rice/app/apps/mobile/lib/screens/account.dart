import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../cart.dart';
import 'checkout.dart';

class AccountScreen extends StatefulWidget {
  final VoidCallback onLogout; final VoidCallback? onSettings;
  const AccountScreen({super.key, required this.onLogout, this.onSettings});
  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  Map? me; Map? ref; Map? meter; final _emailCtl = TextEditingController(); bool _emailSaved = false;
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async { try { ref = await Api.call('/auth/referrals/mine'); me = await Api.call('/auth/me'); if ((me?['role'] ?? 'CUSTOMER') == 'CUSTOMER') { try { meter = await Api.call('/orders/rice-meter'); } catch (_) {} } await Api.setSession(Api.token, Map<String, dynamic>.from(me!)..remove('addresses')..remove('b2bAccount')); } catch (_) {} if (mounted) setState(() {}); }
  @override
  Widget build(BuildContext context) {
    final u = me ?? Api.user ?? {};
    return Scaffold(appBar: AppBar(title: const Text('Account'), actions: [if (widget.onSettings != null) IconButton(icon: const Icon(Icons.settings), tooltip: 'Settings & profile', onPressed: widget.onSettings)]), body: ListView(padding: const EdgeInsets.all(12), children: [
      if (meter != null) _riceMeter(context, u),
      Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(u['name'] ?? 'Set your name', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)), Text(u['phone'] ?? '', style: const TextStyle(color: Colors.grey)),
        const SizedBox(height: 8), Text('Wallet: ${rupees(u['walletBalance'])}', style: const TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: TextField(controller: _emailCtl..text = _emailCtl.text.isEmpty ? (u['email'] ?? '') : _emailCtl.text, decoration: const InputDecoration(labelText: 'Email (get OTP + order updates by email too)', isDense: true, border: OutlineInputBorder()), keyboardType: TextInputType.emailAddress, onChanged: (_) => setState(() => _emailSaved = false))),
          const SizedBox(width: 8),
          FilledButton(onPressed: () async { await Api.call('/auth/me', method: 'PATCH', body: {'email': _emailCtl.text}); setState(() => _emailSaved = true); load(); }, child: const Text('Save')),
        ]),
        if (_emailSaved) const Padding(padding: EdgeInsets.only(top: 4), child: Text('Saved', style: TextStyle(color: Colors.green, fontSize: 12))),
        const SizedBox(height: 8),
        Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: const Color(0xFFF4ECD8), borderRadius: BorderRadius.circular(8)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Refer a neighbour · code ${u['referralCode'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.bold)),
          const Text('They get ₹100 off their first bag; you get ₹100 in your wallet the moment it is delivered.', style: TextStyle(fontSize: 12)),
          if (ref != null) Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Row(children: [for (final e in [['${ref!['invited']}', 'signed up'], ['${ref!['converted']}', 'delivered'], [rupees(ref!['earnedPaise']), 'earned']]) Expanded(child: Container(margin: const EdgeInsets.only(right: 6), padding: const EdgeInsets.all(6), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)), child: Column(children: [Text(e[0], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)), Text(e[1], style: const TextStyle(fontSize: 10, color: Colors.grey))])))])),
          if (ref != null) for (final r in (ref!['list'] as List).take(5)) Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text(r['name'], style: const TextStyle(fontSize: 12)), Text(r['status'], style: TextStyle(fontSize: 12, color: r['status'] == 'delivered' ? Colors.green : Colors.grey))]),
          FilledButton.icon(onPressed: () => launchUrl(Uri.parse('https://wa.me/?text=${Uri.encodeComponent(ref?['shareText'] ?? 'Use my FreshRice code ${u['referralCode']} for ₹100 off your first bag.')}'), mode: LaunchMode.externalApplication), icon: const Icon(Icons.share), label: const Text('Share on WhatsApp')),
        ])),
      ]))),
      if (me?['b2bAccount'] != null) Card(child: ListTile(leading: const Icon(Icons.business), title: Text(me!['b2bAccount']['name']), subtitle: const Text('Business account · tier pricing · GST invoices'))),
      Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Addresses', style: TextStyle(fontWeight: FontWeight.bold)),
        for (final a in (me?['addresses'] ?? [])) ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text('${a['line1']}${a['complex'] != null && a['complex'] != '' ? ', ${a['complex']}' : ''}'), subtitle: Text('${a['pincode']} · ${a['zone']?['name'] ?? 'not serviceable'}'), trailing: IconButton(icon: const Icon(Icons.delete_outline), onPressed: () async { await Api.call('/addresses/${a['id']}', method: 'DELETE'); load(); })),
        const Text('Add addresses from the checkout screen.', style: TextStyle(fontSize: 12, color: Colors.grey)),
      ]))),
      Card(child: ListTile(leading: const Icon(Icons.language), title: const Text('Language'), trailing: DropdownButton<String>(value: u['lang'] ?? 'te', items: const [DropdownMenuItem(value: 'te', child: Text('తెలుగు')), DropdownMenuItem(value: 'hi', child: Text('हिन्दी')), DropdownMenuItem(value: 'en', child: Text('English'))], onChanged: (v) async { await Api.call('/auth/me', method: 'PATCH', body: {'lang': v}); load(); }))),
      Card(child: ListTile(leading: const Icon(Icons.chat), title: const Text('WhatsApp support'), onTap: () => launchUrl(Uri.parse('https://wa.me/919000000001'), mode: LaunchMode.externalApplication))),
      const SizedBox(height: 8),
      OutlinedButton(onPressed: () async { await Api.setSession(null, null); widget.onLogout(); }, child: const Text('Log out')),
      Padding(padding: const EdgeInsets.all(8), child: Text('Server: $apiUrl', style: const TextStyle(fontSize: 10, color: Colors.grey), textAlign: TextAlign.center)),
    ]));
  }

  Widget _riceMeter(BuildContext context, Map u) {
    final m = meter!; final has = m['hasHistory'] == true;
    final sizeRow = Row(children: [const Text('People at home', style: TextStyle(color: Colors.grey)), const SizedBox(width: 8), DropdownButton<int>(value: u['householdSize'], hint: const Text('—'), items: [1, 2, 3, 4, 5, 6, 8, 10].map((n) => DropdownMenuItem(value: n, child: Text('$n'))).toList(), onChanged: (v) async { if (v == null) return; await Api.call('/auth/me', method: 'PATCH', body: {'householdSize': v}); load(); })]);
    if (!has) return Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('Rice meter', style: TextStyle(fontWeight: FontWeight.bold)), const Text("After your first delivery we'll show how much is left and when to reorder.", style: TextStyle(fontSize: 12, color: Colors.grey)), sizeRow])));
    final pct = ((m['pctLeft'] ?? 0) as num).clamp(0, 100) / 100.0; final soon = m['reorderSoon'] == true; final sug = m['suggested'];
    final basis = m['basis'] == 'measured' ? ' (from your orders)' : m['basis'] == 'household' ? ' (from household size)' : ' (typical family)';
    return Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('Rice meter', style: TextStyle(fontWeight: FontWeight.bold)), Text(m['daysLeft'] == 0 ? 'Probably out' : '~${m['daysLeft']} days left', style: TextStyle(fontWeight: FontWeight.bold, color: soon ? Colors.orange.shade800 : Colors.green.shade700))]),
      const SizedBox(height: 6), ClipRRect(borderRadius: BorderRadius.circular(6), child: LinearProgressIndicator(value: pct, minHeight: 10, color: pct < 0.25 ? Colors.orange : Colors.green.shade600, backgroundColor: const Color(0xFFF4ECD8))),
      const SizedBox(height: 4), Text('About ${m['kgLeft']} kg of your last ${m['lastKg']} kg bag left · ~${m['dailyKg']} kg/day$basis', style: const TextStyle(fontSize: 12, color: Colors.grey)),
      sizeRow,
      if (sug != null) SizedBox(width: double.infinity, child: Builder(builder: (ctx) { void go() { Cart.I.add(CartLine(skuId: sug['skuId'], name: sug['name'], packKg: sug['packKg'], pricePaise: sug['pricePaise'], gstPct: sug['gstPct'], qty: sug['qty'] ?? 1)); Navigator.push(ctx, MaterialPageRoute(builder: (_) => const CheckoutScreen())); } final label = Text('Reorder ${sug['qty']} × ${sug['name']} ${sug['packKg']} kg'); return soon ? FilledButton(onPressed: go, child: label) : OutlinedButton(onPressed: go, child: label); })),
    ])));
  }
}
