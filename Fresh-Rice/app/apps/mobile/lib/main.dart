import 'package:flutter/material.dart';
import 'api.dart';
import 'profiles.dart';
import 'screens/login.dart';
import 'screens/shop.dart';
import 'screens/orders.dart';
import 'screens/subscriptions.dart';
import 'screens/account.dart';
import 'screens/rider.dart';
import 'screens/live.dart';
import 'screens/sales.dart';
import 'screens/marketing.dart';
import 'screens/settings.dart';

const leaf = Color(0xFF2E7D4F);
const rice = Color(0xFFFBF8F1);

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Api.load();
  runApp(const FreshRiceApp());
}

class FreshRiceApp extends StatelessWidget {
  const FreshRiceApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'FreshRice',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: leaf), scaffoldBackgroundColor: rice, useMaterial3: true,
            appBarTheme: const AppBarTheme(backgroundColor: leaf, foregroundColor: Colors.white),
            filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(backgroundColor: leaf))),
        home: const Gate(),
      );
}

/// Login → the profile matching the role (Rider / Sales / Marketing / Customer). Settings can switch
/// between the profiles the role allows; the choice is remembered per user.
class Gate extends StatefulWidget {
  const Gate({super.key});
  @override
  State<Gate> createState() => _GateState();
}

class _GateState extends State<Gate> {
  Profile? profile;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async { if (Api.token == null) { setState(() => profile = null); return; } final p = await Profiles.current(); await Duty.I.refresh(); if (mounted) setState(() => profile = p); }
  void _relogin() { Profiles.reset(); _load(); }
  @override
  Widget build(BuildContext context) {
    if (Api.token == null) return LoginScreen(onLogin: _relogin);
    if (profile == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final settings = SettingsScreen(profile: profile!, onProfile: (p) async { await Profiles.set(p); setState(() => profile = p); }, onLogout: _relogin);
    switch (profile!) {
      case Profile.rider: return StaffShell(key: const ValueKey('rider'), title: 'Rider', main: RiderScreen(onLogout: _relogin), mainIcon: Icons.delivery_dining, settings: settings);
      case Profile.sales: return StaffShell(key: const ValueKey('sales'), title: 'Sales', main: const SalesScreen(), mainIcon: Icons.handshake, settings: settings);
      case Profile.marketing: return StaffShell(key: const ValueKey('marketing'), title: 'Marketing', main: const MarketingScreen(), mainIcon: Icons.campaign, settings: settings);
      case Profile.customer: return CustomerHome(key: const ValueKey('customer'), onLogout: _relogin, settings: settings);
    }
  }
}

/// Staff profiles: main screen + live map + settings.
class StaffShell extends StatefulWidget {
  final String title; final Widget main; final IconData mainIcon; final Widget settings;
  const StaffShell({super.key, required this.title, required this.main, required this.mainIcon, required this.settings});
  @override
  State<StaffShell> createState() => _StaffShellState();
}

class _StaffShellState extends State<StaffShell> {
  int idx = 0;
  @override
  Widget build(BuildContext context) {
    final pages = [widget.main, const LiveScreen(), widget.settings];
    return Scaffold(body: IndexedStack(index: idx, children: pages), bottomNavigationBar: NavigationBar(selectedIndex: idx, onDestinationSelected: (i) => setState(() => idx = i), destinations: [
      NavigationDestination(icon: Icon(widget.mainIcon), label: widget.title),
      const NavigationDestination(icon: Icon(Icons.map), label: 'Live'),
      const NavigationDestination(icon: Icon(Icons.settings), label: 'Settings'),
    ]));
  }
}

class CustomerHome extends StatefulWidget {
  final VoidCallback onLogout; final Widget settings;
  const CustomerHome({super.key, required this.onLogout, required this.settings});
  @override
  State<CustomerHome> createState() => _CustomerHomeState();
}

class _CustomerHomeState extends State<CustomerHome> {
  int idx = 0;
  @override
  Widget build(BuildContext context) {
    final pages = [const ShopScreen(), const OrdersScreen(), const SubscriptionsScreen(), const LiveScreen(), AccountScreen(onLogout: widget.onLogout, onSettings: () => Navigator.push(context, MaterialPageRoute(builder: (_) => widget.settings)))];
    return Scaffold(
      body: IndexedStack(index: idx, children: pages),
      bottomNavigationBar: NavigationBar(selectedIndex: idx, onDestinationSelected: (i) => setState(() => idx = i), destinations: const [
        NavigationDestination(icon: Icon(Icons.storefront), label: 'Shop'),
        NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Orders'),
        NavigationDestination(icon: Icon(Icons.autorenew), label: 'Subscribe'),
        NavigationDestination(icon: Icon(Icons.map), label: 'Riders'),
        NavigationDestination(icon: Icon(Icons.person), label: 'Account'),
      ]),
    );
  }
}
