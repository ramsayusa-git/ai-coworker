import 'package:flutter/material.dart';
import '../api.dart';
import '../profiles.dart';

/// Attendance & leave for every staff role: clock in/out, month summary, balances, apply leave / WFH /
/// regularisation, my requests, and (for managers / HR) the approval queue.
class HrScreen extends StatefulWidget {
  const HrScreen({super.key});
  @override
  State<HrScreen> createState() => _HrScreenState();
}

const _codeLabel = {'P': 'Present', 'H': 'Half day', 'A': 'Absent', 'L': 'Leave', 'UL': 'Unpaid leave', 'HO': 'Holiday', 'WO': 'Week off', 'WFH': 'WFH', '': '—'};
const _codeColor = {'P': Colors.green, 'H': Colors.orange, 'A': Colors.red, 'L': Colors.blue, 'UL': Colors.purple, 'HO': Colors.grey, 'WO': Colors.grey, 'WFH': Colors.teal};
String _hm(String? iso) { if (iso == null) return '—'; final d = DateTime.tryParse(iso)?.toLocal(); return d == null ? '—' : '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}'; }
String _d(String? iso) { if (iso == null) return ''; final d = DateTime.tryParse(iso); return d == null ? iso : '${d.day}/${d.month}'; }

class _HrScreenState extends State<HrScreen> {
  Map<String, dynamic>? me; Map<String, dynamic>? month; String? err; bool busy = false;
  @override
  void initState() { super.initState(); load(); Duty.I.addListener(_r); }
  @override
  void dispose() { Duty.I.removeListener(_r); super.dispose(); }
  void _r() { if (mounted) setState(() {}); }
  Future<void> load() async {
    try {
      final r = await Api.call('/me/hr'); final a = await Api.call('/me/hr/attendance');
      if (mounted) setState(() { me = Map<String, dynamic>.from(r); month = Map<String, dynamic>.from(a); err = null; });
    } catch (e) { if (mounted) setState(() => err = '$e'); }
  }
  void snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  Future<void> duty() async { setState(() => busy = true); try { Duty.I.onDuty ? await Duty.I.clockOut() : await Duty.I.clockIn(); await load(); } catch (e) { snack('$e'); } finally { if (mounted) setState(() => busy = false); } }

