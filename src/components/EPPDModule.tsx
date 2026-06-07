import React, { useState } from 'react';
import { FileText, ClipboardList, PlusCircle, CheckCircle2, History, ChevronRight, LayoutDashboard, BrainCircuit } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Recipient, PPDRecord } from '../types';
import RecipientList from './RecipientList';
import PPDRecap from './PPDRecap';

interface EPPDModuleProps {
  recipients: Recipient[];
  ppdRecords: PPDRecord[];
  onSelectEPPD: (recipient: Recipient, lampiran?: Recipient[]) => void;
  onReceipt: (recipient: Recipient) => void;
  onMPZIS: (recipient: Recipient) => void;
  onSurvey: (recipient: Recipient) => void;
  onDeleteRecord: (id: string) => void;
  onDeleteRecipient?: (recipient: Recipient) => void;
  onEditRecipient?: (recipient: Recipient) => void;
  onEditGroup?: (groupItems: Recipient[]) => void;
  onDuplicateGroup?: (groupItems: Recipient[]) => void;
  onCloseRecap?: () => void;
}

export default function EPPDModule({
  recipients,
  ppdRecords,
  onSelectEPPD,
  onReceipt,
  onMPZIS,
  onSurvey,
  onDeleteRecord,
  onDeleteRecipient,
  onEditRecipient,
  onEditGroup,
  onDuplicateGroup,
  onCloseRecap
}: EPPDModuleProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'create' | 'history'>('dashboard');

  // Calculate some simple metrics
  const totalRecords = ppdRecords.length;
  const currentMonthRecords = ppdRecords.filter(r => {
    // Assuming date format is DD/MM/YYYY or similar parsing
    const parts = r.date.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      const now = new Date();
      return month === now.getMonth() + 1 && year === now.getFullYear();
    }
    return false;
  }).length;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard PPD', icon: LayoutDashboard },
    { id: 'create', label: 'Buat E-PPD', icon: PlusCircle },
    { id: 'history', label: 'Riwayat & Rekapitulasi', icon: History }
  ];

  return (
    <div className="space-y-6">
      {/* Module Header & Tabs */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <FileText className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-black tracking-tight">Manajemen Rekap Pencairan</h2>
              <p className="text-black font-normal text-sm mt-1">Elektronik Permohonan Pengeluaran Dana (E-PPD)</p>
            </div>
          </div>
          
          <div className="flex bg-slate-100/80 p-1.5 rounded-2xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/60'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-500' : ''}`} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <AnimatePresence mode="wait">
        {activeTab === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-3xl p-6 shadow-xl shadow-indigo-500/20 text-white relative overflow-hidden group">
              <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                <FileText className="w-32 h-32" />
              </div>
              <div className="relative z-10">
                <div className="p-3 bg-white/20 rounded-2xl w-fit backdrop-blur-sm mb-4">
                  <span className="font-bold text-sm text-black">Bulan Ini</span>
                </div>
                <h3 className="text-5xl font-black mb-2 text-black">{currentMonthRecords}</h3>
                <p className="text-black font-medium">Dokumen PPD Diterbitkan</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-center">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-slate-100 rounded-2xl text-slate-500 border border-slate-200">
                  <ClipboardList className="w-6 h-6 text-black" />
                </div>
                <div>
                  <p className="text-black text-sm font-medium">Total Dokumen</p>
                  <h3 className="text-3xl font-bold text-black">{totalRecords}</h3>
                </div>
              </div>
              <button 
                onClick={() => setActiveTab('history')}
                className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-black rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-sm border border-slate-200"
              >
                Lihat Semua Riwayat
                <ChevronRight className="w-4 h-4 text-black" />
              </button>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-center">
               <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-amber-50 rounded-2xl text-amber-500 border border-amber-200">
                  <PlusCircle className="w-6 h-6 text-black" />
                </div>
                <div>
                  <p className="text-black text-sm font-medium">Aksi Cepat</p>
                  <h3 className="text-lg font-bold text-black">Buat Baru</h3>
                </div>
              </div>
              <button 
                onClick={() => setActiveTab('create')}
                className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-black rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-sm border border-indigo-200"
              >
                Buat E-PPD Baru
                <ChevronRight className="w-4 h-4 text-black" />
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === 'create' && (
          <motion.div
            key="create"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden"
          >
             <div className="bg-indigo-50/50 p-6 border-b border-indigo-100/50">
              <h3 className="text-lg font-bold text-black mb-1">Pilih Penerima Bantuan</h3>
              <p className="text-black font-normal text-sm">Pilih penerima bantuan dari tabel di bawah ini untuk membuat dokumen E-PPD.</p>
            </div>
            <RecipientList 
              data={recipients} 
              onReceipt={onReceipt}
              onMPZIS={onMPZIS}
              onEPPD={onSelectEPPD}
              onSurvey={onSurvey}
              onDeleteRecipient={onDeleteRecipient}
              onEditRecipient={onEditRecipient}
              onEditGroup={onEditGroup}
              onDuplicateGroup={onDuplicateGroup}
            />
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden"
          >
            <div className="bg-slate-50 p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-black mb-1">Riwayat & Rekapitulasi E-PPD</h3>
              <p className="text-black font-normal text-sm">Seluruh dokumen E-PPD yang telah berhasil diterbitkan.</p>
            </div>
            {/* We render PPDRecap, removing its own internal header and background if necessary, but PPDRecap has its own layout. 
                Let's use it directly or pass properties. PPDRecap might have its own close button we should hide. */}
            <PPDRecap 
              records={ppdRecords}
              onDelete={onDeleteRecord}
              onClose={() => setActiveTab('dashboard')}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
