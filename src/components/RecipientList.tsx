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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Cari Nama atau NIK..." 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm shadow-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status:</span>
            <select 
              className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-semibold"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="All">Semua Status</option>
              {AID_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Jenis:</span>
            <select 
              className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-semibold"
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
            >
              <option value="All">Semua Jenis</option>
              {AID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Recipient Notification List grouped with distinct spacing & headers */}
      <div className="p-5 bg-slate-50/15">
        {filteredData.length > 0 ? (
          <div className="space-y-8">
            {(() => {
              // Grouping logic for relative timeline separation
              const groupedData = [
                {
                  label: 'Antrean Masuk Hari Ini',
                  key: 'Hari ini',
                  sideStrip: 'before:bg-emerald-500',
                  avatar: 'bg-emerald-50 text-emerald-600 border-emerald-100',
                  badge: 'bg-emerald-50 text-emerald-700 border border-emerald-500/20',
                  dotColor: 'bg-emerald-500',
                  pulse: true,
                  items: [] as Recipient[]
                },
                {
                  label: 'Antrean Kemarin (1 Hari yang Lalu)',
                  key: '1 Hari yang lalu',
                  sideStrip: 'before:bg-amber-500',
                  avatar: 'bg-amber-50 text-amber-700 border-amber-100',
                  badge: 'bg-amber-50 text-amber-700 border border-amber-500/20',
                  dotColor: 'bg-amber-500',
                  pulse: false,
                  items: [] as Recipient[]
                },
                {
                  label: 'Antrean 2 Hari yang Lalu',
                  key: '2 Hari yang lalu',
                  sideStrip: 'before:bg-sky-500',
                  avatar: 'bg-sky-50 text-sky-700 border-sky-100',
                  badge: 'bg-sky-50 text-sky-700 border border-sky-500/20',
                  dotColor: 'bg-sky-500',
                  pulse: false,
                  items: [] as Recipient[]
                },
                {
                  label: 'Berkas Masuk Sebelumnya (3+ Hari Lalu)',
                  key: 'Arsip',
                  sideStrip: 'before:bg-slate-300',
                  avatar: 'bg-slate-50 text-slate-500 border-slate-200/80',
                  badge: 'bg-slate-100 text-slate-700 border border-slate-200',
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
                  <div key={group.key} className="space-y-4">
                    {/* Header Group to establish a clear gap and aesthetic separation */}
                    <div className="flex items-center justify-between py-2 px-4 bg-slate-100/60 rounded-xl border border-slate-200/60">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "w-2 h-2 rounded-full",
                          group.dotColor,
                          group.pulse && "animate-pulse"
                        )} />
                        <h4 className="text-xs font-bold tracking-wider text-slate-700">
                          {group.label}
                        </h4>
                      </div>
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-tight bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-sm">
                        {group.items.length} Berkas
                      </span>
                    </div>

                    {/* Actual notification items grid container inside the group */}
                    <div className="flex flex-col gap-3.5">
                      {group.items.map((item) => {
                        const timeNotification = getFormattedSubmissionDate(item.submissionDate);
                        const isToday = group.key === 'Hari ini';
                        const isOneDayAgo = group.key === '1 Hari yang lalu';
                        const isTwoDaysAgo = group.key === '2 Hari yang lalu';

                        return (
                          <div 
                            key={item.id} 
                            className={cn(
                              "relative overflow-hidden bg-white hover:bg-slate-50/40 border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 transition-all shadow-sm hover:shadow-md",
                              "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5",
                              group.sideStrip
                            )}
                          >
                            {/* Top Row: Info and Badge (Progress on Left, Status on Right) */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100/60 pb-3 w-full">
                              {/* Top Left: ID, Timing Pill, Sector */}
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                <span className="font-mono font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-[10px]">
                                  #{item.registrationId || item.id.substring(0, 8)}
                                </span>
                                <span className="text-slate-300">•</span>
                                <div className={cn("px-2 py-0.5 rounded-lg flex items-center gap-1 text-[11px] font-bold shadow-sm", group.badge)}>
                                  {isToday && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                  {isOneDayAgo && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                                  {isTwoDaysAgo && <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />}
                                  <span>{timeNotification}</span>
                                </div>
                                <span className="text-slate-300">•</span>
                                <span className="font-bold text-indigo-600 uppercase tracking-wider text-[10px]">{item.sector}</span>
                              </div>

                              {/* Top Right: Progress on Left of the Status Badge */}
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mr-1">Progress Berkas:</span>
                                
                                {/* Progress indicators di samping kiri status */}
                                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/50 p-0.5 rounded-lg shadow-xs">
                                  {[
                                    { key: 'receipt', color: 'bg-emerald-500 ring-emerald-500/50 shadow-[0_0_6px_rgba(16,185,129,0.3)]', label: 'Tanda Terima', activeClass: 'bg-emerald-50 border-emerald-200 text-emerald-700 font-extrabold' },
                                    { key: 'mpzis', color: 'bg-sky-500 ring-sky-500/50 shadow-[0_0_6px_rgba(14,165,233,0.3)]', label: 'MPZIS', activeClass: 'bg-sky-50 border-sky-200 text-sky-700 font-extrabold' },
                                    { key: 'eppd', color: 'bg-indigo-500 ring-indigo-500/50 shadow-[0_0_6px_rgba(99,102,241,0.3)]', label: 'E-PPD', activeClass: 'bg-indigo-50 border-indigo-200 text-indigo-700 font-extrabold' },
                                    { key: 'survey', color: 'bg-fuchsia-500 ring-fuchsia-500/50 shadow-[0_0_6px_rgba(192,38,211,0.3)]', label: 'SURVEY', activeClass: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700 font-extrabold' },
                                  ].map((led) => {
                                    const isTracked = isRecipientFileTracked(item, led.key as any);
                                    return (
                                      <div
                                        key={led.key}
                                        className={cn(
                                          "py-0.5 px-1.5 rounded-md text-[8px] border transition-all flex items-center gap-1 select-none",
                                          isTracked 
                                            ? led.activeClass 
                                            : "bg-white border-slate-100 text-slate-400"
                                        )}
                                        title={led.label}
                                      >
                                        <div 
                                          className={cn(
                                            "w-1 h-1 rounded-full ring-1 ring-white/15",
                                            isTracked ? led.color : "bg-slate-300"
                                          )}
                                        />
                                        <span className="text-[7.5px] font-bold tracking-tight">{led.key.toUpperCase()}</span>
                                      </div>
                                    );
                                  })}
                                </div>

                                <span className={cn(
                                  "text-[10px] px-2.5 py-1 rounded-full font-extrabold uppercase tracking-tight border shadow-sm",
                                  STATUS_COLORS[item.status]
                                )}>
                                  {item.status}
                                </span>
                              </div>
                            </div>

                            {/* Main Body Column */}
                            <div className="flex items-start gap-4 flex-1 min-w-0 w-full">
                              <div className={cn("hidden sm:flex items-center justify-center w-11 h-11 rounded-xl shrink-0 border relative", group.avatar)}>
                                <Bell className="w-5 h-5" />
                                {isToday && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />}
                              </div>
                              
                              <div className="flex-grow min-w-0 space-y-1.5">
                                {/* Relative Timestamp Info and Reminders */}
                                {(() => {
                                  const { relative, timeStr } = getRelativeTimeDetails(item.createdAt, item.submissionDate, currentTime);
                                  return (
                                    <div className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5 pl-0.5">
                                      <span>Terunggah pukul</span>
                                      <span className="font-extrabold text-slate-700 bg-slate-100 border border-slate-200/50 px-1.5 py-0.5 rounded">{timeStr}</span>
                                      <span>•</span>
                                      <span className="text-indigo-600 font-bold bg-indigo-50/50 border border-indigo-100/30 px-2 py-0.5 rounded-md">
                                        {relative}
                                      </span>
                                    </div>
                                  );
                                })()}

                                {/* Main Title Row: Mustahik's Name */}
                                <h3 className="font-bold text-slate-800 text-base uppercase tracking-tight truncate max-w-sm pl-0.5">
                                  {item.name}
                                </h3>

                                {/* Info Row: NIK, Contact, & Specific Program Description */}
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-600 pl-0.5">
                                  <span className="flex items-center gap-1 font-mono text-slate-500">
                                    <Hash className="w-3.5 h-3.5 text-slate-400" /> {item.nik}
                                  </span>
                                  {item.contact && (
                                    <span className="flex items-center gap-1">
                                      <Phone className="w-3.5 h-3.5 text-slate-400" /> {item.contact}
                                    </span>
                                  )}
                                  <span className="text-slate-300 hidden md:inline">|</span>
                                  <span className="italic block max-w-md truncate text-slate-600" title={item.programName}>
                                    {item.aidType}: {item.programName}
                                  </span>
                                </div>

                                {/* Amount Proposed Row */}
                                <div className="flex items-center gap-2 pl-0.5">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Nominal Usulan:</span>
                                  <span className="text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded shadow-sm">
                                    Rp {Number(item.amountProposed).toLocaleString('id-ID')}
                                  </span>
                                </div>

                                {/* Location Row: Kampung & Details Address */}
                                <div className="flex items-center gap-1.5 text-xs text-slate-500 pl-0.5">
                                  <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                  <span className="font-bold text-slate-700">{item.kampung}</span>
                                  <span className="text-slate-350">•</span>
                                  <span className="truncate max-w-sm text-slate-500" title={`${item.address} RT ${item.rt} / RW ${item.rw}`}>
                                    {item.address} RT {item.rt}/{item.rw}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Footer Action Row: Delete on bottom-left, document controls on bottom-right */}
                            <div className="w-full border-t border-slate-100 pt-3 mt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              {/* Left Side: Delete (Hapus) Button */}
                              <div>
                                {onDeleteRecipient ? (
                                  <button 
                                    onClick={() => setRecipientToDelete(item)}
                                    className="py-1.5 px-3 text-red-600 hover:text-red-700 bg-red-50 hover:bg-rose-50 rounded-xl border border-red-100 hover:border-rose-200 transition-all text-center flex items-center justify-center gap-1.5 shadow-sm hover:shadow cursor-pointer text-xs font-extrabold"
                                    title="Hapus Berkas"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                    <span>Hapus</span>
                                  </button>
                                ) : (
                                  <div />
                                )}
                              </div>

                              {/* Right Side: Actions (Receipt, MPZIS, E-PPD, Survey, Merge) */}
                              <div className="flex flex-wrap items-center gap-1.5 justify-end">
                                <button 
                                  onClick={() => onReceipt(item)}
                                  className="py-1.5 px-2.5 text-slate-600 hover:text-amber-700 bg-white hover:bg-amber-50 rounded-xl border border-slate-200 hover:border-amber-200 transition-all text-center flex items-center justify-center gap-1 group shadow-sm cursor-pointer text-[10px] font-bold uppercase tracking-tight"
                                  title="Buat Tanda Terima Dokumen"
                                >
                                  <FileCheck className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-500" />
                                  <span>Receipt</span>
                                </button>
                                
                                <button 
                                  onClick={() => onMPZIS(item)}
                                  className="py-1.5 px-2.5 text-slate-600 hover:text-blue-700 bg-white hover:bg-blue-50 rounded-xl border border-slate-200 hover:border-blue-200 transition-all text-center flex items-center justify-center gap-1 group shadow-sm cursor-pointer text-[10px] font-bold uppercase tracking-tight"
                                  title="Buka MPZIS (Memorandum)"
                                >
                                  <FileText className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500" />
                                  <span>MPZIS</span>
                                </button>
                                
                                <button 
                                  onClick={() => onEPPD(item)}
                                  className="py-1.5 px-2.5 text-slate-600 hover:text-indigo-700 bg-white hover:bg-indigo-50 rounded-xl border border-slate-200 hover:border-indigo-200 transition-all text-center flex items-center justify-center gap-1 group shadow-sm cursor-pointer text-[10px] font-bold uppercase tracking-tight"
                                  title="Buka E-PPD"
                                >
                                  <FileCheck className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500" />
                                  <span>E-PPD</span>
                                </button>
                                
                                <button 
                                  onClick={() => onSurvey(item)}
                                  className="py-1.5 px-2.5 text-slate-600 hover:text-emerald-700 bg-white hover:bg-emerald-50 rounded-xl border border-slate-200 hover:border-emerald-200 transition-all text-center flex items-center justify-center gap-1 group shadow-sm cursor-pointer text-[10px] font-bold uppercase tracking-tight"
                                  title="Buka Lembar Verifikasi (Survey)"
                                >
                                  <ClipboardList className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500" />
                                  <span>Survey</span>
                                </button>
                                
                                <button 
                                  onClick={() => handleMergeScans(item)}
                                  disabled={mergingId === item.id}
                                  className={cn(
                                    "py-1.5 px-2.5 text-slate-600 bg-white rounded-xl border transition-all text-center flex items-center justify-center gap-1 group shadow-sm cursor-pointer text-[10px] font-bold uppercase tracking-tight",
                                    mergingId === item.id 
                                      ? "bg-indigo-50/50 border-indigo-200 cursor-not-allowed text-indigo-500" 
                                      : "hover:text-indigo-700 hover:bg-indigo-50 border-slate-200 hover:border-indigo-200"
                                  )}
                                  title="Gabungkan Semua File Scan"
                                >
                                  {mergingId === item.id ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                                      <span>Wait</span>
                                    </>
                                  ) : (
                                    <>
                                      <FileStack className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500" />
                                      <span>Merge</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="py-16 text-center border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-2xl">
            <Archive className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-bold uppercase tracking-wider text-sm">Tidak Ada Data Antrean</p>
            <p className="text-xs text-slate-400 mt-1">Ubah kata kunci pencarian atau filter status untuk mencari data.</p>
          </div>
        )}
      </div>
      
      {/* Footer statistics summary and pagination control links */}
      <div className="p-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <p className="font-bold text-slate-500">Menampilkan {filteredData.length} dari {data.length} antrean terdaftar</p>
        <div className="flex items-center gap-1">
          <button className="px-3 py-1.5 font-bold text-slate-400 cursor-not-allowed rounded">Sebelumnya</button>
          <button className="px-3 py-1.5 font-bold bg-indigo-600 border border-indigo-600 text-white rounded-lg shadow-md shadow-indigo-500/10 transition-all">1</button>
          <button className="px-3 py-1.5 font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">2</button>
          <button className="px-3 py-1.5 font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Selanjutnya</button>
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
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 z-10"
          >
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <Trash2 className="w-8 h-8 text-rose-500 animate-pulse" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Hapus Berkas Penerima</h3>
                <p className="text-slate-500 text-xs leading-relaxed font-semibold">
                  Tindakan ini tidak dapat dibatalkan. Berkas pendaftaran, status, dan riwayat bantuan untuk mustahik berikut akan terhapus secara permanen dari pangkalan data Si-PANDAI:
                </p>
              </div>

              <div className="bg-rose-50/50 rounded-2xl p-4 border border-rose-100/30 text-left space-y-2.5">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-rose-500">Mustahik / Penerima</span>
                  <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{recipientToDelete.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-rose-200/20 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-medium text-slate-400">No. NIK</span>
                    <p className="font-bold text-slate-700">{recipientToDelete.nik}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-medium text-slate-400">Bidang</span>
                    <p className="font-bold text-slate-700">{recipientToDelete.sector}</p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200/50 rounded-2xl p-3.5 text-left flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <h4 className="text-xs font-black text-amber-800">PERINGATAN SEBELUM MENGHAPUS</h4>
                  <p className="text-[10px] text-amber-700/90 font-medium leading-relaxed">
                    Pastikan Anda telah memeriksa kembali data di atas. Data yang dihapus tidak bisa dikembalikan kembali.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRecipientToDelete(null)}
                className="flex-1 py-2.5 text-xs font-extrabold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-all cursor-pointer active:scale-95"
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
                className="flex-1 py-2.5 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-lg shadow-rose-600/10 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Ya, Hapus Permanen
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

