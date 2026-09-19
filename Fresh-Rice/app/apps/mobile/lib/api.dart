import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Base URL of the API. Override at build time:
/// flutter build apk --dart-define=API_URL=http://192.168.29.101:4100
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://192.168.29.101:4100');

class ApiException implements Exception {
  final String message;
  ApiException(this.message);
  @override
  String toString() => message;
}

class Api {
  static String? token;
  static Map<String, dynamic>? user;

  static Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    token = p.getString('token');
    final u = p.getString('user');
    if (u != null) user = jsonDecode(u);
  }

  static Future<void> setSession(String? t, Map<String, dynamic>? u) async {
    token = t; user = u;
    final p = await SharedPreferences.getInstance();
    t == null ? await p.remove('token') : await p.setString('token', t);
    u == null ? await p.remove('user') : await p.setString('user', jsonEncode(u));
  }

  static Future<dynamic> call(String path, {String? method, Object? body}) async {
    final uri = Uri.parse('$apiUrl/v1$path');
    final headers = {'Content-Type': 'application/json', if (token != null) 'Authorization': 'Bearer $token'};
    final m = method ?? (body != null ? 'POST' : 'GET');
    http.Response r;
    try {
      switch (m) {
        case 'POST': r = await http.post(uri, headers: headers, body: body == null ? null : jsonEncode(body)); break;
        case 'PATCH': r = await http.patch(uri, headers: headers, body: body == null ? null : jsonEncode(body)); break;
        case 'DELETE': r = await http.delete(uri, headers: headers); break;
        default: r = await http.get(uri, headers: headers);
      }
    } catch (e) {
      throw ApiException('Cannot reach server ($apiUrl). Check Wi-Fi.');
    }
    final data = r.body.isEmpty ? null : jsonDecode(r.body);
    if (r.statusCode >= 400) {
      final msg = data is Map ? data['message'] : r.reasonPhrase;
      throw ApiException(msg is List ? msg.join(', ') : '$msg');
    }
    return data;
  }
}

String rupees(num? paise) => '₹${((paise ?? 0) / 100).toStringAsFixed(((paise ?? 0) % 100 == 0) ? 0 : 2)}';
String fmtDate(String? iso) {
  if (iso == null) return '-';
  final d = DateTime.parse(iso).toLocal();
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${d.day} ${m[d.month - 1]}';
}
String ymd(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
