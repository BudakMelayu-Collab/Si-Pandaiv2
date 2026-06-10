import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { PPDRecord } from '../types';
import { Search, Download, Trash2, Calendar, User, FileText, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { motion } from 'motion/react';

interface PPDRecapProps {
  records: PPDRecord[];
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function PPDRecap({ records, onDelete, onClose }: PPDRecapProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const filteredRecords = records.filter(record => 
    (record.requestedBy.toLowerCase().includes(searchTerm.toLowerCase()) || 
     record.no.toLowerCase().includes(searchTerm.toLowerCase()) ||
     (record.recipientName || '').toLowerCase().includes(searchTerm.toLowerCase())) &&
    (dateFilter === '' || record.date.includes(dateFilter))
  );

  const totalAmount = filteredRecords.reduce((sum, r) => sum + r.amount, 0);

  const handleExport = () => {
    // Simple CSV Export
    const headers = [
      'No. PPD', 'Tanggal', 'Pemohon', 'Keperluan (Uraian)', 'Nama', 
      'NIK', 'Status Hubungan Keluarga', 'Asnaf', 'Nama Program', 'Kampung', 'Kecamatan', 
      'Transfer/Tunai', 'No Rekening', 'Nama Rekening', 'Jumlah', 'Keterangan'
    ];
    const csvContent = [
      headers.join(','),
      ...filteredRecords.map(r => [
        `"${r.no}"`,
        `"${r.date}"`,
        `"${r.requestedBy}"`,
        `"${r.proposeFor}"`,
        `"${r.recipientName || '-'}"`,
        `"${r.recipientNik || '-'}"`,
        `"${r.familyStatus || '-'}"`,
        `"${r.asnaf || '-'}"`,
        `"${r.programName || '-'}"`,
        `"${r.kampung || '-'}"`,
        `"${r.district || '-'}"`,
        `"${r.paymentMethod || '-'}"`,
        `"${r.bankAccountNo || '-'}"`,
        `"${r.bankAccountName || '-'}"`,
        r.amount,
        `"${r.notes || '-'}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_PPD_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleExportExcel = () => {
    const headers = [
      'No. PPD', 'Tanggal', 'Pemohon', 'Keperluan (Uraian)', 'Nama', 
      'NIK', 'Status Hubungan Keluarga', 'Asnaf', 'Nama Program', 'Kampung', 'Kecamatan', 
      'Transfer/Tunai', 'No Rekening', 'Nama Rekening', 'Jumlah', 'Keterangan'
    ];
    const data = filteredRecords.map(r => [
      r.no, r.date, r.requestedBy, r.proposeFor, r.recipientName || '-',
      r.recipientNik || '-', r.familyStatus || '-', r.asnaf || '-', r.programName || '-',
      r.kampung || '-', r.district || '-', r.paymentMethod || '-',
      r.bankAccountNo || '-', r.bankAccountName || '-', r.amount, r.notes || '-'
    ]);
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap PPD");
    XLSX.writeFile(wb, `Rekap_PPD_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const uniqueDates = Array.from(new Set(records.map(r => r.date))).sort((a, b) => {
    const dateA = a.split('/').reverse().join('');
    const dateB = b.split('/').reverse().join('');
    return dateB.localeCompare(dateA);
  });

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
      {/* Header */}
      <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black flex items-center gap-2">
            <FileText className="w-5 h-5 text-black" />
            Rekapitulasi PPD
          </h2>
          <p className="text-sm text-black">Daftar permohonan pengeluaran dana yang telah disimpan</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExportExcel}
            className="px-4 py-2 bg-emerald-50 text-black rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-100 transition-all border border-emerald-200"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Export Excel
          </button>
          <button 
            onClick={handleExport}
            className="px-4 py-2 bg-indigo-50 text-black rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-indigo-100 transition-all border border-indigo-200"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter Form */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black w-4 h-4" />
          <input 
            type="text"
            placeholder="Cari Pemohon atau No. PPD..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none text-black placeholder:text-black/50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-black w-4 h-4" />
          <input 
            type="text"
            placeholder="Filter Tanggal (DD/MM/YYYY)..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none text-black placeholder:text-black/50"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-slate-200 bg-slate-50 flex flex-col hide-scrollbar overflow-y-auto">
          <div className="p-4 border-b border-slate-200 sticky top-0 bg-slate-50">
            <h3 className="text-sm font-bold text-black mb-1">Tanggal Pembuatan PPD</h3>
            <p className="text-xs text-slate-500 font-normal">Filter berdasarkan tanggal</p>
          </div>
          <div className="flex-1 p-2 flex flex-col gap-1">
            <button
              onClick={() => setDateFilter('')}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between ${
                dateFilter === '' 
                  ? 'bg-indigo-100 text-indigo-700 font-bold shadow-sm' 
                  : 'text-black hover:bg-slate-200 font-normal'
              }`}
            >
              <span>Semua Tanggal</span>
              <span className="text-xs bg-white px-2 py-0.5 rounded-full border border-slate-200 text-black">
                {records.length}
              </span>
            </button>
            {uniqueDates.map(date => {
              const count = records.filter(r => r.date === date).length;
              const isActive = dateFilter === date;
              return (
                <button
                  key={date}
                  onClick={() => setDateFilter(date)}
                  className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between ${
                    isActive
                      ? 'bg-indigo-100 text-indigo-700 font-bold shadow-sm' 
                      : 'text-black hover:bg-slate-200 font-normal'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Calendar className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span>{date}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${isActive ? 'bg-white border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-black'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table Section */}
        <div className="flex-1 overflow-auto p-6 bg-white relative">
          {filteredRecords.length > 0 ? (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="text-left text-[11px] font-bold text-black border-b border-slate-200">
                <th className="pb-3 px-2 whitespace-nowrap">No. PPD</th>
                <th className="pb-3 px-2 whitespace-nowrap">Tanggal</th>
                <th className="pb-3 px-2 whitespace-nowrap">Pemohon</th>
                <th className="pb-3 px-2 min-w-[200px]">Keperluan (Uraian)</th>
                <th className="pb-3 px-2 whitespace-nowrap">Nama</th>
                <th className="pb-3 px-2 whitespace-nowrap">NIK</th>
                <th className="pb-3 px-2 whitespace-nowrap">Status Hubungan Keluarga</th>
                <th className="pb-3 px-2 whitespace-nowrap">Asnaf</th>
                <th className="pb-3 px-2 whitespace-nowrap">Nama Program</th>
                <th className="pb-3 px-2 whitespace-nowrap">Kampung</th>
                <th className="pb-3 px-2 whitespace-nowrap">Kecamatan</th>
                <th className="pb-3 px-2 whitespace-nowrap">Transfer/Tunai</th>
                <th className="pb-3 px-2 whitespace-nowrap">No Rekening</th>
                <th className="pb-3 px-2 whitespace-nowrap">Nama Rekening</th>
                <th className="pb-3 px-2 text-right whitespace-nowrap">Jumlah</th>
                <th className="pb-3 px-2 whitespace-nowrap">Keterangan</th>
                <th className="pb-3 px-2 text-center whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.map((record) => (
                <tr key={record.id} className="group hover:bg-slate-50 transition-colors">
                  <td className="py-4 px-2 text-[11px] font-bold text-black whitespace-nowrap">{record.no}</td>
                  <td className="py-4 px-2 text-[11px] text-black whitespace-nowrap">{record.date}</td>
                  <td className="py-4 px-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-black text-[9px] font-bold border border-slate-300">
                        {record.requestedBy.charAt(0)}
                      </div>
                      <span className="text-[11px] font-bold text-black">{record.requestedBy}</span>
                    </div>
                  </td>
                  <td className="py-4 px-2 text-[11px] font-normal text-black min-w-[200px] whitespace-normal break-words leading-relaxed">{record.proposeFor}</td>
                  <td className="py-4 px-2 text-[11px] font-bold text-black whitespace-nowrap">{record.recipientName || '-'}</td>
                  <td className="py-4 px-2 text-[11px] font-normal text-black whitespace-nowrap">{record.recipientNik || '-'}</td>
                  <td className="py-4 px-2 text-[11px] font-normal text-black whitespace-nowrap">{record.familyStatus || '-'}</td>
                  <td className="py-4 px-2 text-[11px] font-normal text-black whitespace-nowrap">{record.asnaf || '-'}</td>
                  <td className="py-4 px-2 text-[11px] font-normal text-black whitespace-nowrap">{record.programName || '-'}</td>
                  <td className="py-4 px-2 text-[11px] font-normal text-black whitespace-nowrap">{record.kampung || '-'}</td>
                  <td className="py-4 px-2 text-[11px] font-normal text-black whitespace-nowrap">{record.district || '-'}</td>
                  <td className="py-4 px-2 text-[11px] font-normal text-black whitespace-nowrap">{record.paymentMethod || '-'}</td>
                  <td className="py-4 px-2 text-[11px] font-mono text-black whitespace-nowrap">{record.bankAccountNo || '-'}</td>
                  <td className="py-4 px-2 text-[11px] font-normal text-black whitespace-nowrap">{record.bankAccountName || '-'}</td>
                  <td className="py-4 px-2 text-[11px] font-bold text-black text-right whitespace-nowrap">
                    Rp. {record.amount.toLocaleString('id-ID')}
                  </td>
                  <td className="py-4 px-2 text-[11px] font-normal text-black max-w-[120px] truncate">{record.notes || '-'}</td>
                  <td className="py-4 px-2 text-center whitespace-nowrap">
                    <button 
                      onClick={() => onDelete(record.id)}
                      className="p-1.5 text-black hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-black gap-4">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-slate-200">
              <Search className="w-8 h-8 text-black opacity-40" />
            </div>
            <p className="text-sm font-normal text-black italic">Tidak ada data rekapan yang ditemukan</p>
          </div>
        )}
        </div>
      </div>

      {/* Footer / Summary */}
      <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
        <div className="text-sm text-black font-normal">
          Menampilkan <span className="text-black font-bold">{filteredRecords.length}</span> dari {records.length} data
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-black font-normal">Total Seluruh</span>
          <div className="px-4 py-2 bg-white border border-slate-300 text-black rounded-lg font-bold">
            Rp. {totalAmount.toLocaleString('id-ID')}
          </div>
        </div>
      </div>
    </div>
  );
}
