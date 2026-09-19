import 'package:flutter/material.dart';
import '../api.dart';
import '../profiles.dart';

/// Settings: switch profile (only the ones this role allows), duty clock in/out for riders + field staff, logout.
class SettingsScreen extends StatefulWidget {
  final Profile profile; final ValueChanged<Profile> onProfile; final VoidCallback onLogout;
  const SettingsScreen({super.key, required this.profile, required this.onProfile, required this.onLogout});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool busy = false;
  @override
  void initState() { super.initState(); Duty.I.addListener(_r); Duty.I.refresh(); }
  @override
  void dispose() { Duty.I.removeListener(_r); super.dispose(); }
  void _r() { if (mounted) setState(() {}); }
  Future<void> _duty() async { setState(() => busy = true); try { Duty.I.onDuty ? await Duty.I.clockOut() : await Duty.I.clockIn(); } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'))); } finally { if (mounted) setState(() => busy = false); } }
  @override
  Widget build(BuildContext context) {
    final u = Api.user ?? {}; final role = u['role'] as String?; final allowed = Profiles.allowedFor(role); final d = Duty.I;
    return Scaffold(appBar: AppBar(title: const Text('Settings')), body: ListView(padding: const EdgeInsets.all(12), children: [
      Card(child: ListTile(leading: const Icon(Icons.person), title: Text(u['name'] ?? u['phone'] ?? ''), subtitle: Text('${u['phone'] ?? ''} · role $role${u['isField'] == true ? ' · field team' : ''}'))),
      const Padding(padding: EdgeInsets.fromLTRB(4, 12, 4, 4), child: Text('Profile', style: TextStyle(fontWeight: FontWeight.bold))),
      Card(child: Column(children: [
        for (final p in allowed) RadioListTile<Profile>(value: p, groupValue: widget.profile, onChanged: (v) { if (v != null) widget.onProfile(v); }, title: Text(Profiles.label(p)), subtitle: Text(switch (p) { Profile.customer => 'Shop, orders, subscriptions, account', Profile.rider => 'Manifest, scan-to-load, deliveries, duty & GPS', Profile.sales => 'Leads, follow-ups, live map, duty', Profile.marketing => 'Coupons, daily numbers, live map' })),
        if (allowed.length == 1) const Padding(padding: EdgeInsets.all(12), child: Text('Other profiles are enabled by your role — ask the admin to change it from Team.', style: TextStyle(fontSize: 12, color: Colors.grey))),
      ])),
      if (d.eligible) ...[
        const Padding(padding: EdgeInsets.fromLTRB(4, 12, 4, 4), child: Text('Duty', style: TextStyle(fontWeight: FontWeight.bold))),
        Card(color: d.onDuty ? Colors.green.shade50 : null, child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [Icon(d.onDuty ? Icons.gps_fixed : Icons.gps_off, color: d.onDuty ? Colors.green : Colors.grey), const SizedBox(width: 8), Expanded(child: Text(d.onDuty ? 'On duty since ${d.since != null ? TimeOfDay.fromDateTime(d.since!.toLocal()).format(context) : ''} · sharing live location' : 'Off duty · location is not shared', style: const TextStyle(fontWeight: FontWeight.w600)))]),
          const SizedBox(height: 4), Text('Today: ${d.hoursToday.toStringAsFixed(1)} h', style: const TextStyle(color: Colors.grey, fontSize: 12)),
          const SizedBox(height: 8), SizedBox(width: double.infinity, child: d.onDuty ? OutlinedButton.icon(onPressed: busy ? null : _duty, icon: const Icon(Icons.logout), label: const Text('Clock out')) : FilledButton.icon(onPressed: busy ? null : _duty, icon: const Icon(Icons.login), label: const Text('Clock in'))),
          const SizedBox(height: 4), const Text('Your position is sent every 30 s while on duty so the office and customers can see where you are. Shifts left open close automatically after 16 h.', style: TextStyle(fontSize: 11, color: Colors.grey)),
        ]))),
      ],
      const SizedBox(height: 16),
      OutlinedButton(onPressed: () async { try { if (Duty.I.onDuty) await Duty.I.clockOut(); } catch (_) {} await Api.setSession(null, null); Profiles.reset(); widget.onLogout(); }, child: const Text('Log out')),
      Padding(padding: const EdgeInsets.all(8), child: Text('Server: $apiUrl', style: const TextStyle(fontSize: 10, color: Colors.grey), textAlign: TextAlign.center)),
    ]));
  }
}
