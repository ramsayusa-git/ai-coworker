import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';

const stages = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'];

/// Sales profile: my leads pipeline + today's follow-ups, log calls/visits, call/WhatsApp, move stage, convert.
class SalesScreen extends StatefulWidget {
  const SalesScreen({super.key});
  @override
  State<SalesScreen> createState() => _SalesScreenState();
}

class _SalesScreenState extends State<SalesScreen> {
  List leads = []; List today = []; List overdue = []; String filter = 'ALL'; bool loading = true;
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async {
    try { final r = await Future.wait([Api.call('/sales/leads'), Api.call('/sales/followups/today'), Api.call('/sales/followups/overdue')]); leads = r[0]; today = r[1]; overdue = r[2]; } catch (e) { snack('$e'); }
    loading = false; if (mounted) setState(() {});
  }
  void snack(String m) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m))); }
  String wa(String phone) => 'https://wa.me/${phone.replaceAll(RegExp(r'\D'), '')}';

  Future<void> addLead() async {
    final name = TextEditingController(), phone = TextEditingController(), company = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(title: const Text('New lead'), content: Column(mainAxisSize: MainAxisSize.min, children: [TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')), TextField(controller: phone, decoration: const InputDecoration(labelText: 'Phone'), keyboardType: TextInputType.phone), TextField(controller: company, decoration: const InputDecoration(labelText: 'Company / society (optional)'))]), actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add'))]));
    if (ok != true || name.text.isEmpty || phone.text.isEmpty) return;
    try { await Api.call('/sales/leads', body: {'name': name.text, 'phone': phone.text, if (company.text.isNotEmpty) 'company': company.text}); load(); } catch (e) { snack('$e'); }
  }

  Future<void> logActivity(Map l) async {
    String type = 'CALL'; final note = TextEditingController(); DateTime? next;
    final ok = await showDialog<bool>(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, set) => AlertDialog(title: Text('Log activity · ${l['name']}'), content: Column(mainAxisSize: MainAxisSize.min, children: [
      DropdownButton<String>(value: type, isExpanded: true, items: ['CALL', 'WHATSAPP', 'EMAIL', 'VISIT', 'NOTE'].map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(), onChanged: (v) => set(() => type = v!)),
      TextField(controller: note, decoration: const InputDecoration(labelText: 'Note'), maxLines: 2),
      TextButton.icon(onPressed: () async { final d = await showDatePicker(context: ctx, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 90)), initialDate: DateTime.now().add(const Duration(days: 1))); if (d != null) set(() => next = d); }, icon: const Icon(Icons.event), label: Text(next == null ? 'Set next follow-up' : 'Follow up ${next!.toIso8601String().substring(0, 10)}')),
    ]), actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save'))])));
    if (ok != true) return;
    try { await Api.call('/sales/leads/${l['id']}/activities', body: {'type': type, if (note.text.isNotEmpty) 'note': note.text, if (next != null) 'nextFollowUpAt': next!.toIso8601String().substring(0, 10)}); load(); } catch (e) { snack('$e'); }
  }

  Future<void> setStage(Map l, String s) async { try { await Api.call('/sales/leads/${l['id']}', method: 'PATCH', body: {'status': s}); load(); } catch (e) { snack('$e'); } }
  Future<void> convert(Map l) async { try { await Api.call('/sales/leads/${l['id']}/convert', body: {}); snack('Converted to B2B account'); load(); } catch (e) { snack('$e'); } }

  void open(Map l) {
    showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => DraggableScrollableSheet(expand: false, initialChildSize: 0.7, builder: (_, sc) => ListView(controller: sc, padding: const EdgeInsets.all(16), children: [
      Text(l['name'] ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)), Text('${l['phone']}${l['company'] != null ? ' · ${l['company']}' : ''}'),
      const SizedBox(height: 8), Row(children: [FilledButton.icon(onPressed: () => launchUrl(Uri.parse('tel:${l['phone']}')), icon: const Icon(Icons.call), label: const Text('Call')), const SizedBox(width: 8), OutlinedButton.icon(onPressed: () => launchUrl(Uri.parse(wa(l['phone'])), mode: LaunchMode.externalApplication), icon: const Icon(Icons.chat), label: const Text('WhatsApp'))]),
      const SizedBox(height: 12), const Text('Stage', style: TextStyle(fontWeight: FontWeight.bold)),
      Wrap(spacing: 6, children: [for (final s in stages) ChoiceChip(label: Text(s), selected: l['status'] == s, onSelected: (_) { Navigator.pop(context); setStage(l, s); })]),
      const SizedBox(height: 12), Row(children: [FilledButton.tonalIcon(onPressed: () { Navigator.pop(context); logActivity(l); }, icon: const Icon(Icons.edit_note), label: const Text('Log activity')), const SizedBox(width: 8), if (l['b2bAccountId'] == null && l['status'] != 'LOST') OutlinedButton(onPressed: () { Navigator.pop(context); convert(l); }, child: const Text('Convert to B2B'))]),
      if (l['notes'] != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(l['notes'], style: const TextStyle(color: Colors.grey))),
      const SizedBox(height: 12), const Text('Recent activity', style: TextStyle(fontWeight: FontWeight.bold)),
      for (final a in (l['activities'] ?? [])) ListTile(dense: true, contentPadding: EdgeInsets.zero, leading: const Icon(Icons.history, size: 18), title: Text('${a['type']}${a['note'] != null ? ' · ${a['note']}' : ''}'), subtitle: Text(fmtDate(a['createdAt']))),
    ])));
  }

  @override
  Widget build(BuildContext context) {
    final due = [...overdue, ...today]; final shown = leads.where((l) => filter == 'ALL' || l['status'] == filter).toList();
    return Scaffold(appBar: AppBar(title: const Text('Sales · leads'), actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: load)]),
      floatingActionButton: FloatingActionButton.extended(onPressed: addLead, icon: const Icon(Icons.person_add), label: const Text('Lead')),
      body: loading ? const Center(child: CircularProgressIndicator()) : RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(12), children: [
        if (due.isNotEmpty) Card(color: Colors.amber.shade50, child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Follow-ups due: ${overdue.length} overdue · ${today.length} today', style: const TextStyle(fontWeight: FontWeight.bold)), for (final l in due.take(6)) InkWell(onTap: () => open(l), child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Row(children: [Expanded(child: Text('${l['name']} · ${l['status']}')), IconButton(icon: const Icon(Icons.call, size: 20), onPressed: () => launchUrl(Uri.parse('tel:${l['phone']}')))])))]))),
        SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: [for (final s in ['ALL', ...stages]) Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: Text(s == 'ALL' ? 'All (${leads.length})' : '$s (${leads.where((l) => l['status'] == s).length})'), selected: filter == s, onSelected: (_) => setState(() => filter = s)))])),
        for (final l in shown) Card(child: ListTile(onTap: () => open(l), title: Text(l['name'] ?? ''), subtitle: Text('${l['status']}${l['company'] != null ? ' · ${l['company']}' : ''}${l['nextFollowUpAt'] != null ? ' · next ${fmtDate(l['nextFollowUpAt'])}' : ''}'), trailing: IconButton(icon: const Icon(Icons.call), onPressed: () => launchUrl(Uri.parse('tel:${l['phone']}'))))),
        if (shown.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No leads here', style: TextStyle(color: Colors.grey)))),
        const SizedBox(height: 72),
      ])));
  }
}