  @override
  Widget build(BuildContext context) {
    if (!Duty.I.eligible) return const Scaffold(body: Center(child: Text('Attendance is for staff accounts')));
    return Scaffold(
      appBar: AppBar(title: const Text('Attendance'), actions: [if (me?['canApprove'] == true) IconButton(tooltip: 'Approvals', icon: Badge(isLabelVisible: (me?['reportsPending'] ?? 0) > 0, label: Text('${me?['reportsPending']}'), child: const Icon(Icons.fact_check)), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LeaveQueueScreen())).then((_) => load()))]),
      body: RefreshIndicator(onRefresh: load, child: me == null
        ? Center(child: err != null ? Text(err!) : const CircularProgressIndicator())
        : ListView(padding: const EdgeInsets.all(12), children: [
          _dutyCard(),
          const SizedBox(height: 10),
          _todayCard(),
          const SizedBox(height: 10),
          _monthCard(),
          const SizedBox(height: 10),
          _balancesCard(),
          const SizedBox(height: 10),
          _requestsCard(),
          if ((me!['holidays'] as List).isNotEmpty) ...[const SizedBox(height: 10), Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('Upcoming holidays', style: TextStyle(fontWeight: FontWeight.bold)), ...(me!['holidays'] as List).map((h) => Text('${_d(h['date'])} · ${h['name']}${h['optional'] == true ? ' (optional)' : ''}'))])))],
          if ((me!['roster'] as List).isNotEmpty) ...[const SizedBox(height: 10), Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('My roster this week', style: TextStyle(fontWeight: FontWeight.bold)), ...(me!['roster'] as List).map((r) => Text('${_d(r['date'])} · ${r['start']}–${r['end']}${r['label'] != null ? ' ${r['label']}' : ''}'))])))],
        ])),
      floatingActionButton: FloatingActionButton.extended(onPressed: () => showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => LeaveForm(leaveTypes: List<Map<String, dynamic>>.from(me?['leaveTypes'] ?? []))).then((ok) { if (ok == true) load(); }), icon: const Icon(Icons.event_busy), label: const Text('Apply')),
    );
  }

  Widget _dutyCard() {
    final d = Duty.I;
    return Card(color: d.onDuty ? Colors.green.shade50 : Colors.amber.shade50, child: ListTile(
      leading: Icon(d.onDuty ? Icons.timer : Icons.timer_off, color: d.onDuty ? Colors.green : Colors.orange, size: 32),
      title: Text(d.onDuty ? 'Clocked in since ${d.since != null ? _hm(d.since!.toIso8601String()) : ''}' : 'Not clocked in'),
      subtitle: Text(d.onDuty ? '${d.hoursToday.toStringAsFixed(1)} h today${d.tracksLocation ? ' · sharing live location' : ''}' : 'Shift ${me?['shiftStart']}–${me?['shiftEnd']}${d.tracksLocation ? ' · location shared while on duty' : ''}'),
      trailing: busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)) : (d.onDuty ? OutlinedButton(onPressed: duty, child: const Text('Clock out')) : FilledButton(onPressed: duty, child: const Text('Clock in'))),
    ));
  }
  Widget _todayCard() {
    final t = me?['today']; if (t == null) return const SizedBox();
    final code = (t['code'] ?? '') as String;
    return Card(child: ListTile(leading: CircleAvatar(backgroundColor: (_codeColor[code] ?? Colors.grey).withOpacity(.15), child: Text(code.isEmpty ? '·' : code, style: TextStyle(color: _codeColor[code] ?? Colors.grey, fontWeight: FontWeight.bold))),
      title: Text('Today · ${_codeLabel[code]}${t['leaveType'] != null ? ' (${t['leaveType']})' : ''}'),
      subtitle: Text('In ${_hm(t['firstIn'])} · Out ${_hm(t['lastOut'])} · ${t['hours']} h${(t['lateMin'] ?? 0) > 0 ? ' · late ${t['lateMin']} min' : ''}${t['geoFlag'] == true ? ' · outside geofence' : ''}')));
  }
  Widget _monthCard() {
    final s = me?['month']; final row = month?['row']; if (s == null) return const SizedBox();
    final days = (row?['days'] as List?) ?? [];
    return Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [const Text('This month', style: TextStyle(fontWeight: FontWeight.bold)), const Spacer(), Text('${s['hours']} h · payable ${s['payableDays']} d', style: const TextStyle(color: Colors.black54))]),
      const SizedBox(height: 8),
      Wrap(spacing: 4, runSpacing: 4, children: days.map<Widget>((d) { final c = (d['code'] ?? '') as String; final col = _codeColor[c] ?? Colors.grey; return Tooltip(message: '${d['date']} · ${_codeLabel[c]} · ${d['hours']} h', child: Container(width: 34, height: 34, alignment: Alignment.center, decoration: BoxDecoration(color: c.isEmpty ? Colors.grey.shade100 : col.withOpacity(.18), borderRadius: BorderRadius.circular(6)), child: Text('${int.parse((d['date'] as String).substring(8))}', style: TextStyle(fontSize: 11, color: c.isEmpty ? Colors.grey : col.shade800, fontWeight: FontWeight.w600)))); }).toList()),
      const SizedBox(height: 8),
      Wrap(spacing: 12, children: [_kv('Present', s['present']), _kv('Half', s['half']), _kv('Absent', s['absent'], warn: (s['absent'] ?? 0) > 0), _kv('Leave', (s['paidLeave'] ?? 0) + (s['unpaidLeave'] ?? 0)), _kv('Late', s['late'], warn: (s['late'] ?? 0) > 0), _kv('OT h', s['ot'])]),
    ])));
  }
  Widget _kv(String k, dynamic v, {bool warn = false}) => Text('$k $v', style: TextStyle(fontSize: 12, color: warn ? Colors.red : Colors.black87));
  Widget _balancesCard() {
    final b = (me?['balances'] as List?) ?? [];
    return Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('Leave balance', style: TextStyle(fontWeight: FontWeight.bold)), const SizedBox(height: 6),
      Wrap(spacing: 8, runSpacing: 6, children: b.map<Widget>((t) => Chip(label: Text('${t['code']} ${t['balance'] ?? '∞'}${t['pending'] > 0 ? ' (${t['pending']} pending)' : ''}'), backgroundColor: t['paid'] == false ? Colors.purple.shade50 : Colors.green.shade50)).toList())])));
  }
  Widget _requestsCard() {
    final r = (me?['requests'] as List?) ?? [];
    return Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('My requests', style: TextStyle(fontWeight: FontWeight.bold)),
      if (r.isEmpty) const Padding(padding: EdgeInsets.only(top: 6), child: Text('None yet', style: TextStyle(color: Colors.black54))),
      ...r.map((x) => ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text('${x['type']} · ${_d(x['from'])}${x['to'] != x['from'] ? ' → ${_d(x['to'])}' : ''}${x['halfDay'] == true ? ' (½)' : ''}'), subtitle: Text('${x['reason']}${x['decisionNote'] != null ? ' — ${x['decisionNote']}' : ''}'),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [_status(x['status']), if (x['status'] == 'PENDING' || x['status'] == 'APPROVED') IconButton(icon: const Icon(Icons.close, size: 18), tooltip: 'Cancel', onPressed: () async { try { await Api.call('/me/hr/leave/${x['id']}/cancel', method: 'POST', body: {}); load(); } catch (e) { snack('$e'); } })])))])));
  }
  Widget _status(String s) { final c = {'PENDING': Colors.orange, 'APPROVED': Colors.green, 'REJECTED': Colors.red, 'CANCELLED': Colors.grey}[s] ?? Colors.grey; return Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: c.withOpacity(.15), borderRadius: BorderRadius.circular(6)), child: Text(s.toLowerCase(), style: TextStyle(fontSize: 11, color: c))); }
}

