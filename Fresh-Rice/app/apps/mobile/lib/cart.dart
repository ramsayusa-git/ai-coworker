import 'package:flutter/foundation.dart';

class CartLine {
  final String skuId, name; final num packKg, pricePaise, gstPct; int qty;
  CartLine({required this.skuId, required this.name, required this.packKg, required this.pricePaise, required this.gstPct, this.qty = 1});
}

class Cart extends ChangeNotifier {
  static final Cart I = Cart();
  final List<CartLine> lines = [];
  void add(CartLine l) { final ex = lines.where((x) => x.skuId == l.skuId); if (ex.isNotEmpty) ex.first.qty++; else lines.add(l); notifyListeners(); }
  void setQty(String skuId, int q) { lines.removeWhere((x) => x.skuId == skuId && q <= 0); for (final l in lines) { if (l.skuId == skuId) l.qty = q; } notifyListeners(); }
  void clear() { lines.clear(); notifyListeners(); }
  int get count => lines.fold(0, (a, l) => a + l.qty);
  num get subtotal => lines.fold(0, (a, l) => a + l.pricePaise * l.qty);
  num get gst => lines.fold(0, (a, l) => a + (l.pricePaise * l.qty * l.gstPct / 100).round());
  num get total => subtotal + gst;
  num get kg => lines.fold(0, (a, l) => a + l.packKg * l.qty);
}
