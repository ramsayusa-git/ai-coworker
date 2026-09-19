import 'package:flutter/material.dart';
import 'api.dart';
import 'screens/login.dart';
import 'screens/shop.dart';
import 'screens/orders.dart';
import 'screens/subscriptions.dart';
import 'screens/account.dart';
import 'screens/rider.dart';

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

class Gate extends StatefulWidget {
  const Gate({super.key});
  @override
  State<Gate> createState() => _GateState();
}

class _GateState extends State<Gate> {
  @override
  Widget build(BuildContext context) {
    if (Api.token == null) return LoginScreen(onLogin: () => setState(() {}));
    final role = Api.user?['role'];
    if (role == 'RIDER') return RiderScreen(onLogout: () => setState(() {}));
    return CustomerHome(onLogout: () => setState(() {}));
  }
}

class CustomerHome extends StatefulWidget {
  final VoidCallback onLogout;
  const CustomerHome({super.key, required this.onLogout});
  @override
  State<CustomerHome> createState() => _CustomerHomeState();
}

class _CustomerHomeState extends State<CustomerHome> {
  int idx = 0;
  @override
  Widget build(BuildContext context) {
    final pages = [const ShopScreen(), const OrdersScreen(), const SubscriptionsScreen(), AccountScreen(onLogout: widget.onLogout)];
    return Scaffold(
      body: pages[idx],
      bottomNavigationBar: NavigationBar(selectedIndex: idx, onDestinationSelected: (i) => setState(() => idx = i), destinations: const [
        NavigationDestination(icon: Icon(Icons.storefront), label: 'Shop'),
        NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Orders'),
        NavigationDestination(icon: Icon(Icons.autorenew), label: 'Subscriptions'),
        NavigationDestination(icon: Icon(Icons.person), label: 'Account'),
      ]),
    );
  }
}