class LeaveForm extends StatefulWidget {
  final List<Map<String, dynamic>> leaveTypes;
  const LeaveForm({super.key, required this.leaveTypes});
  @override
  State<LeaveForm> createState() => _LeaveFormState();
}

class _LeaveFormState extends State<LeaveForm> {
  String type = 'CL'; DateTime from = DateTime.now().add(const Duration(days: 1)); DateTime? to; bool half = false; final reason = TextEditingController(); TimeOfDay inT = const TimeOfDay(hour: 9, minute: 0), outT = const TimeOfDay(hour: 18, minute: 0); bool busy = false;
  String ymd(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  Future<void> pick(bool isFrom) async { final d = await showDatePicker(context: context, initialDate: isFrom ? from : (to ?? from), firstDate: DateTime.now().subtract(const Duration(days: 90)), lastDate: DateTime.now().add(const Duration(days: 365))); if (d != null) setState(() { if (isFrom) { from = d; if (to != null && to!.isBefore(d)) to = null; } else { to = d; } }); }
  Future<void> submit() async {
    setState(() => busy = true);
    try {
      final body = <String, dynamic>{'type': type, 'from': ymd(from), 'reason': reason.text.trim()};
      if (type == 'REG') { final f = DateTime(from.year, from.month, from.day); body['claimedIn'] = DateTime(f.year, f.month, f.day, inT.hour, inT.minute).toUtc().toIso8601String(); body['claimedOut'] = DateTime(f.year, f.month, f.day, outT.hour, outT.minute).toUtc().toIso8601String(); }
      else { body['to'] = ymd(half ? from : (to ?? from)); body['halfDay'] = half; }
      await Api.call('/me/hr/leave', body: body);
      if (mounted) Navigator.pop(context, true);
    } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'))); } finally { if (mounted) setState(() => busy = false); }
  }
  @override
  Widget build(BuildContext context) {
    final types = [...widget.leaveTypes.map((t) => MapEntry(t['code'] as String, t['name'] as String)), const MapEntry('WFH', 'Work from home'), const MapEntry('REG', 'Regularise a missed punch')];
    return Padding(padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Apply', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
      DropdownButtonFormField<String>(value: type, items: types.map((t) => DropdownMenuItem(value: t.key, child: Text('${t.key} · ${t.value}'))).toList(), onChanged: (v) => setState(() => type = v ?? 'CL'), decoration: const InputDecoration(labelText: 'Type')),
      Row(children: [Expanded(child: OutlinedButton.icon(onPressed: () => pick(true), icon: const Icon(Icons.calendar_today, size: 16), label: Text(type == 'REG' ? 'Day ${ymd(from)}' : 'From ${ymd(from)}'))), if (type != 'REG' && !half) ...[const SizedBox(width: 8), Expanded(child: OutlinedButton.icon(onPressed: () => pick(false), icon: const Icon(Icons.calendar_today, size: 16), label: Text(to == null ? 'To (same day)' : 'To ${ymd(to!)}')))]]),
      if (type != 'REG' && type != 'WFH') SwitchListTile(dense: true, contentPadding: EdgeInsets.zero, title: const Text('Half day'), value: half, onChanged: (v) => setState(() => half = v)),
      if (type == 'REG') Row(children: [Expanded(child: OutlinedButton(onPressed: () async { final t = await showTimePicker(context: context, initialTime: inT); if (t != null) setState(() => inT = t); }, child: Text('In ${inT.format(context)}'))), const SizedBox(width: 8), Expanded(child: OutlinedButton(onPressed: () async { final t = await showTimePicker(context: context, initialTime: outT); if (t != null) setState(() => outT = t); }, child: Text('Out ${outT.format(context)}')))]),
      TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason'), maxLines: 2),
      const SizedBox(height: 12),
      SizedBox(width: double.infinity, child: FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Sending…' : 'Submit'))),
    ]));
  }
}

