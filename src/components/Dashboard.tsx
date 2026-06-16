import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import {
  Users,
  FileCheck,
  Clock,
  AlertCircle,
  TrendingUp,
  Info,
  Wallet,
  Heart,
  GraduationCap,
  Building,
  Activity,
  Sprout,
  ClipboardCheck,
} from "lucide-react";
import {
  AID_STATUSES,
  AID_TYPES,
  STATUS_COLORS,
  SIAK_SECTORS,
} from "../constants";
import { Recipient } from "../types";

interface DashboardProps {
  recipients: Recipient[];
}

const StatCard = ({
  title,
  value,
  icon: Icon,
  color,
  trend,
  subtitle,
}: any) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-start justify-between shadow-sm hover:shadow-md transition-shadow">
    <div>
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
        {title}
      </p>
      <h3 className="text-2xl font-black text-slate-800 mt-2">{value}</h3>
      {subtitle && (
        <p className="text-xs text-slate-400 font-medium mt-1">{subtitle}</p>
      )}
      {trend && (
        <div className="flex items-center gap-1 mt-2 text-green-600 bg-green-50 w-fit px-2 py-0.5 rounded-full">
          <TrendingUp className="w-3 h-3" />
          <span className="text-[10px] font-bold">{trend}</span>
        </div>
      )}
    </div>
    <div className={`p-4 rounded-2xl ${color} shadow-inner`}>
      <Icon className="w-6 h-6" />
    </div>
  </div>
);

