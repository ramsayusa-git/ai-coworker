import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';

/// App "profiles" — which UI a person gets. Gated by their server-side role; the default is the
/// profile that matches the role, and Settings lets them switch between the ones they're allowed.
enum Profile { customer, rider, sales, marketing }

class Profiles {
  static const _key = 'fr_profile';
  static Profile? _current;

  static List<Profile> allowedFor(String? role) {
    switch (role) {
      case 'RIDER': return [Profile.rider, Profile.customer];
      case 'SALES': return [Profile.sales, Profile.customer];
      case 'MARKETING': return [Profile.marketing, Profile.customer];
      case 'ADMIN': case 'OPS': return [Profile.sales, Profile.marketing, Profile.customer];
      default: return [Profile.customer];
    }
  }

  static Profile defaultFor(String? role) => allowedFor(role).first;

  static Future<Profile> current() async {
    final role = Api.user?['role'] as String?;
    final allowed = allowedFor(role);
    if (_current != null && allowed.contains(_current)) return _current!;
    final p = await SharedPreferences.getInstance();
    final saved = p.getString('${_key}_${Api.user?['id']}');
    final parsed = Profile.values.where((x) => x.name == saved).firstOrNull;
    _current = (parsed != null && allowed.contains(parsed)) ? parsed : defaultFor(role);
    return _current!;
  }

  static Future<void> set(Profile p) async {
    _current = p;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('${_key}_${Api.user?['id']}', p.name);
  }

  static void reset() { _current = null; }

  static String label(Profile p) => switch (p) { Profile.customer => 'Customer', Profile.rider => 'Rider', Profile.sales => 'Sales', Profile.marketing => 'Marketing' };
}

/// Duty (clock in / out) + live location sharing. Only riders and field staff can track; location
/// pings run every 30s ONLY while on duty — nothing is sent when clocked out.
class Duty extends ChangeNotifier {
  static final Duty I = Duty();
  bool onDuty = false; DateTime? since; double hoursToday = 0; bool canTrack = false; bool tracksLocation = false; Timer? _gps; Position? last; String? lastError;
  static const staffRoles = ['ADMIN', 'OPS', 'SALES', 'MARKETING', 'RIDER', 'WAREHOUSE_STAFF'];

  /// Every staff role clocks in/out (attendance); only riders and field staff share GPS while on duty.
  bool get eligible => staffRoles.contains(Api.user?['role']);
  bool get sharesLocation => Api.user?['role'] == 'RIDER' || Api.user?['isField'] == true;

  Future<void> refresh() async {
    if (Api.token == null || !eligible) { onDuty = false; canTrack = false; _stopGps(); notifyListeners(); return; }
    try {
      final r = await Api.call('/me/shift');
      onDuty = r['onDuty'] == true; since = r['since'] != null ? DateTime.tryParse(r['since']) : null; hoursToday = (r['hoursToday'] ?? 0).toDouble(); canTrack = r['canTrack'] == true; tracksLocation = r['canTrackLocation'] == true || sharesLocation;
      onDuty && tracksLocation ? _startGps() : _stopGps();
    } catch (e) { lastError = '$e'; }
    notifyListeners();
  }

  Future<Position?> _fix() async {
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return null;
    try { return await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.medium); } catch (_) { return null; }
  }

  Future<void> clockIn() async {
    final p = await _fix();
    await Api.call('/me/shift/start', body: {if (p != null) 'lat': p.latitude, if (p != null) 'lng': p.longitude});
    await refresh();
  }

  Future<void> clockOut() async {
    final p = await _fix();
    await Api.call('/me/shift/end', body: {if (p != null) 'lat': p.latitude, if (p != null) 'lng': p.longitude});
    _stopGps();
    await refresh();
  }

  void _startGps() {
    if (_gps != null) return;
    Future<void> ping() async { final p = await _fix(); if (p == null) return; last = p; try { await Api.call('/rider/location', body: {'lat': p.latitude, 'lng': p.longitude}); } catch (_) {} }
    ping();
    _gps = Timer.periodic(const Duration(seconds: 30), (_) => ping());
  }

  void _stopGps() { _gps?.cancel(); _gps = null; }
}
