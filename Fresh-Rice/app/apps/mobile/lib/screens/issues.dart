import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../api.dart';

const _cats = {'WRONG_BAG': 'Wrong bag / variety', 'LATE': 'Late or not delivered', 'DAMAGED': 'Damaged bag', 'MISSING': 'Missing item', 'PAYMENT': 'Payment / refund', 'RIDER': 'Rider behaviour', 'APP': 'App problem', 'OTHER': 'Something else'};
bool get _staff => ['ADMIN', 'OPS', 'SALES'].contains(Api.user?['role']);

/// Help & issues: customers raise + follow tickets; staff (Sales/Ops profile) work the queue.
class IssuesScreen extends StatefulWidget {
  final String? orderId;
  const IssuesScreen({super.key, this.orderId});
  @override
  State<IssuesScreen> createState() => _IssuesScreenState();
}

class _IssuesScreenState extends State<IssuesScreen> {
  List issues = []; bool loading = true; String filter = 'active';
  @override
  void initState() { super.initState(); load(); if (widget.orderId != null) WidgetsBinding.instance.addPostFrameCallback((_) => raise()); }
  Future<void> load() async {
    final q = _staff ? (filter == 'active' ? '?status=OPEN,IN_PROGRESS,WAITING_CUSTOMER' : filter == 'mine' ? '?mine=1' : '?status=RESOLVED,CLOSED') : '';
    try { issues = await Api.call('/issues$q'); } catch (e) { snack('$e'); } loading = false; if (mounted) setState(() {});
  }
  void snack(String m) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m))); }

  Future<void> raise() async {
    String cat = 'LATE'; final title = TextEditingController(), desc = TextEditingController(), phone = TextEditingController(); String? photo;
    final ok = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (ctx) => StatefulBuilder(builder: (ctx, set) => Padding(padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Report a problem', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
      if (_staff) TextField(controller: phone, decoration: const InputDecoration(labelText: 'Customer phone (raising on their behalf)'), keyboardType: TextInputType.phone),
      DropdownButton<String>(value: cat, isExpanded: true, items: _cats.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(), onChanged: (v) => set(() => cat = v!)),
      TextField(controller: title, decoration: const InputDecoration(labelText: 'In one line'), maxLength: 140),
      TextField(controller: desc, decoration: const InputDecoration(labelText: 'Details'), maxLines: 3),
      Row(children: [TextButton.icon(onPressed: () async { final x = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 1200, imageQuality: 70); if (x != null) { final b = await x.readAsBytes(); if (b.length > 400 * 1024) { snack('Photo too large'); return; } set(() => photo = 'data:image/jpeg;base64,${base64Encode(b)}'); } }, icon: const Icon(Icons.camera_alt), label: Text(photo == null ? 'Add photo' : 'Photo added'))]),
      SizedBox(width: double.infinity, child: FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Send to FreshRice'))),
    ]))));
    if (ok != true || title.text.trim().isEmpty) return;
    try { await Api.call('/issues', body: {'category': cat, 'title': title.text.trim(), if (desc.text.isNotEmpty) 'description': desc.text, if (widget.orderId != null) 'orderId': widget.orderId, if (photo != null) 'photo': photo, if (_staff && phone.text.isNotEmpty) 'onBehalfOfPhone': phone.text}); snack('Logged — we will reply on WhatsApp'); load(); } catch (e) { snack('$e'); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(appBar: AppBar(title: Text(_staff ? 'Issues desk' : 'Help & issues'), actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: load)]),
      floatingActionButton: FloatingActionButton.extended(onPressed: raise, icon: const Icon(Icons.report_problem), label: Text(_staff ? 'Raise for customer' : 'Report a problem')),
      body: Column(children: [
        if (_staff) Padding(padding: const EdgeInsets.all(8), child: Row(children: [for (final f in [['active', 'Active'], ['mine', 'Mine'], ['done', 'Resolved']]) Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: Text(f[1]), selected: filter == f[0], onSelected: (_) { setState(() => filter = f[0]); load(); }))])),
        Expanded(child: loading ? const Center(child: CircularProgressIndicator()) : issues.isEmpty ? const Center(child: Text('No issues', style: TextStyle(color: Colors.grey))) : RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.fromLTRB(8, 0, 8, 80), children: [
          for (final i in issues) Card(child: ListTile(onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => IssueThread(id: i['id']))).then((_) => load()),
            leading: CircleAvatar(backgroundColor: i['priority'] == 'URGENT' || i['priority'] == 'HIGH' ? Colors.orange : Colors.grey.shade400, child: Text('#${i['ticketNo']}', style: const TextStyle(fontSize: 10, color: Colors.white))),
            title: Text(i['title'] ?? ''), subtitle: Text('${(i['status'] as String).replaceAll('_', ' ').toLowerCase()} · ${i['category']}${_staff ? ' · ${i['raisedBy']?['name'] ?? i['raisedBy']?['phone'] ?? ''}' : ''}${i['messages'] != null && (i['messages'] as List).isNotEmpty ? '\n${i['messages'][0]['fromStaff'] == true ? 'FreshRice: ' : ''}${i['messages'][0]['body']}' : ''}', maxLines: 2, overflow: TextOverflow.ellipsis),
            trailing: ['RESOLVED', 'CLOSED'].contains(i['status']) ? const Icon(Icons.check_circle, color: Colors.green) : const Icon(Icons.chevron_right))),
        ]))),
      ]));
  }
}

