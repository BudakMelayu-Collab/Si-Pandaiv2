import React, { useState, useRef, useEffect } from 'react';
import { Recipient } from '../types';
import { 
  Plus, ChevronLeft, Calendar, FileText, Camera,
  X, Bell, Search, Paintbrush, DoorOpen, ClipboardList, Bed, Database, AlertCircle, Clock, AlertTriangle, Edit3, Trash2, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { saveRecipient } from '../firebase';
import { SIAK_REGIONAL_DATA } from '../constants';
import RecipientForm from './RecipientForm';
import EditRecipientModal from './EditRecipientModal';

interface RumahSinggahModuleProps {
  recipients: Recipient[];
  onBack: () => void;
  onCheckInCompleted: () => void;
}

const BEDS = [
  { id: '1', room: 'KAMAR 1', area: 'Area Wanita' },
  { id: '2', room: 'KAMAR 2', area: 'Area Pria' },
];

const ROOMS = [
  { name: 'KAMAR 1', area: 'Area Wanita' },
  { name: 'KAMAR 2', area: 'Area Pria' }
];

const getDaysDiff = (dateStr?: string) => {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  const target = new Date(dateStr);
  target.setHours(0,0,0,0);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', {day: 'numeric', month: 'short'});
};

export default function RumahSinggahModule({ recipients, onBack, onCheckInCompleted }: RumahSinggahModuleProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'rooms' | 'database'>('rooms');
  const [showCheckInModal, setShowCheckInModal] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Recipient | null>(null);
  const [extendPatient, setExtendPatient] = useState<Recipient | null>(null);
  const [patientToCheckOut, setPatientToCheckOut] = useState<Recipient | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activePatients = recipients.filter(r => r.programName === 'Rumah Singgah' && r.rsStatus === 'Active');
  const maintenanceBeds = recipients.filter(r => r.programName === 'Rumah Singgah' && r.rsStatus === 'Maintenance');
  const historicalPatients = recipients.filter(r => r.programName === 'Rumah Singgah' && r.rsStatus === 'Discharged');

  const validActivePatients = activePatients.filter(p => BEDS.some(b => b.id === p.rsBedId));
  const validMaintenance = maintenanceBeds.filter(p => BEDS.some(b => b.id === p.rsBedId));
  const emptyCount = Math.max(0, BEDS.length - validActivePatients.length - validMaintenance.length);
  const currentMonth = new Date().toISOString().substring(0, 7);
  const totalPatientsThisMonth = recipients.filter(r => r.programName === 'Rumah Singgah' && r.rsCheckInDate?.startsWith(currentMonth)).length;
  
  const getBedStatus = (bedId: string) => {
    const patient = activePatients.find(p => p.rsBedId === bedId);
    if (patient) return { status: 'occupied', patient };
    const maintenance = maintenanceBeds.find(p => p.rsBedId === bedId);
    if (maintenance) return { status: 'maintenance', patient: maintenance };
    return { status: 'empty', patient: null };
  };

  const handleCheckOut = async (patient: Recipient) => {
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'recipients', patient.id), {
        rsStatus: 'Discharged',
        rsCheckOutDate: new Date().toISOString().split('T')[0],
        updatedAt: serverTimestamp()
      });
      setPatientToCheckOut(null);
      onCheckInCompleted();
    } catch(e) {
      alert('Gagal check-out');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCleanComplete = async (bedId: string, maintenanceDoc: Recipient) => {
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'recipients', maintenanceDoc.id), {
        rsStatus: 'Discharged',
        updatedAt: serverTimestamp()
      });
      onCheckInCompleted();
    } catch(e) {
      alert('Gagal menyelesaikan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlers = {
    onCheckIn: (bedId: string) => setShowCheckInModal(bedId),
    onCheckOut: (patient: Recipient) => setPatientToCheckOut(patient),
    onDetail: (patient: Recipient) => setSelectedPatient(patient),
    onExtend: (patient: Recipient) => setExtendPatient(patient),
    onCleanComplete: handleCleanComplete,
    isSubmitting
  };

  // Derived logic for overview
  const alerts = activePatients.filter(p => {
    if (!p.rsEstimatedCheckOutDate) return false;
    const diff = getDaysDiff(p.rsEstimatedCheckOutDate);
    return diff !== null && diff <= 1; // HARI INI, BESOK, or OVERSTAY
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const activities: any[] = [];
  activePatients.filter(p => p.rsCheckInDate === todayStr).forEach(p => activities.push({time: p.createdAt, text: `Check-in: ${p.name} (${p.rsBedId})`, color: 'bg-emerald-400'}));
  historicalPatients.filter(p => p.rsCheckOutDate === todayStr).forEach(p => activities.push({time: p.updatedAt, text: `Check-out: ${p.name} selesai menginap.`, color: 'bg-rose-400'}));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm hover:bg-slate-50 transition-colors">
            <ChevronLeft className="w-5 h-5 text-slate-700" />
          </button>
          <h1 className="text-2xl font-bold text-slate-800">
            {activeTab === 'overview' ? 'Dashboard Rumah Singgah' : activeTab === 'rooms' ? 'Manajemen Kamar' : 'Data'}
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center text-slate-600 text-sm font-medium gap-2">
            <Calendar className="w-4 h-4" />
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <button className="relative p-2 text-slate-400 hover:text-slate-600">
            <Bell className="w-5 h-5" />
            {alerts.length > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white"></span>}
          </button>
        </div>
      </div>

      {/* View Switcher Controls (Replaces raw tabs design) */}
      <div className="flex bg-white rounded-lg p-1.5 shadow-sm border border-slate-200 inline-flex">
        <button 
          onClick={() => setActiveTab('overview')}
          className={`px-5 py-2 text-sm font-semibold rounded-md transition-all ${activeTab === 'overview' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
        >
          Overview
        </button>
        <button 
          onClick={() => setActiveTab('rooms')}
          className={`px-5 py-2 text-sm font-semibold rounded-md transition-all ${activeTab === 'rooms' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
        >
          Kamar
        </button>
        <button 
          onClick={() => setActiveTab('database')}
          className={`px-5 py-2 text-sm font-semibold rounded-md transition-all ${activeTab === 'database' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
        >
          Data
        </button>
      </div>

      {/* --- OVERVIEW TAB --- */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border-l-4 border-l-emerald-400 border-y border-r border-slate-200 p-6 flex items-center justify-between shadow-sm">
               <div>
                 <p className="text-slate-500 text-sm font-semibold mb-1">Kamar Kosong</p>
                 <h2 className="text-4xl font-bold text-slate-800">{emptyCount}</h2>
               </div>
               <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                 <Bed className="w-7 h-7" />
               </div>
            </div>
            <div className="bg-white rounded-xl border-l-4 border-l-rose-400 border-y border-r border-slate-200 p-6 flex items-center justify-between shadow-sm">
               <div>
                 <p className="text-slate-500 text-sm font-semibold mb-1">Kamar Terisi</p>
                 <h2 className="text-4xl font-bold text-slate-800">{activePatients.length}</h2>
               </div>
               <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
                 <Bed className="w-7 h-7" />
               </div>
            </div>
            <div className="bg-white rounded-xl border-l-4 border-l-blue-400 border-y border-r border-slate-200 p-6 flex items-center justify-between shadow-sm">
               <div>
                 <p className="text-slate-500 text-sm font-semibold mb-1">Total Pasien Per Bulan</p>
                 <h2 className="text-4xl font-bold text-slate-800">{totalPatientsThisMonth}</h2>
               </div>
               <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                 <ClipboardList className="w-7 h-7" />
               </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-rose-500" />
                  <h3 className="font-bold text-slate-800">Perhatian Khusus (Overstay / Jadwal Keluar)</h3>
                </div>
                <div className="divide-y divide-slate-100 p-2">
                  {alerts.map(p => {
                     const diff = getDaysDiff(p.rsEstimatedCheckOutDate);
                     const isOverstay = diff !== null && diff < 0;
                     return (
                       <div key={p.id} className="p-4 bg-white flex items-start gap-4">
                          <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${isOverstay ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                            {isOverstay ? <AlertTriangle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-slate-800 text-sm mb-1">{p.name} (Kamar {p.rsBedId})</h4>
                            <p className="text-slate-600 text-sm">
                              {isOverstay 
                                ? <span className="text-rose-600 font-medium">Telah melewati estimasi pulang ({Math.abs(diff!)} hari overstay).</span> 
                                : `Estimasi pulang adalah ${diff === 0 ? 'HARI INI' : 'BESOK'}.` 
                              } Mohon konfirmasi kepulangan atau perpanjangan.
                            </p>
                            <div className="flex gap-2 mt-3 text-xs">
                              <button onClick={() => setSelectedPatient(p)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-md">Lihat Profil</button>
                              <button onClick={() => setExtendPatient(p)} className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-md">Perpanjang</button>
                            </div>
                          </div>
                       </div>
                     );
                  })}
                  {alerts.length === 0 && (
                    <div className="p-8 text-center text-slate-500">
                      Tidak ada pasien yang mendekati jadwal pulang.
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-indigo-500" />
                  <h3 className="font-bold text-slate-800">Aktivitas Hari Ini</h3>
                </div>
                <div className="p-6 relative">
                  <div className="absolute left-8 top-6 bottom-6 w-0.5 bg-slate-100"></div>
                  <div className="space-y-6 relative">
                    {activities.length > 0 ? activities.map((act, i) => (
                      <div key={i} className="flex gap-4">
                        <div className={`w-4 h-4 shrink-0 rounded-full border-4 border-white shadow-sm z-10 ${act.color}`}></div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{act.text}</p>
                        </div>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-500 ml-8">Belum ada aktivitas hari ini.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ROOMS TAB --- */}
      {activeTab === 'rooms' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 border-b border-slate-100 pb-4">
            <div className="flex border rounded-lg overflow-hidden bg-slate-50">
               <div className="px-4 py-2 border-r bg-white text-sm font-semibold flex items-center gap-2 text-slate-700">
                  <Search className="w-4 h-4 text-slate-400" /> Semua Area
               </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-sm font-semibold">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> Kosong</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-rose-500"></span> Terisi</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-400"></span> Perawatan</div>
            </div>
          </div>

          {ROOMS.map(room => (
            <div key={room.name} className="mb-10 last:mb-0">
              <div className="flex items-center gap-3 mb-6">
                <DoorOpen className="w-6 h-6 text-indigo-600" />
                <h2 className="text-lg font-extrabold text-slate-800 uppercase tracking-widest">{room.name}</h2>
                <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-md text-[11px] font-bold uppercase">{room.area}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {BEDS.filter(b => b.room === room.name).map(bed => {
                    const { status, patient } = getBedStatus(bed.id);
                    let isWarning = false;
                    if (status === 'occupied' && patient!.rsEstimatedCheckOutDate) {
                      const diff = getDaysDiff(patient!.rsEstimatedCheckOutDate);
                      if (diff !== null && diff <= 1) isWarning = true;
                    }
                    return <BedCard key={bed.id} bedId={bed.id} status={status as 'empty' | 'occupied' | 'maintenance'} patient={patient} isWarning={isWarning} handlers={handlers} />
                 })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- DATABASE TAB --- */}
      {activeTab === 'database' && (
        <DatabaseTab historicalPatients={historicalPatients} recipients={recipients} onCheckInCompleted={onCheckInCompleted} />
      )}

      {/* --- MODALS --- */}
      <AnimatePresence>
        {showCheckInModal && (
          <CheckInModal 
            bedId={showCheckInModal} 
            onClose={() => setShowCheckInModal(null)}
            onSuccess={() => {
              setShowCheckInModal(null);
              onCheckInCompleted();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPatient && (
          <PatientDetailModal 
            patient={selectedPatient}
            onClose={() => setSelectedPatient(null)}
            onUpdate={onCheckInCompleted}
            onCheckOut={() => {
               setPatientToCheckOut(selectedPatient);
               setSelectedPatient(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {extendPatient && (
          <ExtendModal 
            patient={extendPatient}
            onClose={() => setExtendPatient(null)}
            onSuccess={() => {
              setExtendPatient(null);
              onCheckInCompleted();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {patientToCheckOut && (
          <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{scale: 0.95}} animate={{scale: 1}} exit={{scale: 0.95}} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-6 text-center">
               <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
                 <AlertTriangle className="w-8 h-8" />
               </div>
               <h3 className="text-xl font-bold text-slate-800 mb-2">Proses Check-out?</h3>
               <p className="text-slate-600 mb-6">
                 Apakah Anda yakin ingin memproses check-out pasien <strong>{patientToCheckOut.name}</strong>? Kamar akan menjadi kosong.
               </p>
               <div className="flex gap-3">
                 <button onClick={() => setPatientToCheckOut(null)} disabled={isSubmitting} className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">
                   Batal
                 </button>
                 <button onClick={() => handleCheckOut(patientToCheckOut)} disabled={isSubmitting} className="flex-1 px-4 py-2 bg-rose-600 text-white font-bold rounded-xl text-sm shadow-sm hover:bg-rose-700 disabled:opacity-50">
                   {isSubmitting ? 'Memproses...' : 'Ya, Check-out'}
                 </button>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- SUB COMPONENTS ---

function BedCard({ bedId, status, patient, isWarning, handlers }: any) {
  if (status === 'empty') {
    return (
      <div onClick={() => handlers.onCheckIn(bedId)} className="relative border-2 border-dashed border-emerald-400 bg-white flex flex-col items-center justify-center py-12 cursor-pointer hover:bg-emerald-50 transition-colors group rounded-2xl min-h-[220px]">
         <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl tracking-wider">
           KOSONG
         </div>
         <div className="text-3xl font-extrabold text-emerald-400 mb-3">{bedId}</div>
         <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-3 group-hover:scale-110 transition-transform">
           <Plus className="w-6 h-6" />
         </div>
         <p className="text-emerald-700 font-bold text-sm">Isi Pasien Baru</p>
      </div>
    );
  }

  if (status === 'maintenance') {
    return (
      <div className="relative border-2 border-amber-300 bg-amber-50/80 flex flex-col items-center justify-center py-8 rounded-2xl min-h-[220px] shadow-sm">
         <div className="absolute top-0 right-0 bg-amber-400 text-amber-900 text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl tracking-wider">
           PERAWATAN
         </div>
         <div className="text-3xl font-extrabold text-amber-400 mb-3">{bedId}</div>
         <div className="w-14 h-14 rounded-full bg-amber-200 flex items-center justify-center text-amber-700 mb-4 shadow-sm">
           <Paintbrush className="w-6 h-6" /> 
         </div>
         <p className="text-amber-800 font-bold text-sm mb-5">Sedang Dibersihkan</p>
         <button onClick={() => handlers.onCleanComplete(bedId, patient)} disabled={handlers.isSubmitting} className="px-5 py-2 bg-white border border-amber-300 text-amber-700 rounded-lg text-sm font-bold hover:bg-amber-100 transition-colors">
           Selesai Bersih
         </button>
      </div>
    );
  }

  // Occupied status
  const checkInDate = formatDate(patient.rsCheckInDate);
  const checkOutDate = patient.rsEstimatedCheckOutDate ? formatDate(patient.rsEstimatedCheckOutDate) : '-';
  const diff = getDaysDiff(patient.rsEstimatedCheckOutDate);
  
  const getRelativeText = () => {
    if (diff === null) return '';
    if (diff === 0) return 'HARI INI';
    if (diff === 1) return 'BESOK';
    if (diff < 0) return 'OVERSTAY';
    return `${diff} HARI LAGI`;
  };

  return (
    <div className={`relative rounded-2xl bg-white flex flex-col justify-between shadow-sm transition-all hover:shadow-md min-h-[220px] ${isWarning ? 'border-2 border-rose-400' : 'border border-rose-200'}`}>
       {isWarning && (
         <div className="bg-rose-400 py-2 px-2 text-center rounded-t-[14px]">
           <p className="text-[10px] font-extrabold text-white uppercase tracking-wider">Perhatian: Estimasi Pulang {getRelativeText()}</p>
         </div>
       )}
       {!isWarning && (
         <div className="absolute top-0 right-0 bg-rose-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl tracking-wider z-10">
           TERISI
         </div>
       )}
       
       <div className={`p-6 flex-1 flex flex-col ${isWarning ? '' : 'pt-6'}`}>
         <div className="flex justify-between items-start mb-4">
           <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isWarning ? 'bg-rose-100 text-rose-500' : 'bg-rose-50 text-rose-400'}`}>
             <Bed className="w-6 h-6" />
           </div>
           <div className={`text-2xl font-extrabold ${isWarning ? 'text-slate-300' : 'text-slate-200'}`}>{bedId}</div>
         </div>
         
         <h3 className="font-extrabold text-slate-800 text-lg leading-tight line-clamp-1" title={patient.name}>{patient.name}</h3>
         <p className="text-xs text-indigo-600 font-bold mt-1 uppercase tracking-wide truncate" title={patient.rsJenisRawatan}>{patient.rsJenisRawatan || 'Rawat Inap'}</p>
         
         <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-[13px]">
           <div className="flex justify-between items-center text-slate-600">
             <span>Pendamping:</span>
             <span className="text-slate-900 font-semibold truncate max-w-[60%] text-right">{patient.rsCompanionName || '-'}</span>
           </div>
           <div className="flex justify-between items-center text-slate-600">
             <span>Diagnosa:</span>
             <span className="text-slate-900 font-semibold truncate max-w-[60%] text-right" title={patient.notes}>{patient.notes || '-'}</span>
           </div>
         </div>

         <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-[13px] font-medium">
           <div className="flex justify-between text-slate-600">
             <span>Masuk:</span>
             <span className="text-slate-900">{checkInDate}</span>
           </div>
           <div className={`flex justify-between ${isWarning ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>
             <span>Keluar:</span>
             <span className={`${isWarning ? 'text-rose-600' : 'text-slate-900'}`}>{diff === 0 ? <span className="font-bold text-rose-600">Hari ini</span> : checkOutDate}</span>
           </div>
         </div>
         
         {isWarning ? (
           <div className="mt-5 grid grid-cols-1 gap-2">
             <button onClick={() => handlers.onCheckOut(patient)} disabled={handlers.isSubmitting} className="w-full py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-sm font-bold transition-colors shadow-sm">Proses Check-out</button>
             <button onClick={() => handlers.onExtend(patient)} className="w-full py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-bold transition-colors">Perpanjang Masa Tinggal</button>
           </div>
         ) : (
           <div className="mt-5 grid grid-cols-2 gap-3">
             <button onClick={() => handlers.onDetail(patient)} className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-bold transition-colors">Detail</button>
             <button onClick={() => handlers.onCheckOut(patient)} disabled={handlers.isSubmitting} className="flex-1 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-sm font-bold transition-colors">Check-out</button>
           </div>
         )}
       </div>
    </div>
  );
}

function DatabaseTab({ historicalPatients, recipients, onCheckInCompleted }: { historicalPatients: Recipient[], recipients: Recipient[], onCheckInCompleted?: () => void }) {
  const [search, setSearch] = useState('');
  const [showInputForm, setShowInputForm] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Recipient | null>(null);
  const [patientToDelete, setPatientToDelete] = useState<Recipient | null>(null);
  const [mergingId, setMergingId] = useState<string | null>(null);
  
  const filtered = historicalPatients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.nik.includes(search));

  const handleDeleteConfirmed = async () => {
    if (!patientToDelete) return;
    try {
      await deleteDoc(doc(db, 'recipients', patientToDelete.id));
      if (onCheckInCompleted) onCheckInCompleted();
    } catch (e: any) {
      alert('Gagal menghapus data: ' + e.message);
    } finally {
      setPatientToDelete(null);
    }
  };

  const handleCreateRecipient = async (data: any) => {
    try {
      if (Array.isArray(data)) {
        for (const item of data) {
          await saveRecipient(item);
        }
      } else {
        await saveRecipient(data);
      }
      setShowInputForm(false);
      alert('Data berhasil disimpan ke sistem (BNBA).');
    } catch (e) {
      alert('Gagal menyimpan data.');
    }
  };

  if (showInputForm) {
    return (
      <div className="bg-slate-50 min-h-screen -m-6 p-6">
        <button 
          onClick={() => setShowInputForm(false)}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-800"
        >
          <ChevronLeft className="w-4 h-4" /> Kembali
        </button>
        <div className="max-w-4xl mx-auto">
          <RecipientForm 
            onSubmit={handleCreateRecipient}
            onCancel={() => setShowInputForm(false)}
            existingRecipients={recipients}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-[600px] flex flex-col">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 gap-4">
         <h3 className="font-bold text-slate-800 hidden md:block">Data Pasien (Rekam Jejak)</h3>
         <div className="flex-1 flex justify-end gap-3 items-center">
           <div className="relative flex-1 md:flex-none md:w-80">
             <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
             <input 
               type="text" 
               placeholder="Cari nama / NIK..." 
               className="pl-10 pr-4 py-2 w-full text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
               value={search}
               onChange={e => setSearch(e.target.value)}
             />
           </div>
           <div className="flex gap-2">
             <button 
               onClick={async () => {
                 let count = 0;
                 for (const p of historicalPatients) {
                   if (!p.rsNoReg) {
                     try {
                       const newReg = 'RS-' + p.id.substring(0, 8).toUpperCase();
                       await updateDoc(doc(db, 'recipients', p.id), { 
                         rsNoReg: newReg,
                         updatedAt: serverTimestamp() 
                       });
                       count++;
                     } catch (err) {}
                   }
                 }
                 if (count > 0) {
                   alert(`Berhasil memberikan No Reg pada ${count} data pasien.`);
                   if (onCheckInCompleted) onCheckInCompleted();
                 } else {
                   alert('Semua data pasien sudah memiliki No Reg.');
                 }
               }}
               className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded-lg text-sm font-bold shadow-sm transition"
             >
               Fix Data No Reg
             </button>
             <button 
               onClick={() => setShowInputForm(true)}
               className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition"
             >
               <Plus className="w-4 h-4" /> Input Data
             </button>
           </div>
         </div>
      </div>
      <div className="flex-1 overflow-auto">
         <AnimatePresence>
           {editingPatient && (
             <EditRecipientModal 
               recipient={editingPatient}
               onClose={() => setEditingPatient(null)}
               onSave={async (data: any) => {
                 try {
                   await updateDoc(doc(db, 'recipients', editingPatient.id), {
                     ...data,
                     updatedAt: serverTimestamp()
                   });
                   setEditingPatient(null);
                   if (onCheckInCompleted) onCheckInCompleted();
                 } catch (e: any) {
                   alert('Gagal update: ' + e.message);
                 }
               }}
             />
           )}
         </AnimatePresence>
          <AnimatePresence>
            {patientToDelete && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setPatientToDelete(null)}
                  className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm cursor-pointer"
                />
                
                <motion.div
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 z-10 font-normal"
                >
                  <div className="p-6 text-center space-y-4 font-normal">
                    <div className="w-16 h-16 bg-slate-50 border border-slate-200 text-black rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                      <Trash2 className="w-8 h-8 text-black" />
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="text-sm font-normal text-black tracking-tight">Hapus Riwayat Pasien</h3>
                      <p className="text-black text-sm leading-relaxed font-normal">
                        Anda yakin ingin menghapus data pasien <span className="font-bold underline decoration-slate-300 underline-offset-4">{patientToDelete.name}</span> secara permanen?
                      </p>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button 
                        onClick={() => setPatientToDelete(null)}
                        className="flex-1 py-2.5 text-sm font-normal text-black bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                      >
                        Batal
                      </button>
                      <button 
                        onClick={handleDeleteConfirmed}
                        className="flex-1 py-2.5 text-sm font-normal text-white bg-rose-600 hover:bg-rose-700 border border-transparent rounded-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Ya, hapus permanen
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
         {filtered.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-center p-8">
             <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
               <Database className="w-10 h-10 text-slate-300" />
             </div>
             <p className="text-slate-500 max-w-md">Tabel database riwayat seluruh pasien yang pernah menginap akan tampil di sini.<br/>Memungkinkan pencarian berdasarkan nama atau NIK.</p>
           </div>
         ) : (
           <table className="w-full text-left text-sm whitespace-nowrap">
             <thead className="bg-white border-b border-slate-200 sticky top-0">
               <tr>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">No Reg</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Jenis Rawatan</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Nama Pasien</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Nama Pendamping</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">NIK</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Diagnosa / Status</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Check-in</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Check-out</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40 text-center">Kamar Terakhir</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Kampung & Kecamatan</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Jenis Kelamin</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">RS Tujuan</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Hubungan</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Nomor / WA</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 text-center border-r border-slate-200/40">Aksi</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 text-center">Lihat Berkas</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
               {filtered.map(p => {
                 const displayNoReg = p.rsNoReg || 'RS-' + p.id.substring(0, 8).toUpperCase();
                 return (
                 <tr key={p.id} className="hover:bg-slate-50">
                     <td className="px-6 py-4 text-slate-800 font-mono text-xs font-semibold">{displayNoReg}</td>
                     <td className="px-6 py-4 text-slate-800">{p.rsJenisRawatan || '-'}</td>
                     <td className="px-6 py-4 font-bold text-slate-800">{p.name}</td>
                     <td className="px-6 py-4 text-slate-800">{p.rsCompanionName || '-'}</td>
                     <td className="px-6 py-4 text-slate-800">{p.nik}</td>
                     <td className="px-6 py-4 truncate max-w-[200px] text-slate-800">{p.notes || '-'}</td>
                     <td className="px-6 py-4 text-slate-800">{formatDate(p.rsCheckInDate)}</td>
                     <td className="px-6 py-4 font-medium text-slate-800">{formatDate(p.rsCheckOutDate)}</td>
                     <td className="px-6 py-4 text-center">
                        <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-bold text-xs">{p.rsBedId}</span>
                     </td>
                     <td className="px-6 py-4 text-slate-800">{p.kampung || '-'} / {p.district || '-'}</td>
                     <td className="px-6 py-4 text-slate-800">{p.gender || '-'}</td>
                     <td className="px-6 py-4 text-slate-800">{p.rsHospital || '-'}</td>
                     <td className="px-6 py-4 text-slate-800">{p.rsCompanionRelation || '-'}</td>
                     <td className="px-6 py-4 text-slate-800">{p.contact || '-'}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setEditingPatient({...p, rsNoReg: displayNoReg})} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setPatientToDelete({...p, rsNoReg: displayNoReg})} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Hapus">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {p.documents && p.documents.length > 0 ? (
                        <button
                          type="button"
                          disabled={mergingId !== null}
                          onClick={async () => {
                            setMergingId(p.id);
                            try {
                              const { mergeRecipientUploadsOnly } = await import('../lib/pdfMerger');
                              await mergeRecipientUploadsOnly(p.id, p.documents);
                            } catch (error: any) {
                              alert(error.message || 'Gagal menggabungkan berkas persyaratan.');
                            } finally {
                              setMergingId(null);
                            }
                          }}
                          className="text-xs font-bold bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer hover:scale-102 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all active:scale-95 duration-150 disabled:opacity-50 mx-auto"
                          title="Gabungkan dan lihat berkas"
                        >
                          {mergingId === p.id ? (
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
         )}
      </div>
    </div>
  )
}

function ExtendModal({ patient, onClose, onSuccess }: any) {
  const [newDate, setNewDate] = useState(patient.rsEstimatedCheckOutDate || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'recipients', patient.id), {
        rsEstimatedCheckOutDate: newDate,
        updatedAt: serverTimestamp()
      });
      onSuccess();
    } catch (e) {
      alert('Gagal update tanggal');
    } finally {
      setIsSubmitting(false);
    }
  }
  
  return (
    <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
        <div className="flex justify-between items-center mb-4">
           <h3 className="text-lg font-bold text-slate-800">Perpanjang Masa Tinggal</h3>
           <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
        </div>
        <p className="text-sm text-slate-500 mb-6">Ubah estimasi tanggal kepulangan untuk <b>{patient.name}</b> yang sebelumnya dijadwalkan pada {formatDate(patient.rsEstimatedCheckOutDate)}.</p>
        <form onSubmit={handleSubmit}>
          <div className="mb-6 space-y-2">
            <label className="text-sm font-semibold text-slate-700">Tanggal Pulang Baru</label>
            <input type="date" required className="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-indigo-500 focus:outline-none" value={newDate} onChange={e => setNewDate(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">Batal</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">Simpan Perubahan</button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function CheckInModal({ bedId, onClose, onSuccess }: any) {
  const [formData, setFormData] = useState({
    name: '', nik: '', district: '', kampung: '', phone: '', checkIn: new Date().toISOString().split('T')[0],
    estCheckOut: '', notes: '', gender: 'Laki-laki', rsHospital: '', rsCompanionName: '', rsCompanionRelation: '',
    rsJenisRawatan: 'Pasien Rawat Inap',
    rsNoReg: 'RS-' + Math.floor(Date.now() / 1000).toString(16).toUpperCase()
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [docIdentitas, setDocIdentitas] = useState<any>(null);
  const [docKK, setDocKK] = useState<any>(null);
  const [docRujukan, setDocRujukan] = useState<any>(null);
  const [docRawatInap, setDocRawatInap] = useState<any>(null);
  const [docSKTM, setDocSKTM] = useState<any>(null);
  const identitasRef = useRef<HTMLInputElement>(null);
  const kkRef = useRef<HTMLInputElement>(null);
  const rujukanRef = useRef<HTMLInputElement>(null);
  const rawatInapRef = useRef<HTMLInputElement>(null);
  const sktmRef = useRef<HTMLInputElement>(null);

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        if (file.type === 'application/pdf' || file.type.includes('spreadsheet')) {
          resolve(event.target?.result as string);
          return;
        }

        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const MAX_DIMENSION = 1000;
          if (width > height) {
            if (width > MAX_DIMENSION) {
              height = Math.round((height * MAX_DIMENSION) / width);
              width = MAX_DIMENSION;
            }
          } else {
            if (height > MAX_DIMENSION) {
              width = Math.round((width * MAX_DIMENSION) / height);
              height = MAX_DIMENSION;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = (e) => reject(e);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'identitas' | 'kk' | 'rujukan' | 'rawatinap' | 'sktm') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const base64 = await convertFileToBase64(file);
      const isPdf = file.type === 'application/pdf';
      const docType = isPdf ? 'pdf' : file.type.includes('spreadsheet') ? 'excel' : 'image';
      const nameMap = { identitas: 'KTP/Identitas', kk: 'Kartu Keluarga', rujukan: 'Surat Rujukan RS', rawatinap: 'Surat Rawat Inap', sktm: 'Surat Keterangan Tidak Mampu' };
      const docObj = { name: nameMap[type], type: docType, url: base64 };
      if (type === 'identitas') setDocIdentitas(docObj);
      else if (type === 'kk') setDocKK(docObj);
      else if (type === 'rujukan') setDocRujukan(docObj);
      else if (type === 'rawatinap') setDocRawatInap(docObj);
      else if (type === 'sktm') setDocSKTM(docObj);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const docs = [];
      if (docIdentitas) docs.push(docIdentitas);
      if (docKK) docs.push(docKK);
      if (docRujukan) docs.push(docRujukan);
      if (docRawatInap) docs.push(docRawatInap);
      if (docSKTM) docs.push(docSKTM);

      const payload = {
        name: formData.name, nik: formData.nik, district: formData.district, kampung: formData.kampung, gender: formData.gender,
        contact: formData.phone, rsCheckInDate: formData.checkIn, rsHospital: formData.rsHospital,
        rsCompanionName: formData.rsCompanionName, rsCompanionRelation: formData.rsCompanionRelation,
        rsJenisRawatan: formData.rsJenisRawatan,
        rsNoReg: formData.rsNoReg,
        rsEstimatedCheckOutDate: formData.estCheckOut, notes: formData.notes,
        rsBedId: bedId, rsStatus: 'Active', programName: 'Rumah Singgah',
        sector: 'Siak Sejahtera', status: 'Diproses', documents: docs,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'recipients'), payload);
      onSuccess();
    } catch (e) {
      alert('Gagal menambah pasien');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetMaintenance = async () => {
    setIsSubmitting(true);
    try {
      const payload = {
        name: 'Sedang Dibersihkan / Rusak', nik: '0'.repeat(16), district: '-',
        rsCheckInDate: new Date().toISOString().split('T')[0], rsBedId: bedId,
        rsStatus: 'Maintenance', programName: 'Rumah Singgah', sector: 'Siak Sejahtera',
        status: 'Diproses', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'recipients'), payload);
      onSuccess();
    } catch (e) {
      alert('Gagal set status');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">Registrasi Check-in</h2>
            <p className="text-sm font-semibold text-slate-500">Alokasi: Kamar <span className="text-indigo-600">{bedId}</span></p>
          </div>
          <button onClick={onClose} className="bg-white p-2 text-slate-400 hover:text-rose-500 rounded-full shadow-sm"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="bg-amber-50 px-6 py-4 border-b border-amber-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <Paintbrush className="w-5 h-5 text-amber-600" />
             <span className="font-semibold text-amber-900 text-sm">Masuk antrean pembersihan?</span>
          </div>
          <button type="button" onClick={handleSetMaintenance} disabled={isSubmitting} className="px-4 py-1.5 bg-white border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors text-xs font-bold shadow-sm">Tandai Perawatan</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">1. Data Pasien</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">No Registrasi *</label>
                <input 
                  required 
                  type="text" 
                  readOnly
                  className="w-full border-2 border-slate-200 rounded-xl p-2.5 bg-slate-100/50 text-slate-500 text-sm font-mono cursor-not-allowed" 
                  value={formData.rsNoReg} 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Jenis Rawatan Rumah Sakit *</label>
                <select 
                  className="w-full border-2 border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none bg-white font-medium"
                  value={formData.rsJenisRawatan}
                  onChange={e => setFormData({...formData, rsJenisRawatan: e.target.value})}
                >
                  <option value="Pasien Rawat Inap">Pasien Rawat Inap</option>
                  <option value="Pasien Rawat Jalan">Pasien Rawat Jalan</option>
                  <option value="Pasien Jadwal Kontrol Rutin">Pasien Jadwal Kontrol Rutin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">NIK KTP *</label>
                <input required type="text" className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm focus:border-indigo-500 focus:outline-none" value={formData.nik} onChange={e => setFormData({...formData, nik: e.target.value.replace(/\D/g, '')})} placeholder="16 Digit NIK" maxLength={16}/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nama Lengkap Pasien *</label>
                <input required type="text" className="w-full border-2 border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Sesuai KTP" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Kampung/Keluruhan *</label>
                  <select 
                    required 
                    className="w-full border-2 border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none bg-white font-medium" 
                    value={formData.kampung} 
                    onChange={e => {
                      const selectedKampung = e.target.value;
                      let detectedDistrict = formData.district;
                      if (!detectedDistrict) {
                        for (const [district, villages] of Object.entries(SIAK_REGIONAL_DATA)) {
                          if (villages.includes(selectedKampung)) {
                            detectedDistrict = district;
                            break;
                          }
                        }
                      }
                      setFormData({...formData, kampung: selectedKampung, district: detectedDistrict});
                    }}
                  >
                    <option value="">Pilih Kampung</option>
                    {Object.entries(SIAK_REGIONAL_DATA).map(([district, villages]) => (
                      <optgroup key={district} label={district}>
                        {villages.map(v => <option key={v} value={v}>{v}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Kecamatan *</label>
                  <select 
                    required 
                    className="w-full border-2 border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none bg-white font-medium" 
                    value={formData.district} 
                    onChange={e => setFormData({...formData, district: e.target.value, kampung: ''})}
                  >
                    <option value="">Pilih Kecamatan</option>
                    {Object.keys(SIAK_REGIONAL_DATA).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Jenis Kelamin *</label>
                  <select required className="w-full border-2 border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none bg-white font-medium" value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}>
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Rumah Sakit Tujuan</label>
                  <select className="w-full border-2 border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none bg-white font-medium" value={formData.rsHospital} onChange={e => setFormData({...formData, rsHospital: e.target.value})}>
                    <option value="">Pilih Rumah Sakit</option>
                    <option value="RSUD Tengku Rafian Siak">RSUD Tengku Rafian Siak</option>
                    <option value="RSUD Arifin Achmad">RSUD Arifin Achmad</option>
                    <option value="RS Awal Bros">RS Awal Bros</option>
                    <option value="RS Eka Hospital">RS Eka Hospital</option>
                    <option value="RS Prima">RS Prima</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Diagnosa Penyakit</label>
                <input type="text" className="w-full border-2 border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Contoh: Tumor Ganas" />
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">2. Data Pendamping</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nama Pendamping</label>
                <input type="text" className="w-full border-2 border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none" value={formData.rsCompanionName} onChange={e => setFormData({...formData, rsCompanionName: e.target.value})} placeholder="Nama pendamping" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Hubungan</label>
                  <input type="text" className="w-full border-2 border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none" value={formData.rsCompanionRelation} onChange={e => setFormData({...formData, rsCompanionRelation: e.target.value})} placeholder="Suami/Istri/Anak dll" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Nomor/WA</label>
                  <input type="text" className="w-full border-2 border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})} placeholder="08..." />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Tgl Masuk *</label>
              <input required type="date" className="w-full border-2 border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none" value={formData.checkIn} onChange={e => setFormData({...formData, checkIn: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Est. Kepulangan (Opsional)</label>
              <input type="date" className="w-full border-2 border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none" value={formData.estCheckOut} onChange={e => setFormData({...formData, estCheckOut: e.target.value})} />
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">3. Arsip Dokumen Digital</h3>
            <div className="grid grid-cols-2 gap-3">
              <div onClick={() => identitasRef.current?.click()} className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors ${docIdentitas ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 text-slate-500'}`}>
                <Camera className={`w-5 h-5 mx-auto mb-1 ${docIdentitas ? 'text-indigo-500' : 'text-slate-400'}`} />
                <span className="text-[11px] font-bold">{docIdentitas ? 'Foto KTP ✓' : 'Foto KTP'}</span>
                <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" ref={identitasRef} onChange={e => handleFileUpload(e, 'identitas')} />
              </div>
              <div onClick={() => kkRef.current?.click()} className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors ${docKK ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 text-slate-500'}`}>
                <Camera className={`w-5 h-5 mx-auto mb-1 ${docKK ? 'text-indigo-500' : 'text-slate-400'}`} />
                <span className="text-[11px] font-bold">{docKK ? 'Foto KK ✓' : 'Foto KK'}</span>
                <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" ref={kkRef} onChange={e => handleFileUpload(e, 'kk')} />
              </div>
              <div onClick={() => rujukanRef.current?.click()} className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors ${docRujukan ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 text-slate-500'}`}>
                <Camera className={`w-5 h-5 mx-auto mb-1 ${docRujukan ? 'text-indigo-500' : 'text-slate-400'}`} />
                <span className="text-[11px] font-bold">{docRujukan ? 'Rujukan ✓' : 'Surat Rujukan'}</span>
                <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" ref={rujukanRef} onChange={e => handleFileUpload(e, 'rujukan')} />
              </div>
              <div onClick={() => rawatInapRef.current?.click()} className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors ${docRawatInap ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 text-slate-500'}`}>
                <Camera className={`w-5 h-5 mx-auto mb-1 ${docRawatInap ? 'text-indigo-500' : 'text-slate-400'}`} />
                <span className="text-[11px] font-bold">{docRawatInap ? 'Rawat Inap ✓' : 'Surat Rawat Inap'}</span>
                <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" ref={rawatInapRef} onChange={e => handleFileUpload(e, 'rawatinap')} />
              </div>
              <div onClick={() => sktmRef.current?.click()} className={`col-span-2 border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors ${docSKTM ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 text-slate-500'}`}>
                <Camera className={`w-5 h-5 mx-auto mb-1 ${docSKTM ? 'text-indigo-500' : 'text-slate-400'}`} />
                <span className="text-[11px] font-bold">{docSKTM ? 'SKTM ✓' : 'SKTM'}</span>
                <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" ref={sktmRef} onChange={e => handleFileUpload(e, 'sktm')} />
              </div>
            </div>
          </div>
          
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="w-1/3 py-3 border-2 border-slate-200 rounded-xl text-slate-700 font-bold hover:bg-slate-50">Batal</button>
            <button type="submit" disabled={isSubmitting || !formData.name || !formData.nik || !formData.kampung || !formData.district} className="w-2/3 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50">Selesaikan Check-in</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function PatientDetailModal({ patient, onClose, onUpdate, onCheckOut }: any) {
  const [newNote, setNewNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setIsSubmitting(true);
    try {
      const updatedNotes = [...(patient.rsMedicalNotes || []), { date: new Date().toISOString(), note: newNote }];
      await updateDoc(doc(db, 'recipients', patient.id), { rsMedicalNotes: updatedNotes, updatedAt: serverTimestamp() });
      patient.rsMedicalNotes = updatedNotes;
      setNewNote('');
      onUpdate();
    } catch (e) {
      alert('Gagal menambah catatan');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-800">{patient.name}</h2>
            <p className="text-sm font-semibold text-slate-500 mt-1">Kamar {patient.rsBedId} • Mulai masuk {formatDate(patient.rsCheckInDate)}</p>
          </div>
          <button onClick={onClose} className="bg-white p-2 text-slate-400 hover:text-rose-500 rounded-full shadow-sm"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Catatan Harian / Medis</h3>
              <div className="bg-slate-50 rounded-xl border border-slate-200">
                <div className="p-4 space-y-4 max-h-[300px] overflow-y-auto">
                  {(patient.rsMedicalNotes || []).map((n: any, i: number) => (
                    <div key={i} className="border-b border-slate-200 last:border-0 pb-3 last:pb-0">
                      <p className="text-[11px] font-bold text-slate-400 mb-1">{new Date(n.date).toLocaleString('id-ID', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}</p>
                      <p className="text-sm text-slate-800 leading-relaxed font-medium">{n.note}</p>
                    </div>
                  ))}
                  {(!patient.rsMedicalNotes || patient.rsMedicalNotes.length === 0) && (
                    <p className="text-sm text-slate-400 italic text-center py-4">Belum ada catatan harian. Tambahkan perkembangan pasien di bawah.</p>
                  )}
                </div>
                <div className="p-3 border-t border-slate-200 bg-white rounded-b-xl flex gap-2">
                  <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') handleAddNote();}} placeholder="Catat keluhan, jadwal dokter..." className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
                  <button onClick={handleAddNote} disabled={isSubmitting || !newNote.trim()} className="bg-indigo-600 text-white px-5 rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-indigo-700">Catat</button>
                </div>
              </div>
            </div>
            
            {(patient.documents && patient.documents.length > 0) && (
               <div>
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Berkas Pendukung</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {patient.documents.map((doc: any, i: number) => (
                      <a href={doc.url} key={i} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors group">
                         {doc.type === 'image' ? (
                           <div className="w-12 h-12 rounded-lg bg-slate-200 overflow-hidden shrink-0">
                             <img src={doc.url} className="w-full h-full object-cover" />
                           </div>
                         ) : (
                           <div className="w-12 h-12 rounded-lg bg-indigo-50 shrink-0 flex items-center justify-center">
                             <FileText className="w-6 h-6 text-indigo-500" />
                           </div>
                         )}
                         <div className="flex-1 truncate">
                           <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">{doc.name}</p>
                           <p className="text-[10px] text-slate-500 font-bold uppercase">{doc.type}</p>
                         </div>
                      </a>
                    ))}
                  </div>
               </div>
            )}
          </div>
          
          <div className="space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm">
              <p className="text-[11px] font-extrabold text-amber-800 uppercase tracking-widest mb-3">Status Kepulangan</p>
              {patient.rsEstimatedCheckOutDate ? (
                <p className="text-sm text-amber-900 font-medium">Est. Keluar:<br/><b className="text-lg">{formatDate(patient.rsEstimatedCheckOutDate)}</b></p>
              ) : (
                <p className="text-sm text-amber-900 font-medium pb-2">Tidak ada estimasi pulang.</p>
              )}
              <button onClick={onCheckOut} className="mt-5 w-full bg-white border-2 border-amber-300 text-amber-700 font-bold py-2.5 rounded-xl hover:bg-amber-100 transition-colors text-sm shadow-sm">
                Proses Check-out
              </button>
            </div>
            
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 text-sm space-y-4 shadow-sm">
              <div><p className="text-xs text-slate-500 font-semibold uppercase mb-0.5">Diagnosa/Penyakit</p><p className="font-bold text-slate-800">{patient.notes || '-'}</p></div>
              <div><p className="text-xs text-slate-500 font-semibold uppercase mb-0.5">NIK KTP</p><p className="text-slate-800">{patient.nik}</p></div>
              <div><p className="text-xs text-slate-500 font-semibold uppercase mb-0.5">Nomor HP / Kontak</p><p className="font-medium text-slate-700">{patient.contact || '-'}</p></div>
              <div><p className="text-xs text-slate-500 font-semibold uppercase mb-0.5">Asal Daerah (Kecamatan)</p><p className="font-bold text-slate-800">{patient.district}</p></div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