/// Manager / HR approval queue.
class LeaveQueueScreen extends StatefulWidget {
  const LeaveQueueScreen({super.key});
  @override
  State<LeaveQueueScreen> createState() => _LeaveQueueScreenState();
}

class _LeaveQueueScreenState extends State<LeaveQueueScreen> {
  List rows = []; String status = 'PENDING'; bool loading = true;
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async { setState(() => loading = true); try { final r = await Api.call('/hr/leave-queue?status=$status'); setState(() { rows = r as List; }); } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'))); } finally { if (mounted) setState(() => loading = false); } }
  Future<void> decide(Map r, bool ok) async {
    String note = '';
    if (!ok) { final v = await showDialog<String>(context: context, builder: (_) { final c = TextEditingController(); return AlertDialog(title: const Text('Reason for rejecting'), content: TextField(controller: c, autofocus: true), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(context, c.text), child: const Text('Reject'))]); }); if (v == null || v.trim().isEmpty) return; note = v; }
    try { await Api.call('/hr/leave/${r['id']}/${ok ? 'approve' : 'reject'}', body: {'note': note}); load(); } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'))); }
  }
  @override
  Widget build(BuildContext context) {
    return Scaffold(appBar: AppBar(title: const Text('Leave approvals'), actions: [DropdownButton<String>(value: status, underline: const SizedBox(), items: ['PENDING', 'APPROVED', 'REJECTED'].map((s) => DropdownMenuItem(value: s, child: Text(s.toLowerCase()))).toList(), onChanged: (v) { status = v ?? 'PENDING'; load(); }), const SizedBox(width: 8)]),
      body: loading ? const Center(child: CircularProgressIndicator()) : rows.isEmpty ? const Center(child: Text('Nothing here')) : RefreshIndicator(onRefresh: load, child: ListView.separated(itemCount: rows.length, separatorBuilder: (_, __) => const Divider(height: 1), itemBuilder: (_, i) { final r = rows[i];
        return ListTile(title: Text('${r['user']?['name'] ?? '?'} · ${r['type']}${r['halfDay'] == true ? ' ½' : ''}${r['days'] != null && r['days'] > 0 ? ' · ${r['days']} d' : ''}'),
          subtitle: Text('${r['type'] == 'REG' ? '${_d(r['from'])} ${_hm(r['claimedIn'])}–${_hm(r['claimedOut'])}' : '${_d(r['from'])}${r['to'] != r['from'] ? ' → ${_d(r['to'])}' : ''}'}\n${r['reason']}${r['decisionNote'] != null ? '\n— ${r['decisionNote']}' : ''}'), isThreeLine: true,
          trailing: r['status'] == 'PENDING' ? Row(mainAxisSize: MainAxisSize.min, children: [IconButton(icon: const Icon(Icons.check_circle, color: Colors.green), onPressed: () => decide(r, true)), IconButton(icon: const Icon(Icons.cancel, color: Colors.red), onPressed: () => decide(r, false))]) : Text(r['status'].toString().toLowerCase()));
      })));
  }
}