class IssueThread extends StatefulWidget {
  final String id;
  const IssueThread({super.key, required this.id});
  @override
  State<IssueThread> createState() => _IssueThreadState();
}

class _IssueThreadState extends State<IssueThread> {
  Map? i; final msg = TextEditingController(); bool internal = false;
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async { try { i = await Api.call('/issues/${widget.id}'); } catch (e) { snack('$e'); } if (mounted) setState(() {}); }
  void snack(String m) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m))); }
  Future<void> send() async { if (msg.text.trim().isEmpty) return; try { await Api.call('/issues/${widget.id}/messages', body: {'body': msg.text.trim(), 'internal': internal}); msg.clear(); load(); } catch (e) { snack('$e'); } }
  Future<void> patch(Map b) async { try { await Api.call('/issues/${widget.id}', method: 'PATCH', body: b); load(); } catch (e) { snack('$e'); } }
  Future<void> resolve() async { final c = TextEditingController(text: i?['resolution'] ?? ''); final ok = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(title: const Text('Resolve'), content: TextField(controller: c, decoration: const InputDecoration(labelText: 'What was done'), maxLines: 2), actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Mark resolved'))])); if (ok == true && c.text.trim().isNotEmpty) patch({'status': 'RESOLVED', 'resolution': c.text.trim()}); }
  @override
  Widget build(BuildContext context) {
    final d = i; if (d == null) return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    final done = ['RESOLVED', 'CLOSED'].contains(d['status']);
    return Scaffold(appBar: AppBar(title: Text('#${d['ticketNo']} · ${d['title']}'), actions: [if (_staff && !done) IconButton(icon: const Icon(Icons.task_alt), tooltip: 'Resolve', onPressed: resolve)]), body: Column(children: [
      Expanded(child: ListView(padding: const EdgeInsets.all(12), children: [
        Text('${(d['status'] as String).replaceAll('_', ' ')} · ${d['category']} · ${d['priority']}${d['order'] != null ? ' · order #${d['order']['orderNo']}' : ''}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
        if (_staff) Row(children: [const Text('Status: '), DropdownButton<String>(value: d['status'], items: ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'].map((s) => DropdownMenuItem(value: s, child: Text(s.replaceAll('_', ' ')))).toList(), onChanged: (v) { if (v == null) return; if ((v == 'RESOLVED' || v == 'CLOSED') && (d['resolution'] == null)) { resolve(); } else { patch({'status': v}); } })]),
        if (d['description'] != null) Card(child: Padding(padding: const EdgeInsets.all(10), child: Text(d['description']))),
        if (d['photo'] != null) Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Image.memory(base64Decode((d['photo'] as String).split(',').last), height: 180)),
        for (final m in (d['messages'] as List)) Align(alignment: m['fromStaff'] == true ? Alignment.centerLeft : Alignment.centerRight, child: Container(margin: const EdgeInsets.symmetric(vertical: 3), padding: const EdgeInsets.all(10), constraints: const BoxConstraints(maxWidth: 300), decoration: BoxDecoration(color: m['internal'] == true ? Colors.amber.shade50 : m['fromStaff'] == true ? Colors.white : const Color(0xFFE3EFE7), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.black12)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${m['author']?['name'] ?? (m['fromStaff'] == true ? 'FreshRice' : 'You')}${m['internal'] == true ? ' · internal' : ''} · ${fmtDate(m['createdAt'])}', style: const TextStyle(fontSize: 10, color: Colors.grey)), Text(m['body'] ?? '')]))),
        if (done && d['rating'] == null && !_staff) Card(child: Padding(padding: const EdgeInsets.all(10), child: Column(children: [const Text('How did we handle this?'), Row(mainAxisAlignment: MainAxisAlignment.center, children: [for (var n = 1; n <= 5; n++) IconButton(icon: const Icon(Icons.star, color: Colors.amber), onPressed: () async { await Api.call('/issues/${widget.id}/rate', body: {'rating': n}); load(); })])]))),
        if (d['rating'] != null) Text('Rated ${d['rating']}/5', style: const TextStyle(color: Colors.green)),
      ])),
      if (!done) SafeArea(child: Padding(padding: const EdgeInsets.fromLTRB(8, 4, 8, 8), child: Column(mainAxisSize: MainAxisSize.min, children: [
        if (_staff) Row(children: [Checkbox(value: internal, onChanged: (v) => setState(() => internal = v ?? false)), const Text('Internal note', style: TextStyle(fontSize: 12))]),
        Row(children: [Expanded(child: TextField(controller: msg, decoration: InputDecoration(hintText: internal ? 'Note for the team' : 'Message', isDense: true, border: const OutlineInputBorder()), onSubmitted: (_) => send())), IconButton(icon: const Icon(Icons.send), onPressed: send)]),
      ]))),
    ]));
  }
}
