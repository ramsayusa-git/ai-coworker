import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';

/// Live map: riders (and, for staff, field team) with phone + WhatsApp. Customers see riders on a route.
class LiveScreen extends StatefulWidget {
  const LiveScreen({super.key});
  @override
  State<LiveScreen> createState() => _LiveScreenState();
}

class _LiveScreenState extends State<LiveScreen> {
  List people = []; Timer? t; String? err; final map = MapController(); bool fitted = false;
  bool get staff => ['ADMIN', 'OPS', 'SALES', 'MARKETING'].contains(Api.user?['role']);
  @override
  void initState() { super.initState(); load(); t = Timer.periodic(const Duration(seconds: 10), (_) => load()); }
  @override
  void dispose() { t?.cancel(); super.dispose(); }
  Future<void> load() async {
    try { people = await Api.call(staff ? '/admin/dispatch/live' : '/riders/live'); err = null; } catch (e) { err = '$e'; }
    if (!mounted) return; setState(() {});
    final pts = people.where((p) => p['loc'] != null).map((p) => LatLng(p['loc']['lat'], p['loc']['lng'])).toList();
    if (pts.isNotEmpty && !fitted) { fitted = true; WidgetsBinding.instance.addPostFrameCallback((_) { try { map.fitCamera(CameraFit.coordinates(coordinates: pts, padding: const EdgeInsets.all(40), maxZoom: 15)); } catch (_) {} }); }
  }
  String ago(String? iso) { if (iso == null) return 'never'; final s = DateTime.now().difference(DateTime.parse(iso)).inSeconds; return s < 60 ? '${s}s ago' : s < 3600 ? '${s ~/ 60} min ago' : '${s ~/ 3600} h ago'; }
  @override
  Widget build(BuildContext context) {
    final withLoc = people.where((p) => p['loc'] != null).toList();
    return Scaffold(appBar: AppBar(title: Text(staff ? 'Riders & field team · live' : 'Riders on the road'), actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: load)]), body: Column(children: [
      SizedBox(height: 300, child: FlutterMap(mapController: map, options: const MapOptions(initialCenter: LatLng(17.4849, 78.3914), initialZoom: 12), children: [
        TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'com.aetostechlabs.freshrice'),
        MarkerLayer(markers: [for (final p in withLoc) Marker(point: LatLng(p['loc']['lat'], p['loc']['lng']), width: 40, height: 40, child: GestureDetector(onTap: () => _sheet(p), child: Container(decoration: BoxDecoration(color: p['kind'] == 'field' ? Colors.blue.shade700 : (p['online'] == true ? const Color(0xFF2E7D4F) : Colors.grey), shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)), child: Icon(p['kind'] == 'field' ? Icons.badge : Icons.delivery_dining, color: Colors.white, size: 22))))]),
        const RichAttributionWidget(attributions: [TextSourceAttribution('OpenStreetMap contributors')]),
      ])),
      if (err != null) Padding(padding: const EdgeInsets.all(8), child: Text(err!, style: const TextStyle(color: Colors.red, fontSize: 12))),
      Expanded(child: people.isEmpty ? const Center(child: Text('Nobody on the road right now', style: TextStyle(color: Colors.grey))) : ListView(children: [for (final p in people) _tile(p)])),
    ]));
  }
  Widget _tile(Map p) {
    final online = p['online'] == true; final route = p['route']; final field = p['kind'] == 'field';
    return ListTile(leading: CircleAvatar(backgroundColor: field ? Colors.blue.shade700 : online ? const Color(0xFF2E7D4F) : Colors.grey, child: Icon(field ? Icons.badge : Icons.delivery_dining, color: Colors.white)),
      title: Text('${p['name'] ?? p['phone']}${field ? ' · ${p['role']}' : ''}'),
      subtitle: Text([if (route != null) '${route['zone']} · ${route['delivered']}/${route['stops']} delivered', if (p['onDuty'] == true) 'on duty', if (p['loc'] != null) 'seen ${ago(p['loc']['at'])}' else 'no location yet'].join(' · '), style: const TextStyle(fontSize: 12)),
      trailing: Wrap(spacing: 4, children: [IconButton(icon: const Icon(Icons.call), onPressed: () => launchUrl(Uri.parse('tel:${p['phone']}'))), IconButton(icon: const Icon(Icons.chat), onPressed: () => launchUrl(Uri.parse('https://wa.me/${(p['phone'] as String).replaceAll(RegExp(r'\D'), '')}'), mode: LaunchMode.externalApplication))]),
      onTap: () => _sheet(p));
  }
  void _sheet(Map p) { showModalBottomSheet(context: context, builder: (_) => Padding(padding: const EdgeInsets.all(16), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(p['name'] ?? 'Rider', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)), Text(p['phone'] ?? ''),
    if (p['route'] != null) Text('${p['route']['zone']} · ${p['route']['delivered']}/${p['route']['stops']} delivered'),
    if (p['loc'] != null) Text('Last seen ${ago(p['loc']['at'])}', style: const TextStyle(color: Colors.grey)),
    const SizedBox(height: 12), Row(children: [FilledButton.icon(onPressed: () => launchUrl(Uri.parse('tel:${p['phone']}')), icon: const Icon(Icons.call), label: const Text('Call')), const SizedBox(width: 8), OutlinedButton.icon(onPressed: () => launchUrl(Uri.parse('https://wa.me/${(p['phone'] as String).replaceAll(RegExp(r'\D'), '')}'), mode: LaunchMode.externalApplication), icon: const Icon(Icons.chat), label: const Text('WhatsApp')),
      if (p['loc'] != null) ...[const SizedBox(width: 8), TextButton(onPressed: () => launchUrl(Uri.parse('https://maps.google.com/?q=${p['loc']['lat']},${p['loc']['lng']}'), mode: LaunchMode.externalApplication), child: const Text('Maps'))]]),
  ]))); }
}
