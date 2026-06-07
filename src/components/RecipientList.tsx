import React, { useState } from 'react';
import { 
  Search, Filter, 
  ExternalLink, Download, FileText, ChevronRight, ChevronDown,
  Edit3, Trash2, FileCheck, ClipboardList, FileStack, Loader2, X, Upload,
  Phone, MapPin, Hash, Archive, Bell, AlertTriangle, AlertCircle, Plus, Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AID_TYPES, AID_STATUSES, STATUS_COLORS } from '../constants';
import { Recipient } from '../types';
import { cn, isRecipientFileTracked } from '../lib/utils';
import { mergeRecipientScans } from '../lib/pdfMerger';
import ActivityTicker from './ActivityTicker';

interface RecipientListProps {
  data: Recipient[];
  onReceipt: (recipient: Recipient) => void;
  onMPZIS: (recipient: Recipient) => void;
  onEPPD: (recipient: Recipient, checkedRecipients?: Recipient[]) => void;
  onInternalMemo?: (recipient: Recipient) => void;
  onSurvey: (recipient: Recipient) => void;
  onDeleteRecipient?: (recipient: Recipient) => void;
  onEditRecipient?: (recipient: Recipient) => void;
  onEditGroup?: (groupItems: Recipient[]) => void;
  onDuplicateGroup?: (groupItems: Recipient[]) => void;
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
  
  // Format local timestamp like DD/MM/YYYY HH:mm (e.g. 28/05/2026 14:30)
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  const hasHighPrecision = !!createdAtStr && (createdAtStr.includes('T') || createdAtStr.includes(':'));
  const timeStr = hasHighPrecision ? `${day}/${month}/${year} ${hours}:${minutes}` : `${day}/${month}/${year}`;
  
