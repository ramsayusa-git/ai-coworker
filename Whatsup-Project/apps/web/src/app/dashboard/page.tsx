const stats = [
  { label: "Open conversations", value: "0" },
  { label: "Messages today", value: "0" },
  { label: "Active channels", value: "0" },
  { label: "Wallet balance", value: "₹0.00" },
];

export default function Dashboard() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="text-sm text-zinc-500">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>
      <p className="mt-8 text-sm text-zinc-500">
        No channels connected yet. Go to Channels to link a WhatsApp number.
      </p>
    </div>
  );
}
