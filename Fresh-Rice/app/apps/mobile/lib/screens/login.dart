import 'package:flutter/material.dart';
import '../api.dart';

class LoginScreen extends StatefulWidget {
  final VoidCallback onLogin;
  const LoginScreen({super.key, required this.onLogin});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final phone = TextEditingController(), code = TextEditingController(), name = TextEditingController(), referral = TextEditingController();
  int step = 1; String? err; String? devOtp; bool busy = false; Map? refCheck;

  Future<void> request() async {
    setState(() { busy = true; err = null; });
    try { final r = await Api.call('/auth/otp/request', body: {'phone': phone.text}); devOtp = r['devOtp']; if (devOtp != null) code.text = devOtp!; setState(() => step = 2); }
    catch (e) { setState(() => err = '$e'); } finally { setState(() => busy = false); }
  }

  Future<void> verify() async {
    setState(() { busy = true; err = null; });
    try {
      final r = await Api.call('/auth/otp/verify', body: {'phone': phone.text, 'code': code.text, if (name.text.isNotEmpty) 'name': name.text, if (referral.text.isNotEmpty) 'referral': referral.text});
      await Api.setSession(r['token'], Map<String, dynamic>.from(r['user']));
      widget.onLogin();
    } catch (e) { setState(() => err = '$e'); } finally { setState(() => busy = false); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: Card(child: Padding(padding: const EdgeInsets.all(20), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('🌾 FreshRice', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const Text('Mill-direct, correctly aged Telangana rice', style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 16),
          if (step == 1) ...[
            TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Mobile number', prefixText: '+91 ', border: OutlineInputBorder())),
            const SizedBox(height: 10),
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Name (new customers)', border: OutlineInputBorder())),
            const SizedBox(height: 10),
            TextField(controller: referral, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Referral code (optional)', border: OutlineInputBorder()), onChanged: (v) async { if (v.length >= 6) { try { refCheck = await Api.call('/auth/referrals/check?code=$v'); } catch (_) { refCheck = null; } } else { refCheck = null; } setState(() {}); }),
            if (refCheck?['valid'] == true) Text('✓ Referred by ${refCheck!['referrer']} — ₹100 off your first bag', style: const TextStyle(color: Colors.green, fontSize: 12)),
            const SizedBox(height: 16),
            FilledButton(onPressed: busy ? null : request, child: const Text('Send OTP')),
          ] else ...[
            Text('OTP sent to ${phone.text}'),
            const SizedBox(height: 8),
            TextField(controller: code, keyboardType: TextInputType.number, maxLength: 6, textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, letterSpacing: 8), decoration: const InputDecoration(border: OutlineInputBorder(), counterText: '')),
            if (devOtp != null) Text('Dev mode: OTP is $devOtp', style: const TextStyle(color: Colors.orange, fontSize: 12)),
            const SizedBox(height: 12),
            FilledButton(onPressed: busy ? null : verify, child: const Text('Verify & continue')),
            TextButton(onPressed: () => setState(() => step = 1), child: const Text('Change number')),
          ],
          if (err != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(err!, style: const TextStyle(color: Colors.red))),
        ]))))),
      );
}