export default function Dashboard({ recipients }: DashboardProps) {
  // Aggregate data for Bar Chart (Aid Types)
  const aidTypeData = useMemo(() => {
    return AID_TYPES.map((type) => ({
      name: type,
      total: recipients.filter((r) => r.aidType === type).length,
    }));
  }, [recipients]);

  // Aggregate data for Pie Chart (Statuses)
  const statusChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    recipients.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });

    return AID_STATUSES.map((status) => ({
      name: status,
      value: counts[status] || 0,
      color:
        status === "Proses Berkas"
          ? "#f59e0b"
          : status === "Selesai"
            ? "#10b981"
            : status === "Disetujui"
              ? "#22c55e"
              : status === "Ditolak"
                ? "#ef4444"
                : status === "Disalurkan"
                  ? "#8b5cf6"
                  : status === "Calon"
                    ? "#6366f1"
                    : "#94a3b8",
    })).filter((s) => s.value > 0);
  }, [recipients]);

  // Aggregate trend data per month and sector
  const monthlyTrendData = useMemo(() => {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agt",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];

    // Initialize data array
    const data = months.map((month) => {
      const entry: any = { name: month, total: 0 };
      Object.keys(SIAK_SECTORS).forEach((sector) => {
        entry[sector] = 0;
      });
      return entry;
    });

    recipients.forEach((r) => {
      const dateStr = r.submissionDate || r.createdAt;
      if (dateStr) {
        let dateObj;
        if (dateStr.includes("/")) {
          const parts = dateStr.split("/");
          if (parts.length === 3) {
            dateObj = new Date(
              parseInt(parts[2]),
              parseInt(parts[1]) - 1,
              parseInt(parts[0]),
            );
          }
        } else {
          dateObj = new Date(dateStr);
        }

        if (dateObj && !isNaN(dateObj.getTime())) {
          const monthIndex = dateObj.getMonth();
          if (r.sector && data[monthIndex][r.sector] !== undefined) {
            data[monthIndex][r.sector] += 1;
            data[monthIndex].total += 1;
          }
        }
      }
    });

    // Optionally truncate to current month if we don't want trailing zeros
    const currentMonth = new Date().getMonth();
    return data.slice(0, currentMonth + 1);
  }, [recipients]);

  // Calculated Stats
  const stats = useMemo(() => {
    const total = recipients.length;
    const completed = recipients.filter((r) => r.status === "Selesai").length;
    const processing = recipients.filter(
      (r) => r.status === "Proses Berkas",
    ).length;
    const itemsWithIssues = recipients.filter(
      (r) => r.status === "Ditolak",
    ).length;

    // New stats
    const activeRecipients = recipients.filter(
      (r) => r.status !== "Ditolak" && r.status !== "Selesai",
    ).length;

    // Total dana disalurkan
    const totalFunds = recipients.reduce((sum, r) => {
      if (r.status === "Disalurkan" || r.status === "Selesai") {
        return sum + (r.amountDisbursed || r.amountProposed || 0);
      }
      return sum;
    }, 0);

    const formatCurrency = (amount: number) => {
      if (amount >= 1e12) {
        return `Rp ${(amount / 1e12).toFixed(1)} Triliun`;
      }
      if (amount >= 1e9) {
        return `Rp ${(amount / 1e9).toFixed(1)} Miliar`;
      }
      if (amount >= 1e6) {
        return `Rp ${(amount / 1e6).toFixed(1)} Juta`;
      }
      return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
      }).format(amount);
    };

    // Calculate per sector (Siak Cerdas, etc)
    const sectors = Object.keys(SIAK_SECTORS).map((sector) => ({
      name: sector,
      count: recipients.filter((r) => r.sector === sector).length,
    }));

    return {
      total,
      completed,
      processing,
      itemsWithIssues,
      activeRecipients,
      totalFundsFormatted: formatCurrency(totalFunds),
      sectors,
    };
  }, [recipients]);

  // Recent activity (last 5)
  const recentRecipients = useMemo(() => {
    return recipients.slice(0, 5);
  }, [recipients]);

  const getSectorIcon = (sectorName: string) => {
    switch (sectorName) {
      case "Siak Cerdas":
        return GraduationCap;
      case "Siak Dakwah":
        return Building;
      case "Siak Peduli":
        return Heart;
      case "Siak Sejahtera":
        return Sprout;
      case "Siak Sehat":
        return Activity;
      default:
        return Users;
    }
  };

  const getSectorColor = (sectorName: string) => {
    switch (sectorName) {
      case "Siak Cerdas":
        return "bg-blue-50 text-blue-600";
      case "Siak Dakwah":
        return "bg-emerald-50 text-emerald-600";
      case "Siak Peduli":
        return "bg-rose-50 text-rose-600";
      case "Siak Sejahtera":
        return "bg-amber-50 text-amber-600";
      case "Siak Sehat":
        return "bg-cyan-50 text-cyan-600";
      default:
        return "bg-slate-50 text-slate-600";
    }
  };

  const SECTOR_CHART_COLORS: Record<string, string> = {
    "Siak Cerdas": "#3b82f6",
    "Siak Dakwah": "#10b981",
    "Siak Peduli": "#f43f5e",
    "Siak Sejahtera": "#f59e0b",
    "Siak Sehat": "#06b6d4",
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Real-time Summary Widget */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-emerald-500 to-indigo-500"></div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">
              Ringkasan Real-Time
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-1">
              Pemantauan data penyaluran dan penerima aktif.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-100">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest leading-none">
              Live
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 flex items-center gap-6 group hover:shadow-md transition-shadow">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shadow-inner group-hover:scale-105 transition-transform duration-300">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-900/60 uppercase tracking-widest mb-1">
                Penerima Bantuan Aktif
              </p>
              <h3 className="text-4xl font-black text-indigo-900 tracking-tight">
                {stats.activeRecipients}
              </h3>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 flex items-center gap-6 group hover:shadow-md transition-shadow">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-inner group-hover:scale-105 transition-transform duration-300">
              <Wallet className="w-8 h-8" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-900/60 uppercase tracking-widest mb-1">
                Total Dana Tersalurkan
              </p>
              <h3 className="text-4xl font-black text-emerald-900 tracking-tight">
                {stats.totalFundsFormatted}
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Top Summary Ringkasan Statistik */}
      <div>
        <h2 className="text-lg font-black text-slate-800 mb-4 px-1">
          Statistik Eksekutif
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <StatCard
            title="Total Pendaftar"
            value={stats.total}
            subtitle="Keseluruhan pendaftar sistem"
            icon={FileCheck}
            color="bg-slate-800 text-white"
          />
          <StatCard
            title="Selesai Disalurkan"
            value={stats.completed}
            subtitle="Penyaluran tuntas"
            icon={ClipboardCheck}
            color="bg-emerald-500 text-white"
          />
          <StatCard
            title="Sedang Diproses"
            value={stats.processing}
            subtitle="Pemberkasan aktif"
            icon={Clock}
            color="bg-amber-500 text-white"
          />
        </div>

        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 px-1">
          Muzaki / Penerima per Bidang
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {stats.sectors.map((sector) => (
            <StatCard
              key={sector.name}
              title={sector.name}
              value={sector.count}
              icon={getSectorIcon(sector.name)}
              color={getSectorColor(sector.name)}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-slate-800 uppercase tracking-wider text-xs">
              Sebaran Jenis Bantuan
            </h3>
            <div className="p-2 bg-slate-50 rounded-lg">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
            </div>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aidTypeData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 600, fill: "#64748b" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 600, fill: "#64748b" }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(79, 70, 229, 0.05)" }}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="total"
                  fill="#4f46e5"
                  radius={[6, 6, 0, 0]}
                  barSize={45}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-black text-slate-800 uppercase tracking-wider text-xs mb-8">
            Status Berkas
          </h3>
          <div className="h-[260px] relative">
            {statusChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    innerRadius={65}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    formatter={(val) => (
                      <span className="text-[10px] font-bold text-slate-500 uppercase">
                        {val}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Info className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-[10px] font-bold text-slate-400 uppercase">
                  Belum ada data status
                </p>
              </div>
            )}
            {statusChartData.length > 0 && (
              <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <p className="text-2xl font-black text-slate-800 leading-none">
                  {stats.total}
                </p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Total
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative z-0">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="font-black text-slate-800 uppercase tracking-wider text-xs">
              Tren Bantuan Perbulan (Sektor) {new Date().getFullYear()}{" "}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Akumulasi penerimaan pengajuan bantuan berdasarkan sektor
            </p>
          </div>
          <div className="p-2 bg-slate-50 rounded-lg">
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={monthlyTrendData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <defs>
                {Object.entries(SECTOR_CHART_COLORS).map(([sector, color]) => (
                  <linearGradient
                    key={`color${sector}`}
                    id={`color${sector.replace(/\s+/g, "")}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#f1f5f9"
              />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 600, fill: "#64748b" }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 600, fill: "#64748b" }}
                dx={-10}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "none",
                  boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                  fontSize: "12px",
                }}
              />
              {Object.entries(SECTOR_CHART_COLORS).map(([sector, color]) => (
                <Area
                  key={sector}
                  type="monotone"
                  dataKey={sector}
                  stroke={color}
                  fillOpacity={1}
                  fill={`url(#color${sector.replace(/\s+/g, "")})`}
                  strokeWidth={2}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-black text-slate-800 uppercase tracking-wider text-xs">
            Pendaftar Terakhir
          </h3>
          <button className="text-indigo-600 text-[10px] font-black uppercase tracking-widest hover:text-indigo-700 transition-all flex items-center gap-1">
            Lihat Semua
            <TrendingUp className="w-3 h-3" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-slate-100">
              <tr>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Penerima
                </th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Program
                </th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentRecipients.length > 0 ? (
                recentRecipients.map((item) => (
                  <tr
                    key={item.id}
                    className="group hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black text-xs">
                          {item.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">
                            {item.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {item.registrationId}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <p className="text-xs text-slate-600 font-bold">
                        {item.programName}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {item.aidType}
                      </p>
                    </td>
                    <td className="py-4 text-right">
                      <span
                        className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-tighter ${STATUS_COLORS[item.status]}`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="py-12 text-center">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      Tidak ada aktivitas baru
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
