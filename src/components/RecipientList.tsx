import React, { useState } from 'react';
import { 
  Search, Filter, 
  ExternalLink, Download, FileText, ChevronRight,
  Edit3, Trash2, FileCheck, ClipboardList, FileStack, Loader2,
  Phone, MapPin, Hash, Archive, Bell, AlertTriangle, AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { AID_TYPES, AID_STATUSES, STATUS_COLORS } from '../constants';
import { Recipient } from '../types';
import { cn, isRecipientFileTracked } from '../lib/utils';
import { mergeRecipientScans } from '../lib/pdfMerger';

interface RecipientListProps {
  data: Recipient[];
  onReceipt: (recipient: Recipient) => void;
  onMPZIS: (recipient: Recipient) => void;
  onEPPD: (recipient: Recipient) => void;
  onSurvey: (recipient: Recipient) => void;
  onDeleteRecipient?: (recipient: Recipient) => void;
}

function getFormattedSubmissionDate(dateStr: string): string {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  
  // Create relative date comparing only calendar day starts (disregard time of day differences)
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const diffTime = nowStart.getTime() - dateStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) {
    return 'Hari ini';
  } else if (diffDays === 1) {
    return '1 Hari yang lalu';
  } else if (diffDays === 2) {
    return '2 Hari yang lalu';
  } else {
    // 3 or more days ago - directly output the formal submission date ("tanggal masuk berkas")
    return date.toLocaleDateString('id-ID', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  }
}

function getRelativeTimeDetails(createdAtStr?: string, submissionDateStr?: string, referenceNow: Date = new Date()): { relative: string; timeStr: string } {
  // Use createdAt (precise timestamp) if available, otherwise fall back to submissionDate
  const dateStr = createdAtStr || submissionDateStr;
  if (!dateStr) return { relative: '', timeStr: '' };
  
  const date = new Date(dateStr);
  
  // Format local timestamp like HH:mm (e.g. 14:30)
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  const hasHighPrecision = !!createdAtStr && (createdAtStr.includes('T') || createdAtStr.includes(':'));
  
  if (!hasHighPrecision) {
    return {
      relative: 'Hari ini',
      timeStr: 'Harian'
    };
  }

  const diffMs = referenceNow.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let relative = '';
  if (diffMs < 0 || diffMinutes < 1) {
    relative = 'baru saja';
  } else if (diffMinutes < 60) {
    relative = `${diffMinutes} menit yang lalu`;
  } else if (diffHours < 24) {
    relative = `${diffHours} jam yang lalu`;
  } else {
    relative = `${diffDays || 1} hari yang lalu`;
  }

  return { relative, timeStr };
}

export default function RecipientList({ data, onReceipt, onMPZIS, onEPPD, onSurvey, onDeleteRecipient }: RecipientListProps) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [recipientToDelete, setRecipientToDelete] = useState<Recipient | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleMergeScans = async (recipient: Recipient) => {
    setMergingId(recipient.id);
    try {
      await mergeRecipientScans(recipient.id, recipient.name);
    } catch (error: any) {
      alert(error.message || 'Gagal menggabungkan berkas scan.');
    } finally {
      setMergingId(null);
    }
  };

  const filteredData = data
    .filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) || 
                           item.nik.includes(search);
      const matchesStatus = filterStatus === 'All' || item.status === filterStatus;
      const matchesType = filterType === 'All' || item.aidType === filterType;
      return matchesSearch && matchesStatus && matchesType;
    })
    .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());

  const showInstitutionColumns = filteredData.some(item => 
    item.source && item.source !== 'KLM'
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm text-sm font-normal text-black">
      <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black" />
          <input 
            type="text" 
            placeholder="Cari Nama atau NIK..." 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-normal text-black placeholder-black shadow-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-normal text-black tracking-wider">Status:</span>
            <select 
              className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm text-black outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-normal"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="All">Semua Status</option>
              {AID_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-normal text-black tracking-wider">Jenis:</span>
            <select 
              className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm text-black outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-normal"
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
            >
              <option value="All">Semua Jenis</option>
              {AID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Recipient Queue Table grouped inside a single unified scrollable wrapper */}
      <div className="overflow-x-auto">
        {filteredData.length > 0 ? (
          <div className="min-w-[1200px] divide-y divide-slate-200">
            {(() => {
              // Grouping logic for rows
              const groupedData = [
                {
                  label: 'Antrean Masuk Hari Ini',
                  key: 'Hari ini',
                  dotColor: 'bg-emerald-500',
                  pulse: true,
                  items: [] as Recipient[]
                },
                {
                  label: 'Antrean Kemarin (1 Hari yang Lalu)',
                  key: '1 Hari yang lalu',
                  dotColor: 'bg-amber-500',
                  pulse: false,
                  items: [] as Recipient[]
                },
                {
                  label: 'Antrean 2 Hari yang Lalu',
                  key: '2 Hari yang lalu',
                  dotColor: 'bg-sky-500',
                  pulse: false,
                  items: [] as Recipient[]
                },
                {
                  label: 'Berkas Masuk Sebelumnya (3+ Hari Lalu)',
                  key: 'Arsip',
                  dotColor: 'bg-slate-400',
                  pulse: false,
                  items: [] as Recipient[]
                }
              ];

              filteredData.forEach(item => {
                const rel = getFormattedSubmissionDate(item.submissionDate);
                if (rel === 'Hari ini') {
                  groupedData[0].items.push(item);
                } else if (rel === '1 Hari yang lalu') {
                  groupedData[1].items.push(item);
                } else if (rel === '2 Hari yang lalu') {
                  groupedData[2].items.push(item);
                } else {
                  groupedData[3].items.push(item);
                }
              });

              return groupedData.map((group) => {
                if (group.items.length === 0) return null;

                return (
                  <div key={group.key} className="bg-white">
                    {/* Header Group */}
                    <div className="bg-slate-100/70 border-b border-slate-200/80 pl-6 pr-6 py-2.5 flex items-center gap-2">
                      <span className={cn(
                        "w-2.5 h-2.5 rounded-full",
                        group.dotColor,
                        group.pulse && "animate-pulse"
                      )} />
                      <span className="text-sm font-normal tracking-wider text-black">
                        {group.label}
                      </span>
                      <span className="text-sm font-normal text-black bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-lg ml-auto">
                        {group.items.length} Berkas
                      </span>
                    </div>

                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50/75 border-b border-slate-200">
                        <tr>
                          <th className="pl-6 pr-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">No. Reg</th>
                          <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Tanggal</th>
                          <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Program</th>
                          <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Jenis Bantuan</th>
                          <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Sumber Berkas</th>
                          {showInstitutionColumns && (
                            <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Nama Lembaga</th>
                          )}
                          <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Penanggung Jawab (PIC)</th>
                          <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Status</th>
                          <th className="pr-6 pl-3 py-3.5 text-sm font-normal text-black tracking-wider text-right sticky right-0 bg-slate-50 whitespace-nowrap">Progres dan Tindakan Berkas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(() => {
                          const registrationGroupsMap: { [id: string]: Recipient[] } = {};
                          const registrationIdsOrder: string[] = [];

                          group.items.forEach(item => {
                            const regId = item.registrationId || item.id;
                            if (!registrationGroupsMap[regId]) {
                              registrationGroupsMap[regId] = [];
                              registrationIdsOrder.push(regId);
                            }
                            registrationGroupsMap[regId].push(item);
                          });

                          return registrationIdsOrder.map((regId) => {
                            const groupItems = registrationGroupsMap[regId];
                            const item = groupItems[0];
                            const { relative, timeStr } = getRelativeTimeDetails(item.createdAt, item.submissionDate, currentTime);

                            return (
                              <React.Fragment key={regId}>
                                 <tr className="hover:bg-slate-50/80 transition-colors group">
                                  {/* No. Reg */}
                                  <td className="pl-6 pr-3 py-4 text-sm font-normal text-black whitespace-nowrap">
                                    <span className="font-mono font-normal text-sm text-black">
                                      #{regId}
                                    </span>
                                  </td>

                                  {/* Tanggal */}
                                  <td className="px-3 py-4 text-sm font-normal text-black whitespace-nowrap">
                                    {timeStr !== 'Harian' ? `${timeStr} (${relative})` : relative}
                                  </td>

                                  {/* Program */}
                                  <td className="px-3 py-4 text-sm whitespace-nowrap">
                                    <div className="text-sm text-black font-normal leading-snug" title={item.programName}>
                                      {item.programName}
                                    </div>
                                  </td>

                                  {/* Jenis */}
                                  <td className="px-3 py-4 text-sm whitespace-nowrap">
                                    <span className="font-normal text-black">
                                      {item.aidType}
                                    </span>
                                  </td>

                                  {/* Sumber Berkas */}
                                  <td className="px-3 py-4 text-sm whitespace-nowrap">
                                    <span className="font-normal text-black">
                                      {item.source || 'KLM'}
                                    </span>
                                  </td>

                                  {showInstitutionColumns && (
                                    /* Nama Lembaga */
                                    <td className="px-3 py-4 text-sm whitespace-nowrap text-black font-semibold">
                                      {['UPZ', 'Online', 'Instansi', 'Lembaga'].includes(item.source) ? (item.institutionName || '-') : '-'}
                                    </td>
                                  )}

                                  {/* Penanggung Jawab (PIC) */}
                                  <td className="px-3 py-4 text-sm whitespace-nowrap text-black font-medium">
                                    {item.personInCharge || '-'}
                                  </td>

                                  {/* Status */}
                                  <td className="px-3 py-4 text-sm whitespace-nowrap">
                                    <span className={cn(
                                      "text-sm px-2.5 py-1 rounded-full font-normal tracking-tight border shadow-xs !text-black bg-slate-100 border-slate-300"
                                    )}>
                                      {item.status}
                                    </span>
                                  </td>

                                  {/* Progress & Tindakan Berkas sticky right */}
                                  <td className="pr-6 pl-3 py-4 text-right sticky right-0 bg-white group-hover:bg-slate-50 transition-colors border-l border-slate-100 shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.04)] whitespace-nowrap">
                                    <div className="flex flex-col gap-2 items-end justify-center">
                                      {/* Progress Berkas */}
                                      <div className="flex items-center gap-1 bg-slate-50/50 border border-slate-100 p-1 rounded-xl w-fit">
                                        {[
                                          { key: 'receipt', color: 'bg-emerald-500 ring-emerald-500/50 shadow-[0_0_6px_rgba(16,185,129,0.3)]', label: 'Tanda Terima', activeClass: 'bg-slate-100 border-slate-200 text-black font-normal' },
                                          { key: 'mpzis', color: 'bg-sky-500 ring-sky-500/50 shadow-[0_0_6px_rgba(14,165,233,0.3)]', label: 'MPZIS', activeClass: 'bg-slate-100 border-slate-200 text-black font-normal' },
                                          { key: 'eppd', color: 'bg-indigo-500 ring-indigo-500/50 shadow-[0_0_6px_rgba(99,102,241,0.3)]', label: 'E-PPD', activeClass: 'bg-slate-100 border-slate-200 text-black font-normal' },
                                          { key: 'survey', color: 'bg-fuchsia-500 ring-fuchsia-500/50 shadow-[0_0_6px_rgba(192,38,211,0.3)]', label: 'SURVEY', activeClass: 'bg-slate-100 border-slate-200 text-black font-normal' },
                                        ].map((led) => {
                                          const isTracked = isRecipientFileTracked(item, led.key as any);
                                          return (
                                            <div
                                              key={led.key}
                                              className={cn(
                                                "py-0.5 px-1.5 rounded-lg text-sm border transition-all flex items-center gap-1 select-none font-normal",
                                                isTracked 
                                                  ? led.activeClass 
                                                  : "bg-white border-slate-150 text-black"
                                              )}
                                              title={led.label}
                                            >
                                              <div 
                                                className={cn(
                                                  "w-1 h-1 rounded-full ring-1 ring-white/15",
                                                  isTracked ? led.color : "bg-slate-300"
                                                )}
                                              />
                                              <span className="text-sm font-normal tracking-tight text-black">
                                                {led.key === 'eppd' ? 'E-PPD' : led.key === 'mpzis' ? 'MPZIS' : (led.key.charAt(0).toUpperCase() + led.key.slice(1))}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>

                                      {/* Templates buttons */}
                                      <div className="flex items-center gap-1.5 justify-end">
                                        <button 
                                          onClick={() => onReceipt(item)}
                                          className="py-1 px-2 text-black bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-all text-center flex items-center justify-center gap-1 group shadow-xs cursor-pointer text-sm font-normal tracking-tight"
                                          title="Buat Tanda Terima Dokumen"
                                        >
                                          <FileCheck className="w-3 h-3 text-black" />
                                          <span>Receipt</span>
                                        </button>
                                        
                                        <button 
                                          onClick={() => onMPZIS(item)}
                                          className="py-1 px-2 text-black bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-all text-center flex items-center justify-center gap-1 group shadow-xs cursor-pointer text-sm font-normal tracking-tight"
                                          title="Buka MPZIS (Memorandum)"
                                        >
                                          <FileText className="w-3 h-3 text-black" />
                                          <span>MPZIS</span>
                                        </button>
                                        
                                        <button 
                                          onClick={() => onEPPD(item)}
                                          className="py-1 px-2 text-black bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-all text-center flex items-center justify-center gap-1 group shadow-xs cursor-pointer text-sm font-normal tracking-tight"
                                          title="Buka E-PPD"
                                        >
                                          <FileCheck className="w-3 h-3 text-black" />
                                          <span>E-PPD</span>
                                        </button>
                                        
                                        <button 
                                          onClick={() => onSurvey(item)}
                                          className="py-1 px-2 text-black bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-all text-center flex items-center justify-center gap-1 group shadow-xs cursor-pointer text-sm font-normal tracking-tight"
                                          title="Buka Lembar Verifikasi (Survey)"
                                        >
                                          <ClipboardList className="w-3 h-3 text-black" />
                                          <span>Survey</span>
                                        </button>

                                        {/* Utility buttons (WA, Merge, Delete) */}
                                        {item.contact && (
                                          <a 
                                            href={`https://wa.me/${item.contact.replace(/\D/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1 text-black hover:bg-slate-50 rounded-lg border border-slate-200 shadow-xs transition-colors"
                                            title="Hubungi via WhatsApp"
                                          >
                                            <Phone className="w-3 h-3 text-black" />
                                          </a>
                                        )}

                                        <button 
                                          onClick={() => handleMergeScans(item)}
                                          disabled={mergingId === item.id}
                                          className={cn(
                                            "py-1 px-1.5 text-black bg-white rounded-lg border transition-all text-center flex items-center justify-center gap-1 group shadow-xs cursor-pointer text-sm font-normal tracking-tight",
                                            mergingId === item.id 
                                              ? "bg-slate-100 border-slate-250 cursor-not-allowed font-normal" 
                                              : "hover:bg-slate-50 border-slate-200"
                                          )}
                                          title="Gabungkan Semua File Scan"
                                        >
                                          {mergingId === item.id ? (
                                            <>
                                              <Loader2 className="w-3 h-3 text-black animate-spin" />
                                              <span>Wait</span>
                                            </>
                                          ) : (
                                            <>
                                              <FileStack className="w-3 h-3 text-black" />
                                              <span>Merge</span>
                                            </>
                                          )}
                                        </button>

                                        {onDeleteRecipient && (
                                          <button 
                                            onClick={() => setRecipientToDelete(item)}
                                            className="p-1 text-black hover:bg-slate-50 rounded-lg border border-slate-200 shadow-xs transition-colors cursor-pointer"
                                            title="Hapus Berkas"
                                          >
                                            <Trash2 className="w-3.5 h-3.5 text-black" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {/* Supporting sub-table row for Recipient Details */}
                                <tr>
                                  <td colSpan={showInstitutionColumns ? 9 : 8} className="pl-6 pr-6 pb-4 pt-1 bg-slate-50/40">
                                    <div className="overflow-x-auto border border-slate-200/80 rounded-2xl shadow-xs bg-white">
                                      <table className="w-full text-left border-collapse table-auto">
                                        <thead className="bg-slate-50 border-b border-slate-200/60 text-black text-sm tracking-wider font-normal">
                                          <tr>
                                            <th className="px-3.5 py-2.5 text-center text-black w-12 border-r border-slate-200/40 font-normal">No</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">Nama</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">NIK</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">Mengajukan Bantuan Untuk</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">Status Berkas</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">No Hp</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">Info Rekening</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">Alamat</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">Kampung</th>
                                            <th className="px-3.5 py-2.5 text-black whitespace-nowrap font-normal">Lihat Berkas</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {groupItems.map((subItem, idx) => {
                                            const hasReceipt = isRecipientFileTracked(subItem, 'receipt');
                                            const hasEPPD = isRecipientFileTracked(subItem, 'eppd');
                                            const hasMPZIS = isRecipientFileTracked(subItem, 'mpzis');
                                            const hasSurvey = isRecipientFileTracked(subItem, 'survey');
                                            const allSubFilesTracked = hasReceipt && hasEPPD && hasMPZIS && hasSurvey;

                                            return (
                                              <tr key={subItem.id} className="hover:bg-slate-50/55 bg-white text-sm text-black font-normal">
                                                <td className="px-3.5 py-3 text-center font-normal text-black border-r border-slate-200/40">{idx + 1}</td>
                                                <td className="px-3.5 py-3 font-normal text-black border-r border-slate-200/40 capitalize whitespace-nowrap">{subItem.name?.toLowerCase() || ''}</td>
                                                <td className="px-3.5 py-3 font-mono font-normal text-black select-all border-r border-slate-200/40 whitespace-nowrap">{subItem.nik}</td>
                                                <td className="px-3.5 py-3 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">{subItem.purpose || '-'}</td>
                                                <td className="px-3.5 py-3 border-r border-slate-200/40 whitespace-nowrap">
                                                  <span className={cn(
                                                    "px-2.5 py-1 rounded-full text-sm font-normal tracking-tight border shadow-xs !text-black bg-slate-100 border-slate-300"
                                                  )}>
                                                    {allSubFilesTracked ? 'Lengkap' : 'Tidak Lengkap'}
                                                  </span>
                                                </td>
                                                <td className="px-3.5 py-3 border-r border-slate-200/40 whitespace-nowrap">
                                                  {subItem.contact ? (
                                                    <a 
                                                      href={`https://wa.me/${subItem.contact.replace(/\D/g, '')}`}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="text-black font-mono font-normal hover:underline"
                                                    >
                                                      {subItem.contact}
                                                    </a>
                                                  ) : '-'}
                                                </td>
                                                <td className="px-3.5 py-3 font-mono text-sm font-normal text-black border-r border-slate-200/40 whitespace-nowrap">
                                                  {subItem.bankAccountNo ? `${subItem.bankAccountNo}/${subItem.bankName || 'BCA'}/${subItem.bankAccountHolder || subItem.name}` : '-'}
                                                </td>
                                                <td className="px-3.5 py-3 text-black border-r border-slate-200/40 truncate max-w-[220px]" title={subItem.address}>{subItem.address || '-'}</td>
                                                <td className="px-3.5 py-3 text-black border-r border-slate-200/40 font-normal whitespace-nowrap">{subItem.kampung || '-'}</td>
                                                <td className="px-3.5 py-3 font-normal whitespace-nowrap">
                                                  <button
                                                    onClick={() => handleMergeScans(subItem)}
                                                    disabled={mergingId === subItem.id}
                                                    className={cn(
                                                      "py-1 px-2 text-black bg-white hover:bg-slate-50 border border-slate-205 rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer text-sm font-normal tracking-tight",
                                                      mergingId === subItem.id 
                                                        ? "bg-slate-100 border-slate-300 cursor-not-allowed font-normal" 
                                                        : "border-slate-200"
                                                    )}
                                                  >
                                                    {mergingId === subItem.id ? (
                                                      <>
                                                        <Loader2 className="w-3.5 h-3.5 text-black animate-spin" />
                                                        <span>Processing...</span>
                                                      </>
                                                    ) : (
                                                      <>
                                                        <ExternalLink className="w-3.5 h-3.5 text-black" />
                                                        <span>Lihat Berkas</span>
                                                      </>
                                                    )}
                                                  </button>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="py-16 text-center border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-2xl m-6">
                                            <Archive className="w-12 h-12 text-black mx-auto mb-3" />
                                            <p className="text-black font-normal tracking-wider text-sm">Tidak Ada Data Antrean</p>
                                            <p className="text-sm text-black mt-1">Ubah kata kunci pencarian atau filter status untuk mencari data.</p>
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* Footer statistics summary and pagination control links */}
                                      <div className="p-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
                                        <p className="font-normal text-black">Menampilkan {filteredData.length} dari {data.length} antrean terdaftar</p>
                                        <div className="flex items-center gap-1">
                                          <button className="px-3 py-1.5 font-normal text-black cursor-not-allowed rounded text-sm">Sebelumnya</button>
                                          <button className="px-3 py-1.5 font-normal bg-neutral-200 border border-neutral-300 text-black rounded-lg shadow-sm transition-all text-sm">1</button>
                                          <button className="px-3 py-1.5 font-normal text-black hover:bg-slate-100 rounded-lg transition-colors text-sm">2</button>
                                          <button className="px-3 py-1.5 font-normal text-black hover:bg-slate-100 rounded-lg transition-colors text-sm">Selanjutnya</button>
                                        </div>
      </div>

      {/* Custom Delete Warning Confirmation Modal */}
      {recipientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setRecipientToDelete(null)}
          />
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 z-10 font-normal"
          >
            <div className="p-6 text-center space-y-4 font-normal">
              <div className="w-16 h-16 bg-slate-50 border border-slate-200 text-black rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <Trash2 className="w-8 h-8 text-black" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-sm font-normal text-black tracking-tight">Hapus Berkas Penerima</h3>
                <p className="text-black text-sm leading-relaxed font-normal">
                  Tindakan ini tidak dapat dibatalkan. Berkas pendaftaran, status, dan riwayat bantuan untuk mustahik berikut akan terhapus secara permanen dari pangkalan data Si-PANDAI:
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-left space-y-2.5">
                <div>
                  <span className="text-sm font-normal tracking-wider text-black">Mustahik / Penerima</span>
                  <p className="text-sm font-normal text-black tracking-tight capitalize">{recipientToDelete.name?.toLowerCase() || ''}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200 text-sm font-normal">
                  <div>
                    <span className="text-sm font-normal text-black font-normal">No. NIK</span>
                    <p className="font-normal text-black">{recipientToDelete.nik}</p>
                  </div>
                  <div>
                    <span className="text-sm font-normal text-black font-normal">Bidang</span>
                    <p className="font-normal text-black font-normal">{recipientToDelete.sector}</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-left flex gap-3 font-normal">
                <AlertTriangle className="w-5 h-5 text-black shrink-0 mt-0.5" />
                <div className="space-y-0.5 font-normal">
                  <h4 className="text-sm font-normal text-black">Peringatan sebelum menghapus</h4>
                  <p className="text-sm text-black font-normal leading-relaxed">
                    Pastikan Anda telah memeriksa kembali data di atas. Data yang dihapus tidak bisa dikembalikan kembali.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3 font-normal">
              <button
                type="button"
                onClick={() => setRecipientToDelete(null)}
                className="flex-1 py-2.5 text-sm font-normal text-black bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-all cursor-pointer active:scale-95 text-center"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteRecipient) {
                     onDeleteRecipient(recipientToDelete);
                  }
                  setRecipientToDelete(null);
                }}
                className="flex-1 py-2.5 text-sm font-normal text-black bg-slate-100 hover:bg-slate-200 border border-slate-350 rounded-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5 text-black" />
                Ya, hapus permanen
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