  if (!hasHighPrecision) {
    return {
      relative: 'Hari ini',
      timeStr
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

export default function RecipientList({ data, onReceipt, onMPZIS, onEPPD, onInternalMemo, onSurvey, onDeleteRecipient, onEditRecipient, onEditGroup, onDuplicateGroup }: RecipientListProps) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [recipientToDelete, setRecipientToDelete] = useState<Recipient | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string } | null>(null);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [selectedSubItemIds, setSelectedSubItemIds] = useState<Record<string, boolean>>({});
  const [mergingGroupRegId, setMergingGroupRegId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (regId: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [regId]: !prev[regId]
    }));
  };

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handlePreviewFile = async (subItem: Recipient, docItem: any) => {
    if (!docItem.url) return;
    if (docItem.url.startsWith('data:')) {
      setPreviewDoc({ name: docItem.name, url: docItem.url });
      return;
    }

    const key = `${subItem.id}_${docItem.url}`;
    setLoadingFile(key);
    try {
      const { getRecipientFile } = await import('../firebase');
      const base64 = await getRecipientFile(subItem.id, docItem.url);
      if (base64) {
        setPreviewDoc({ name: docItem.name, url: base64 });
      } else {
        alert('Gagal memuat berkas persyaratan. Kemungkinan berkas belum diunggah.');
      }
    } catch (error) {
      console.error(error);
      alert('Terjadi kesalahan saat mengunduh berkas persyaratan.');
    } finally {
      setLoadingFile(null);
    }
  };

  const handleMergeScans = async (recipient: Recipient) => {
    setMergingId(recipient.id);
    try {
      await mergeRecipientScans(recipient.id, recipient.name, recipient.documents);
    } catch (error: any) {
      alert(error.message || 'Gagal menggabungkan berkas scan.');
    } finally {
      setMergingId(null);
    }
  };

  const handleMergeGroupUploads = async (groupItems: Recipient[], regNo: string) => {
    const checkedRecipients = groupItems.filter(sub => !!selectedSubItemIds[sub.id]);
    if (checkedRecipients.length === 0) {
      alert('Pilih setidaknya satu penerima untuk digabungkan berkasnya.');
      return;
    }

    setMergingGroupRegId(regNo);
    try {
      const { mergeMultipleRecipientsUploadsOnly } = await import('../lib/pdfMerger');
      await mergeMultipleRecipientsUploadsOnly(regNo, checkedRecipients);
    } catch (error: any) {
      alert(error.message || 'Gagal menggabungkan semua berkas penerima yang terpilih.');
    } finally {
      setMergingGroupRegId(null);
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
      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)]">
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
                    <div className="bg-slate-100 border-b border-slate-200/80 pl-6 pr-6 py-2.5 flex items-center gap-2 sticky top-0 z-30">
                      <span className={cn(
                        "w-2.5 h-2.5 rounded-full",
                        group.dotColor,
                        group.pulse && "animate-pulse"
                      )} />
                      {group.key === 'Arsip' ? (
                        <ActivityTicker data={data} />
                      ) : (
                        <span className="text-sm font-normal tracking-wider text-black">
                          {group.label}
                        </span>
                      )}
                      <span className="text-sm font-normal text-black bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-lg ml-auto">
                        {group.items.length} Berkas
                      </span>
                    </div>

                    <table className="w-full text-left border-collapse relative">
                      <thead className="bg-slate-50/75 border-b border-slate-200 sticky top-[41px] z-20 backdrop-blur-sm shadow-sm">
                        <tr>
                          <th className="pl-6 pr-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap text-center w-12">No</th>
                          <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">No. Reg</th>
                          <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Tanggal Masuk</th>
                          <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Program</th>
                          <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Jenis Bantuan</th>
                          <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Status</th>
                          <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Sumber Berkas</th>
                          {showInstitutionColumns && (
                            <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Nama Lembaga</th>
                          )}
                          <th className="px-3 py-3.5 text-sm font-normal text-black tracking-wider whitespace-nowrap">Penanggung Jawab (PIC)</th>
                          <th className="pr-6 pl-3 py-3.5 text-sm font-normal text-black tracking-wider text-right sticky right-0 bg-slate-50 whitespace-nowrap lg:p-0 lg:w-0 lg:border-none lg:overflow-hidden lg:opacity-0">
                            <span className="lg:hidden">Progres dan Tindakan Berkas</span>
                          </th>
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

                          return registrationIdsOrder.map((regId, index) => {
                            const groupItems = registrationGroupsMap[regId];
                            const item = groupItems[0];
                            const { relative, timeStr } = getRelativeTimeDetails(item.createdAt, item.submissionDate, currentTime);

                            return (
                              <React.Fragment key={regId}>
                                 <motion.tr 
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.3, ease: 'easeOut' }}
                                  className="hover:bg-slate-50/80 transition-colors group"
                                 >
                                  {/* Nomor */}
                                  <td className="pl-6 pr-3 py-4 text-sm font-normal text-black whitespace-nowrap text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      <button 
                                        onClick={() => toggleRow(regId)}
                                        className="text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                                      >
                                        {expandedRows[regId] ? <ChevronDown className="w-4 h-4 cursor-pointer" /> : <ChevronRight className="w-4 h-4 cursor-pointer" />}
                                      </button>
                                      <span>{index + 1}</span>
                                    </div>
                                  </td>

                                  {/* No. Reg */}
                                  <td className="px-3 py-4 text-sm font-normal text-black whitespace-nowrap">
                                    <span className="font-mono font-normal text-sm text-black">
                                      #{regId}
                                    </span>
                                  </td>

                                  {/* Tanggal */}
                                  <td className="px-3 py-4 text-sm font-normal text-black whitespace-nowrap">
                                    {`${timeStr} (${relative})`}
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

                                  {/* Status */}
                                  <td className="px-3 py-4 text-sm whitespace-nowrap">
                                    <span className={cn(
                                      "text-sm px-2.5 py-1 rounded-full font-normal tracking-tight border shadow-xs !text-black bg-slate-100 border-slate-300"
                                    )}>
                                      {item.status}
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

                                  {/* Progress & Tindakan Berkas Overlay (Desktop) / Column (Mobile) */}
                                  <td className="pr-6 pl-3 py-4 text-right sticky right-0 bg-white group-hover:bg-slate-50 transition-colors border-l border-slate-100 shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.04)] whitespace-nowrap lg:p-0 lg:w-0 lg:border-none lg:align-middle lg:z-10 lg:shadow-none lg:bg-transparent lg:group-hover:bg-transparent">
                                    <div className="flex flex-col items-end justify-center gap-2 lg:absolute lg:inset-y-0 lg:right-0 lg:pr-6 lg:pl-16 lg:bg-gradient-to-l lg:from-slate-50 lg:from-70% lg:to-transparent lg:opacity-0 lg:group-hover:opacity-100 lg:pointer-events-none lg:group-hover:pointer-events-auto transition-all duration-200 lg:min-w-[420px]">
                                      {/* Progress Berkas */}
                                      <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl w-fit drop-shadow-sm lg:bg-slate-50/50 lg:border-slate-100 lg:drop-shadow-none">
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
                                          onClick={() => {
                                            const checked = groupItems.filter(sub => !!selectedSubItemIds[sub.id]);
                                            onEPPD(item, checked.length > 0 ? checked : [item]);
                                          }}
                                          className="py-1 px-2 text-black bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-all text-center flex items-center justify-center gap-1 group shadow-xs cursor-pointer text-sm font-normal tracking-tight"
                                          title="Buka E-PPD"
                                        >
                                          <FileCheck className="w-3 h-3 text-black" />
                                          <span>E-PPD</span>
                                        </button>
                                        
                                        <button 
                                          onClick={() => {
                                            if (onInternalMemo) onInternalMemo(item);
                                          }}
                                          className="py-1 px-2 text-black bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-all text-center flex items-center justify-center gap-1 group shadow-xs cursor-pointer text-sm font-normal tracking-tight"
                                          title="Internal Memo"
                                        >
                                          <FileText className="w-3 h-3 text-black" />
                                          <span>Internal Memo</span>
                                        </button>
                                        
                                        <button 
                                          onClick={() => onSurvey(item)}
                                          className="py-1 px-2 text-black bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-all text-center flex items-center justify-center gap-1 group shadow-xs cursor-pointer text-sm font-normal tracking-tight"
                                          title="Lembar Verifikasi"
                                        >
                                          <ClipboardList className="w-3 h-3 text-black" />
                                          <span>Lembar Verifikasi</span>
                                        </button>

                                        {/* Utility buttons (Merge, Delete) */}
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

                                        {onDuplicateGroup && (
                                          <button 
                                            onClick={() => onDuplicateGroup(groupItems)}
                                            className="p-1 text-black hover:bg-slate-50 rounded-lg border border-slate-200 shadow-xs transition-colors cursor-pointer"
                                            title="Duplikat untuk Bulan Baru"
                                          >
                                            <Copy className="w-3.5 h-3.5 text-black" />
                                          </button>
                                        )}
                                        {onEditGroup && (
                                          <button 
                                            onClick={() => onEditGroup(groupItems)}
                                            className="p-1 text-black hover:bg-slate-50 rounded-lg border border-slate-200 shadow-xs transition-colors cursor-pointer"
                                            title="Edit Formulir"
                                          >
                                            <Edit3 className="w-3.5 h-3.5 text-black" />
                                          </button>
                                        )}
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
                                </motion.tr>

                                {/* Supporting sub-table row for Recipient Details */}
                                {expandedRows[regId] && (
                                <motion.tr
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <td colSpan={showInstitutionColumns ? 9 : 8} className="pl-6 pr-6 pb-4 pt-1 bg-slate-50/40">
                                    <div className="overflow-x-auto border border-slate-200/80 rounded-2xl shadow-xs bg-white">
                                      <div className="px-4.5 py-3 bg-slate-50 border-b border-slate-200/60 flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                          <FileStack className="w-4 h-4 text-indigo-600" />
                                          <h5 className="font-bold text-slate-800 text-sm">Berkas Persyaratan Penerima (No. Reg: #{regId})</h5>
                                          <span className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
                                            {groupItems.filter(sub => !!selectedSubItemIds[sub.id]).length} dari {groupItems.length} Terpilih
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {onEditGroup && (
                                            <button
                                              type="button"
                                              onClick={() => onEditGroup(groupItems)}
                                              className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-1.5 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95 duration-150"
                                              title="Tambah penerima baru ke dalam grup/registrasi ini"
                                            >
                                              <Plus className="w-4 h-4" />
                                              Tambah Penerima Baru
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            disabled={mergingGroupRegId === regId || groupItems.filter(sub => !!selectedSubItemIds[sub.id]).length === 0}
                                            onClick={() => handleMergeGroupUploads(groupItems, regId)}
                                            className="text-xs font-bold bg-indigo-600 hover:bg-indigo-750 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-3.5 py-1.5 rounded-xl inline-flex items-center gap-2 cursor-pointer shadow-xs transition-all active:scale-95 duration-150"
                                            title="Gabungkan semua berkas persyaratan (Slot 1-15) yang dicentang"
                                          >
                                            {mergingGroupRegId === regId ? (
                                              <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                                Menggabungkan Berkas Berkas...
                                              </>
                                            ) : (
                                              <>
                                                <FileStack className="w-4 h-4" />
                                                Gabung Berkas Terpilih (Slot 1-15)
                                              </>
                                            )}
                                          </button>
                                        </div>
                                      </div>
                                      <table className="w-full text-left border-collapse table-auto">
                                        <thead className="bg-slate-50 border-b border-slate-200/60 text-black text-sm tracking-wider font-normal">
                                          <tr>
                                            <th className="px-3.5 py-2.5 text-center text-black w-16 border-r border-slate-200/40 font-normal">
                                              <div className="flex items-center justify-center gap-2">
                                                <input 
                                                  type="checkbox" 
                                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                                                  checked={groupItems.length > 0 && groupItems.every(sub => !!selectedSubItemIds[sub.id])}
                                                  onChange={() => {
                                                    const allChecked = groupItems.every(sub => !!selectedSubItemIds[sub.id]);
                                                    const updated = { ...selectedSubItemIds };
                                                    groupItems.forEach(sub => {
                                                      updated[sub.id] = !allChecked;
                                                    });
                                                    setSelectedSubItemIds(updated);
                                                  }}
                                                />
                                                <span>No</span>
                                              </div>
                                            </th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">Nama</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">NIK</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">Mengajukan Bantuan Untuk</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">Status Berkas</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">No Hp</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">Kecamatan</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">Info Rekening</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">Alamat</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal">Kampung</th>
                                            <th className="px-3.5 py-2.5 text-black border-r border-slate-200/40 whitespace-nowrap font-normal text-center">Aksi</th>
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
                                                <td className="px-3.5 py-3 text-center font-normal text-black border-r border-slate-200/40">
                                                  <div className="flex items-center justify-center gap-2">
                                                    <input 
                                                      type="checkbox" 
                                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                                                      checked={!!selectedSubItemIds[subItem.id]}
                                                      onChange={() => {
                                                        setSelectedSubItemIds(prev => ({
                                                          ...prev,
                                                          [subItem.id]: !prev[subItem.id]
                                                        }));
                                                      }}
                                                    />
                                                    <span>{idx + 1}</span>
                                                  </div>
                                                </td>
                                                <td className="px-3.5 py-3 font-normal text-black capitalize border-r border-slate-200/40 whitespace-nowrap">{subItem.name?.toLowerCase() || ''}</td>
                                                <td className="px-3.5 py-3 text-black font-normal select-all border-r border-slate-200/40 whitespace-nowrap">{subItem.nik}</td>
                                                <td className="px-3.5 py-3 text-black font-normal border-r border-slate-200/40 whitespace-nowrap">{subItem.purpose || '-'}</td>
                                                <td className="px-3.5 py-3 border-r border-slate-200/40 whitespace-nowrap">
                                                  <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-extrabold font-sans inline-block", (subItem.documentStatus || 'Lengkap') === 'Lengkap' ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200")}>
                                                    {subItem.documentStatus || 'Lengkap'}
                                                  </span>
                                                  {(subItem.documentStatus || 'Lengkap') === 'Tidak Lengkap' && subItem.documentStatusNotes && (
                                                    <div className="text-[9px] text-rose-600 font-extrabold max-w-[120px] truncate mt-1 text-left block" title={subItem.documentStatusNotes}>
                                                      Ket: {subItem.documentStatusNotes}
                                                    </div>
                                                  )}
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
                                                <td className="px-3.5 py-3 text-black border-r border-slate-200/40 font-normal whitespace-nowrap">
                                                  {subItem.district || '-'}
                                                </td>
                                                <td className="px-3.5 py-3 font-mono text-sm font-normal text-black border-r border-slate-200/40 whitespace-nowrap">
                                                  {subItem.bankAccountNo ? `${subItem.bankAccountNo}/${subItem.bankName || 'BCA'}/${subItem.bankAccountHolder || subItem.name}` : '-'}
                                                </td>
                                                <td className="px-3.5 py-3 text-black border-r border-slate-200/40 truncate max-w-[220px]" title={subItem.address}>{subItem.address || '-'}</td>
                                                <td className="px-3.5 py-3 text-black border-r border-slate-200/40 font-normal whitespace-nowrap">{subItem.kampung || '-'}</td>
                                                <td className="px-3.5 py-3 border-r border-slate-200/40 whitespace-nowrap text-center">
                                                  <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (onEditRecipient) onEditRecipient(subItem);
                                                      }}
                                                      className="inline-flex items-center justify-center bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 p-1.5 rounded-lg focus:outline-none transition-colors active:scale-95 duration-150"
                                                      title="Edit data penerima"
                                                    >
                                                      <Edit3 className="w-3.5 h-3.5" />
                                                    </button>
                                                    {onDeleteRecipient && (
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setRecipientToDelete(subItem);
                                                        }}
                                                        className="inline-flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 p-1.5 rounded-lg focus:outline-none transition-colors active:scale-95 duration-150"
                                                        title="Hapus data penerima"
                                                      >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                      </button>
                                                    )}
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSurvey(subItem);
                                                      }}
                                                      className="inline-flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 p-1.5 rounded-lg focus:outline-none transition-colors active:scale-95 duration-150"
                                                      title="Lembar Verifikasi"
                                                    >
                                                      <ClipboardList className="w-3.5 h-3.5" />
                                                    </button>
                                                    {subItem.contact && (
                                                      <a
                                                        href={`https://wa.me/${subItem.contact.replace(/\D/g, '')}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center justify-center bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 p-1.5 rounded-lg focus:outline-none transition-colors active:scale-95 duration-150"
                                                        title="Hubungi via WhatsApp"
                                                        onClick={(e) => e.stopPropagation()}
                                                      >
                                                        <Phone className="w-3.5 h-3.5" />
                                                      </a>
                                                    )}
                                                  </div>
                                                </td>
                                                <td className="px-3.5 py-3 font-normal whitespace-nowrap text-center min-w-[160px]">
                                                  {subItem.documents && subItem.documents.length > 0 ? (
                                                    <button
                                                      type="button"
                                                      disabled={mergingId !== null}
                                                      onClick={async () => {
                                                        setMergingId(subItem.id);
                                                        try {
                                                          const { mergeRecipientUploadsOnly } = await import('../lib/pdfMerger');
                                                          await mergeRecipientUploadsOnly(subItem.id, subItem.documents);
                                                        } catch (error: any) {
                                                          alert(error.message || 'Gagal menggabungkan berkas persyaratan.');
                                                        } finally {
                                                          setMergingId(null);
                                                        }
                                                      }}
                                                      className="text-xs font-bold bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer hover:scale-102 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all active:scale-95 duration-150 disabled:opacity-50"
                                                      title="Gabungkan dan lihat 15 slot berkas persyaratan"
                                                    >
                                                      {mergingId === subItem.id ? (
                                                        <>
                                                          <Loader2 className="w-3.5 h-3.5 text-indigo-700 animate-spin" />
                                                          Memroses...
                                                        </>
                                                      ) : (
                                                        <>
                                                          <FileText className="w-3.5 h-3.5" />
                                                          Lihat Berkas
                                                        </>
                                                      )}
                                                    </button>
                                                  ) : (
                                                    <span className="text-slate-400 text-xs font-semibold">-</span>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </motion.tr>
                                )}
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

      {/* PREVIEW DOCUMENT MODAL */}
      {previewDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-55 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200 text-left">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <h4 className="font-bold text-slate-800 text-sm">Pratinjau Berkas: {previewDoc.name}</h4>
              </div>
              <button 
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Modal Body */}
            <div className="p-6 bg-slate-100 flex items-center justify-center min-h-[300px]">
              {previewDoc.url.startsWith('data:image') ? (
                <img 
                  src={previewDoc.url} 
                  referrerPolicy="no-referrer" 
                  className="max-h-[60vh] object-contain rounded-lg shadow-sm border border-slate-200 bg-white" 
                  alt={previewDoc.name} 
                />
              ) : previewDoc.url.startsWith('data:application/pdf') ? (
                <iframe 
                  src={previewDoc.url} 
                  title={previewDoc.name}
                  className="w-full h-[60vh] rounded-lg shadow-sm border border-slate-200 bg-white" 
                />
              ) : (
                <div className="text-center p-8 space-y-4 bg-white rounded-2xl border border-slate-100 shadow-sm max-w-md w-full">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full w-14 h-14 mx-auto flex items-center justify-center">
                    <FileText className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{previewDoc.name}</p>
                    <p className="text-xs text-slate-400 mt-1">Berkas format biner telah siap disimpan.</p>
                  </div>
                  <a 
                    href={previewDoc.url} 
                    download={previewDoc.name}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 rotate-180 animate-pulse" />
                    Unduh Berkas
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

