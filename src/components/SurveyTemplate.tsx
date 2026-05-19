import React, { useState, useEffect, useRef } from 'react';
import { Recipient } from '../types';
import { ChevronRight, Printer, Save, FileText, ImageIcon, AlertCircle, Upload, Settings, Loader2, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { db, updateRecipientSurveyPdf } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { mergeRecipientScans } from '../lib/pdfMerger';

interface SurveyTemplateProps {
  recipient: Recipient;
  onClose: () => void;
}

const Checkbox = ({ label, fontSize }: { label: string, fontSize?: number }) => (
  <div className="flex items-center gap-1.5 py-0.5">
    <div className="w-3 h-3 border border-black flex-shrink-0" />
    <span className="leading-tight flex-1" style={{ fontSize: fontSize ? `${fontSize}pt` : 'inherit' }}>{label}</span>
  </div>
);

export default function SurveyTemplate({ recipient, onClose }: SurveyTemplateProps) {
  const [activeTab, setActiveTab] = useState<'template' | 'scan' | 'config' | 'isi-data'>('template');
  const [isSaving, setIsSaving] = useState(false);
  const [surveyData, setSurveyData] = useState({
    skmp: recipient.skmp || '',
    jumlahKeluarga: '1',
    usahaSuami: '',
    usahaIstri: '',
    usahaLain: '',
    dariOrtu: '',
    dariAnak: '',
    penghasilanLain: '',
    penghasilanLainKet: '',
    kebutuhanDapur: '',
    pendidikan: '',
    kesehatan: '',
    biayaIuran: '',
    transportasi: '',
    pengeluaranLain: '',
    penjelasanKeuangan: '',
    namaPetugas: '',
    namaMustahik: recipient.name || '',
    scanUrls: [] as string[],
  });

  const formatCurrency = (val: string | number) => {
    if (val === undefined || val === null || val === "") return "";
    const clean = String(val).replace(/\D/g, '');
    if (!clean) return "";
    return parseInt(clean).toLocaleString('id-ID');
  };

  const handleCurrencyChange = (key: keyof typeof surveyData, val: string) => {
    const clean = val.replace(/\D/g, '');
    setSurveyData(prev => ({ ...prev, [key]: clean }));
  };
  const [templateConfig, setTemplateConfig] = useState({
    logo: '',
    institution: 'BAZNAS',
    region: 'KABUPATEN SIAK',
    subText: 'Badan Amil Zakat Nasional',
    fontSize: 9,
    logoSize: 48
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadSurveyData = async () => {
      try {
        const surveyDoc = doc(db, 'recipients', recipient.id, 'templates', 'survey');
        const snap = await getDoc(surveyDoc);
        if (snap.exists()) {
          const loadedData = snap.data().data;
          setSurveyData(prev => ({
            ...prev,
            ...loadedData
          }));
        }
      } catch (error) {
        console.error("Error loading survey data:", error);
      }
    };
    loadSurveyData();
  }, [recipient.id]);

  const handleSaveSurvey = async (silent: boolean = false) => {
    try {
      setIsSaving(true);
      
      // 1. Save to subcollection (detailed template data)
      const surveyRef = doc(db, 'recipients', recipient.id, 'templates', 'survey');
      await setDoc(surveyRef, {
        data: surveyData,
        updatedAt: serverTimestamp()
      });

      // 2. Sync back key fields to main recipient document if they changed
      const recipientRef = doc(db, 'recipients', recipient.id);
      await updateDoc(recipientRef, {
        skmp: surveyData.skmp,
        name: surveyData.namaMustahik,
        hasSignedSurveyPdf: surveyData.scanUrls && surveyData.scanUrls.length > 0,
        updatedAt: serverTimestamp()
      });

      // 3. Update scan collection for merging utility
      if (surveyData.scanUrls && surveyData.scanUrls.length > 0) {
        // Use the first scan as the primary survey scan for rekap
        await updateRecipientSurveyPdf(recipient.id, surveyData.scanUrls[0]);
      }

      if (!silent) {
        alert('Data survey berhasil disimpan!');
      }
      if (activeTab === 'isi-data' && !silent) {
        setActiveTab('template');
      }
    } catch (error) {
      console.error("Error saving survey:", error);
      if (!silent) {
        alert('Gagal menyimpan data survey. ' + (error instanceof Error ? error.message : ''));
      }
      throw error; // Re-throw for handleRekapPdf to catch
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    // Listen to real-time updates for global configuration
    const configDoc = doc(db, 'settings', 'survey_template');
    const unsubscribe = onSnapshot(configDoc, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTemplateConfig(prev => ({
          ...prev,
          ...data,
          fontSize: data.fontSize || 9,
          logoSize: data.logoSize || 48
        }));
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const MAX_DIM = 400;
          if (width > height) {
            if (width > MAX_DIM) {
              height *= MAX_DIM / width;
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width *= MAX_DIM / height;
              height = MAX_DIM;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/png');
          setTemplateConfig(prev => ({ ...prev, logo: dataUrl }));
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleScanUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: File) => {
        if (file.type !== 'application/pdf') {
          alert('Hanya diperbolehkan mengupload file format PDF.');
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          
          // Check approximate size for PDF
          const approxSize = dataUrl.length * 0.75;
          if (approxSize > 950000) { 
            alert('File PDF terlalu besar. Maksimal 950KB.');
            return;
          }
          
          setSurveyData(prev => {
            const newScanUrls = [...(prev.scanUrls || []), dataUrl];
            const totalSize = JSON.stringify({ ...prev, scanUrls: newScanUrls }).length * 0.75;
            if (totalSize > 1000000) { 
              alert('Total ukuran data survey melampaui batas Firestore (1MB). Kurangi jumlah berkas scan.');
              return prev;
            }
            return { ...prev, scanUrls: newScanUrls };
          });
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const openPdf = (dataUrl: string) => {
    try {
      if (!dataUrl.startsWith('data:application/pdf')) {
        alert('Format file bukan PDF yang valid.');
        return;
      }
      const base64Content = dataUrl.split(',')[1];
      const byteCharacters = atob(base64Content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      console.error("Error opening PDF:", error);
      alert("Gagal membuka PDF.");
    }
  };

  const removeScan = (index: number) => {
    setSurveyData(prev => ({
      ...prev,
      scanUrls: prev.scanUrls.filter((_, i) => i !== index)
    }));
  };

  const saveConfig = async () => {
    try {
      setIsSaving(true);
      const configDoc = doc(db, 'settings', 'survey_template');
      await setDoc(configDoc, {
        ...templateConfig,
        updatedAt: new Date().toISOString()
      });
      alert('Konfigurasi template berhasil disimpan secara global!');
      setActiveTab('template');
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Gagal menyimpan konfigurasi. Pastikan Anda memiliki izin.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleRekapPdf = async () => {
    try {
      setIsSaving(true);
      // Wait for all saves to finish first to be sure
      await handleSaveSurvey(true);
      await mergeRecipientScans(recipient.id, recipient.name);
    } catch (error) {
      console.error("Error creating Rekap PDF:", error);
      alert(error instanceof Error ? error.message : "Gagal membuat Rekap PDF.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-50 flex flex-col print:bg-white overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: 210mm 330mm;
            margin: 0;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}} />
      {/* Toolbar */}
      <div className="bg-[#0f172a] border-b border-white/10 p-3 flex items-center justify-between print:hidden shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          >
            <ChevronRight className="w-6 h-6 rotate-180" />
          </button>
          
          <div className="flex items-center gap-3 border-l border-white/10 pl-4 h-10">
            <div className="w-9 h-9 bg-emerald-600/20 rounded-xl flex items-center justify-center border border-emerald-500/30">
              <FileText className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm leading-tight">BAZNAS Siak</h3>
              <span className="text-[10px] text-emerald-300/60 uppercase font-bold tracking-wider">Survey Mustahik (P)</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab('template')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
              activeTab === 'template' ? "bg-indigo-600 text-white" : "text-white/40 hover:text-white/60"
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            Template
          </button>
          <button
            onClick={() => setActiveTab('scan')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
              activeTab === 'scan' ? "bg-purple-600 text-white" : "text-white/40 hover:text-white/60"
            )}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            Hasil Scan
          </button>
          <button
            onClick={() => setActiveTab('isi-data')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
              activeTab === 'isi-data' ? "bg-emerald-600 text-white" : "text-white/40 hover:text-white/60"
            )}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Isi Form
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
              activeTab === 'config' ? "bg-amber-600 text-white" : "text-white/40 hover:text-white/60"
            )}
          >
            <Settings className="w-3.5 h-3.5" />
            Config
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 text-slate-300 hover:bg-white/10 rounded-xl text-xs font-bold border border-white/10"
          >
            <Printer className="w-4 h-4" /> Cetak
          </button>
          <button 
            onClick={handleRekapPdf}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl text-xs font-bold border border-emerald-500/20 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Format PDF Rekap
          </button>
          <button 
            onClick={handleSaveSurvey}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-500 shadow-lg disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-10 flex flex-col items-center bg-slate-900 print:bg-white print:p-0">
        {activeTab === 'config' && (
          <div className="w-full max-w-2xl space-y-6">
            <div className="bg-slate-800 border border-white/10 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-amber-500/20 rounded-xl">
                  <Settings className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Konfigurasi Template</h3>
                  <p className="text-slate-400 text-sm">Sesuaikan branding dan logo lembaga Anda</p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Logo Upload Section */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-slate-300">Logo Lembaga</label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative h-40 bg-black/40 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5 transition-all overflow-hidden"
                  >
                    {templateConfig.logo ? (
                      <>
                        <img src={templateConfig.logo} alt="Logo Preview" className="h-full object-contain p-4" />
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Upload className="w-8 h-8 text-white mb-2" />
                          <span className="text-white text-xs font-bold">Ganti Logo</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-500 mb-2 group-hover:text-amber-500 transition-colors" />
                        <span className="text-slate-400 text-sm group-hover:text-amber-400">Klik untuk upload logo</span>
                      </>
                    )}
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleLogoUpload} 
                      className="hidden" 
                      accept="image/*"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nama Lembaga (Utama)</label>
                    <input 
                      type="text" 
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
                      value={templateConfig.institution}
                      onChange={(e) => setTemplateConfig(p => ({ ...p, institution: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Region / Wilayah</label>
                    <input 
                      type="text" 
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
                      value={templateConfig.region}
                      onChange={(e) => setTemplateConfig(p => ({ ...p, region: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Deskripsi Lembaga (Bottom)</label>
                  <input 
                    type="text" 
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
                    value={templateConfig.subText}
                    onChange={(e) => setTemplateConfig(p => ({ ...p, subText: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Logo Size (Height px)</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="range" 
                        min="20" 
                        max="120" 
                        className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        value={templateConfig.logoSize}
                        onChange={(e) => setTemplateConfig(p => ({ ...p, logoSize: Number(e.target.value) }))}
                      />
                      <span className="text-white font-mono text-sm w-12 text-right">{templateConfig.logoSize}px</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Base Font Size (pt)</label>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setTemplateConfig(p => ({ ...p, fontSize: Math.max(6, p.fontSize - 1) }))}
                        className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white"
                      >-</button>
                      <span className="text-white font-mono text-sm w-8 text-center">{templateConfig.fontSize}</span>
                      <button 
                        onClick={() => setTemplateConfig(p => ({ ...p, fontSize: Math.min(14, p.fontSize + 1) }))}
                        className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white"
                      >+</button>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    onClick={saveConfig}
                    disabled={isSaving}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {isSaving ? 'Menyimpan...' : 'Simpan Konfigurasi Secara Global'}
                  </button>
                  <button 
                    onClick={() => setActiveTab('template')}
                    disabled={isSaving}
                    className="px-6 bg-white/5 hover:bg-white/10 text-slate-400 font-bold py-3 rounded-xl transition-all"
                  >
                    Batal
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'scan' && (
          <div className="w-full max-w-5xl space-y-6">
            <div className="bg-slate-800 border border-white/10 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-500/20 rounded-xl">
                    <ImageIcon className="w-6 h-6 text-purple-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Hasil Scan Survey</h3>
                    <p className="text-slate-400 text-sm">Upload dan kelola berkas survey yang telah ditandatangani</p>
                  </div>
                </div>
                
                  <input type="file" multiple accept="application/pdf" className="hidden" id="scan-upload-input" onChange={handleScanUpload} />
                  <button 
                    onClick={() => document.getElementById('scan-upload-input')?.click()}
                    className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-500 shadow-lg transition-all"
                  >
                    <Upload className="w-4 h-4" /> Upload Hasil Scan (PDF)
                  </button>
              </div>

              {surveyData.scanUrls && surveyData.scanUrls.length > 0 ? (
                <div className="grid grid-cols-2 gap-6">
                  {surveyData.scanUrls.map((url, idx) => (
                    <div key={idx} className="relative group rounded-xl overflow-hidden border border-white/10 bg-black/20">
                      <div className="aspect-[3/4] flex flex-col items-center justify-center bg-slate-900 gap-4">
                        <FileText className="w-12 h-12 text-blue-400" />
                        <p className="text-xs font-bold text-slate-300">DOKUMEN PDF</p>
                        <p className="text-[10px] text-slate-500 font-mono">Scan_{idx + 1}.pdf</p>
                      </div>
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <button 
                          onClick={() => openPdf(url)}
                          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-white backdrop-blur-md"
                        >
                          Lihat Dokumen
                        </button>
                        <button 
                          onClick={() => removeScan(idx)}
                          className="px-4 py-2 bg-red-500/20 hover:bg-red-500/40 rounded-lg text-xs font-bold text-red-400 backdrop-blur-md"
                        >
                          Hapus
                        </button>
                      </div>
                      <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[10px] font-black text-white/60">
                        HALAMAN {idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div 
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.accept = 'application/pdf';
                    input.onchange = (e) => handleScanUpload(e as any);
                    input.click();
                  }}
                  className="h-80 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-slate-500"
                >
                  <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-white">Belum ada hasil scan uploaded</p>
                    <p className="text-sm">Klik di sini untuk upload berkas PDF hasil scan survey</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab !== 'config' && activeTab !== 'scan' && (
          <div className="flex flex-col gap-8 items-center pb-20 print:gap-0 print:pb-0">
            {activeTab === 'isi-data' && (
          <div className="w-full max-w-5xl space-y-6 pb-20">
            <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Isi Data Survey Lapangan</h3>
                  <p className="text-emerald-100/70 text-sm">Input data keuangan dan hasil observasi mustahik</p>
                </div>
              </div>

              <div className="p-8 grid grid-cols-2 gap-12">
                {/* SECTION A */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <h4 className="font-bold text-emerald-400 uppercase tracking-wider text-sm flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px]">A</div>
                      Pendapatan Keluarga
                    </h4>
                    <span className="text-[10px] text-slate-500">RUPIAH / BULAN</span>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr_100px_100px] items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/5 group hover:border-emerald-500/30 transition-colors">
                      <span className="text-xs font-bold uppercase text-slate-400 group-hover:text-emerald-400 transition-colors">SKMP & JML Keluarga</span>
                      <input 
                        type="text" 
                        placeholder="SKMP"
                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-center font-sans font-bold text-white focus:border-emerald-500 outline-none w-full" 
                        value={surveyData.skmp} 
                        onChange={e => setSurveyData(prev => ({...prev, skmp: e.target.value}))} 
                      />
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="Jml Jiwa"
                          className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-center font-sans font-bold text-white focus:border-emerald-500 outline-none w-full" 
                          value={surveyData.jumlahKeluarga} 
                          onChange={e => setSurveyData(prev => ({...prev, jumlahKeluarga: e.target.value.replace(/\D/g, '')}))} 
                        />
                        <span className="absolute -top-6 left-0 text-[8px] text-slate-500 whitespace-nowrap">JML JIWA</span>
                      </div>
                    </div>

                    {[
                      { id: 'usahaSuami', label: 'Usaha Pokok Suami' },
                      { id: 'usahaIstri', label: 'Usaha Pokok Istri' },
                      { id: 'usahaLain', label: 'Usaha Lainnya' },
                      { id: 'dariOrtu', label: 'Bantuan Orang Tua' },
                      { id: 'dariAnak', label: 'Bantuan Anak / Menantu' },
                    ].map(item => (
                      <div key={item.id} className="grid grid-cols-[1fr_160px] items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/5 group hover:border-emerald-500/30 transition-colors">
                        <span className="text-xs font-bold uppercase text-slate-400 group-hover:text-emerald-400 transition-colors">{item.label}</span>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 italic">Rp</span>
                          <input 
                            type="text" 
                            placeholder="0"
                            className="bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-right font-sans font-bold text-emerald-400 focus:border-emerald-500 outline-none w-full" 
                            value={formatCurrency(surveyData[item.id as keyof typeof surveyData])} 
                            onChange={e => handleCurrencyChange(item.id as keyof typeof surveyData, e.target.value)} 
                          />
                        </div>
                      </div>
                    ))}

                    <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/5">
                      <span className="text-xs font-bold uppercase text-slate-400">Penghasilan Tambahan Lainnya</span>
                      <div className="grid grid-cols-[1fr_160px] gap-3">
                        <input 
                          type="text" 
                          placeholder="Keterangan sumber pendapatan..."
                          className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500" 
                          value={surveyData.penghasilanLainKet} 
                          onChange={e => setSurveyData(prev => ({...prev, penghasilanLainKet: e.target.value}))} 
                        />
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 italic">Rp</span>
                          <input 
                            type="text" 
                            placeholder="0"
                            className="bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-right font-sans font-bold text-emerald-400 focus:border-emerald-500 outline-none w-full" 
                            value={formatCurrency(surveyData.penghasilanLain)} 
                            onChange={e => handleCurrencyChange('penghasilanLain', e.target.value)} 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION B */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <h4 className="font-bold text-amber-400 uppercase tracking-wider text-sm flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px]">B</div>
                      Pengeluaran Rutin
                    </h4>
                    <span className="text-[10px] text-slate-500">RUPIAH / BULAN</span>
                  </div>

                  <div className="space-y-3">
                    {[
                      { id: 'kebutuhanDapur', label: 'Kebutuhan Dapur (Sembako)' },
                      { id: 'pendidikan', label: 'Biaya Pendidikan' },
                      { id: 'kesehatan', label: 'Biaya Kesehatan' },
                      { id: 'biayaIuran', label: 'Iuran Listrik / Air' },
                      { id: 'transportasi', label: 'Biaya Transportasi' },
                      { id: 'pengeluaranLain', label: 'Sewa Rumah / Lainnya' },
                    ].map(item => (
                      <div key={item.id} className="grid grid-cols-[1fr_160px] items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/5 group hover:border-amber-500/30 transition-colors">
                        <span className="text-xs font-bold uppercase text-slate-400 group-hover:text-amber-400 transition-colors">{item.label}</span>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 italic">Rp</span>
                          <input 
                            type="text" 
                            placeholder="0"
                            className="bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-right font-sans font-bold text-amber-400 focus:border-amber-500 outline-none w-full" 
                            value={formatCurrency(surveyData[item.id as keyof typeof surveyData])} 
                            onChange={e => handleCurrencyChange(item.id as keyof typeof surveyData, e.target.value)} 
                          />
                        </div>
                      </div>
                    ))}

                    <div className="space-y-2 pt-2">
                      <label className="text-xs font-bold uppercase text-slate-400 flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Penjelasan Kondisi Keuangan
                      </label>
                      <textarea 
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 outline-none focus:border-emerald-500 h-[100px] resize-none" 
                        placeholder="Berikan gambaran singkat mengenai kondisi keuangan keluarga..."
                        value={surveyData.penjelasanKeuangan} 
                        onChange={e => setSurveyData(prev => ({...prev, penjelasanKeuangan: e.target.value}))} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-black/50 p-8 border-t border-white/5">
                <div className="grid grid-cols-2 gap-12">
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-300 uppercase tracking-widest text-[10px]">Verifikasi Identitas</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase text-slate-500 font-bold ml-1">Petugas Survey</label>
                        <input 
                          type="text" 
                          placeholder="Nama lengkap petugas"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold outline-none focus:border-emerald-500" 
                          value={surveyData.namaPetugas} 
                          onChange={e => setSurveyData(prev => ({...prev, namaPetugas: e.target.value}))} 
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase text-slate-500 font-bold ml-1">Nama Mustahik</label>
                        <input 
                          type="text" 
                          placeholder="Nama lengkap mustahik"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold outline-none focus:border-emerald-500" 
                          value={surveyData.namaMustahik} 
                          onChange={e => setSurveyData(prev => ({...prev, namaMustahik: e.target.value}))} 
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-end">
                    <button 
                      onClick={handleSaveSurvey} 
                      disabled={isSaving}
                      className="group px-12 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all flex items-center gap-3 active:scale-95 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                      {isSaving ? 'SEDANG MENYIMPAN...' : 'SIMPAN DATA & REVIEW TEMPLATE'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAGE 1: Survey Utama */}
            <div 
              className="bg-white shadow-2xl rounded-sm p-12 print:shadow-none print:p-10 flex flex-col font-sans overflow-hidden shrink-0" 
            style={{ 
              fontSize: `${templateConfig.fontSize}pt`,
              width: '210mm',
              minHeight: '330mm',
              height: '330mm'
            }}
          >
             {/* Document Header */}
             <div className="flex items-stretch border border-black mb-6">
                <div className="w-[180px] p-2 flex flex-col items-center justify-center border-r border-black">
                  {templateConfig.logo ? (
                    <img src={templateConfig.logo} alt="Logo" className="object-contain mb-1" style={{ height: `${templateConfig.logoSize}px` }} />
                  ) : (
                    <div className="flex items-center justify-center font-bold text-emerald-600" style={{ height: `${templateConfig.logoSize}px`, fontSize: '10px' }}>BAZNAS</div>
                  )}
                  <div className="text-center">
                    <p className="font-bold text-gray-800 leading-tight" style={{ fontSize: `${templateConfig.fontSize - 2}pt` }}>{templateConfig.subText}</p>
                    <p className="font-black text-emerald-600 leading-tight" style={{ fontSize: `${templateConfig.fontSize - 1}pt` }}>{templateConfig.region}</p>
                  </div>
                </div>
              <div className="flex-1 flex flex-col items-center justify-center text-center p-2">
                <h1 className="font-bold tracking-wider leading-tight" style={{ fontSize: `${templateConfig.fontSize + 5}pt` }}>SURVEY MUSTAHIK (PERORANGAN)</h1>
                <p className="font-bold" style={{ fontSize: `${templateConfig.fontSize + 2}pt` }}>F-AZN / PDP /</p>
              </div>
              <div className="w-[150px] flex items-center justify-center p-2 border-l border-black">
                <p className="font-bold" style={{ fontSize: `${templateConfig.fontSize + 1}pt` }}>F-AZN / PDP /</p>
              </div>
           </div>

           {/* Personal Info Grid - Expanded with requested fields */}
           <div className="grid grid-cols-2 gap-x-8 mb-6 bg-slate-50/30 p-4 border border-black/5 rounded-sm" style={{ fontSize: `${templateConfig.fontSize}pt` }}>
              <div className="space-y-1.5">
                {[
                  { label: "ID Registrasi", value: recipient.registrationId },
                  { label: "Sumber Berkas", value: recipient.source },
                  { label: "Tgl Masuk Berkas", value: recipient.submissionDate ? new Date(recipient.submissionDate).toLocaleDateString('id-ID') : '-' },
                  { label: "Nama", value: recipient.name, bold: true, upper: true },
                  { label: "NIK", value: recipient.nik },
                  { label: "Alamat", value: `${recipient.address}, ${recipient.kampung}`, italic: true },
                  { label: "Nomor Hp", value: recipient.contact || '-' },
                  { label: "Rekening", value: `${recipient.bankName || '-'} / ${recipient.bankAccountNo || '-'} / ${recipient.bankAccountHolder || '-'}` },
                ].map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[120px_10px_1fr] items-baseline">
                    <span>{item.label}</span>
                    <span>:</span>
                    <span className={cn(
                      "border-b border-dotted border-gray-400 min-h-[18px]",
                      item.bold && "font-bold",
                      item.upper && "uppercase",
                      item.italic && "italic"
                    )}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {[
                  { label: "Bidang", value: recipient.sector },
                  { label: "Sub Bidang", value: recipient.subSector },
                  { label: "Jenis Bantuan", value: recipient.aidType },
                  { label: "Nama Program", value: recipient.programName },
                  { label: "Untuk", value: recipient.purpose },
                  { label: "Nama Sekolah", value: recipient.schoolName || '-' },
                  { label: "No Hp Sekolah", value: recipient.schoolPhone || '-' },
                  { label: "Tingkatan/Kelas", value: `${recipient.schoolLevel || '-'}${recipient.schoolClass ? ` / ${recipient.schoolClass}` : ''}` },
                  { label: "SKMP / Tgl Survey", value: `${surveyData.skmp || recipient.skmp || '-'} / ${recipient.surveyDate ? new Date(recipient.surveyDate).toLocaleDateString('id-ID') : '-'}` },
                ].map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[110px_10px_1fr] items-baseline">
                    <span>{item.label}</span>
                    <span>:</span>
                    <span className="border-b border-dotted border-gray-400 min-h-[18px]">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
           </div>

           {/* Main Survey Matrix */}
           <div className="grid grid-cols-2 border border-black" style={{ fontSize: `${templateConfig.fontSize}pt` }}>
              {/* INDEKS RUMAH */}
              <div className="border-r border-black">
                <div className="bg-gray-200 border-b border-black p-1 font-bold text-center uppercase tracking-wide">INDEKS RUMAH</div>
                
                {/* Rows */}
                <div className="grid grid-cols-[100px_1fr] border-b border-black min-h-[65px]">
                  <div className="p-1.5 border-r border-black flex items-center">Ukuran Rumah (m²/orang)</div>
                  <div className="p-1 px-2 space-y-0.5">
                    <Checkbox label="Sangat Kecil ( < 4 m²)" />
                    <Checkbox label="Kecil (4-6 m²)" />
                    <Checkbox label="Sedang (6-8 m²)" />
                    <Checkbox label="Besar ( >8 m² )" />
                  </div>
                </div>

                <div className="grid grid-cols-[100px_1fr] border-b border-black min-h-[50px]">
                  <div className="p-1.5 border-r border-black flex items-center">Dinding Rumah</div>
                  <div className="p-1 px-2 space-y-0.5">
                    <Checkbox label="Bilik Bambu/Kayu" />
                    <Checkbox label="Semi" />
                    <Checkbox label="Tembok/Beton" />
                  </div>
                </div>

                <div className="grid grid-cols-[100px_1fr] border-b border-black min-h-[55px]">
                  <div className="p-1.5 border-r border-black flex items-center">Lantai</div>
                  <div className="p-1 px-2 space-y-0.5">
                    <Checkbox label="Tanah" />
                    <Checkbox label="Panggung" />
                    <Checkbox label="Semen" />
                    <Checkbox label="Keramik" />
                  </div>
                </div>

                <div className="grid grid-cols-[100px_1fr] border-b border-black min-h-[55px]">
                  <div className="p-1.5 border-r border-black flex items-center">Atap</div>
                  <div className="p-1 px-2 space-y-0.5">
                    <Checkbox label="Kirai/Ijuk" />
                    <Checkbox label="Genteng/Seng" />
                    <div className="h-0.5"></div>
                    <Checkbox label="Asbes/Berglazur" />
                  </div>
                </div>

                <div className="grid grid-cols-[100px_1fr] border-b border-black min-h-[55px]">
                  <div className="p-1.5 border-r border-black flex items-center">Kepemilikan Rumah</div>
                  <div className="p-1 px-2 space-y-0.5">
                    <Checkbox label="Menumpang" />
                    <Checkbox label="Kontrak" />
                    <Checkbox label="Keluarga" />
                    <Checkbox label="Sendiri" />
                  </div>
                </div>

                <div className="grid grid-cols-[100px_1fr] border-b border-black min-h-[55px]">
                  <div className="p-1.5 border-r border-black flex items-center">Dapur</div>
                  <div className="p-1 px-2 space-y-0.5">
                    <Checkbox label="Tungku" />
                    <Checkbox label="Kompor Minyak" />
                    <Checkbox label="Kompor Gas" />
                    <Checkbox label="Kompor Listrik" />
                  </div>
                </div>

                <div className="grid grid-cols-[100px_1fr] min-h-[60px]">
                  <div className="p-1.5 border-r border-black flex items-center">Kursi</div>
                  <div className="p-1 px-2 space-y-0.5">
                    <Checkbox label="Lesehan" />
                    <Checkbox label="Balai Bambu" />
                    <Checkbox label="Kayu" />
                    <Checkbox label="Sofa" />
                  </div>
                </div>
              </div>

              {/* KEPEMILIKAN HARTA */}
              <div>
                <div className="bg-gray-200 border-b border-black p-1 font-bold text-center uppercase tracking-wide">KEPEMILIKAN HARTA</div>
                
                <div className="grid grid-cols-[100px_1fr] border-b border-black min-h-[65px]">
                  <div className="p-1.5 border-r border-black flex items-center">Kebun / Sawah</div>
                  <div className="p-1 px-2 space-y-0.5">
                    <Checkbox label="Tidak Ada" />
                    <Checkbox label="< 1000 m²" />
                    <Checkbox label="1000 - 5000 m²" />
                    <Checkbox label="> 5000 m²" />
                  </div>
                </div>

                <div className="grid grid-cols-[100px_1fr] border-b border-black min-h-[75px]">
                  <div className="p-1.5 border-r border-black flex items-center">Elektronik</div>
                  <div className="p-1 px-2 space-y-0.5">
                    <div className="grid grid-cols-2 gap-x-2">
                      <Checkbox label="Radio" />
                      <Checkbox label="Tape" />
                    </div>
                    <Checkbox label="Televisi" />
                    <Checkbox label="CD. Player" />
                    <Checkbox label="Handphone" />
                  </div>
                </div>

                <div className="grid grid-cols-[100px_1fr] border-b border-black min-h-[65px]">
                  <div className="p-1.5 border-r border-black flex items-center">Kendaraan</div>
                  <div className="p-1 px-2 space-y-0.5">
                    <Checkbox label="Tidak Ada" />
                    <Checkbox label="Sepeda Kayuh" />
                    <Checkbox label="Sepeda Motor" />
                    <Checkbox label="Mobil" />
                  </div>
                </div>

                <div className="grid grid-cols-[100px_1fr] border-b border-black min-h-[85px]">
                  <div className="p-1.5 border-r border-black flex items-center">Ternak</div>
                  <div className="p-1 px-2 space-y-1">
                    <div className="flex justify-between border-b border-dotted border-gray-300 pb-0.5">
                       <span>Unggas :</span> <span className="font-bold">0 ekor</span>
                    </div>
                    <div className="flex justify-between border-b border-dotted border-gray-300 pb-0.5">
                       <span>Domba :</span> <span className="font-bold">0 ekor</span>
                    </div>
                    <div className="flex justify-between border-b border-dotted border-gray-300 pb-0.5">
                       <span>Kambing :</span> <span className="font-bold">0 ekor</span>
                    </div>
                    <div className="flex justify-between border-b border-dotted border-gray-300 pb-0.5">
                       <span>Sapi :</span> <span className="font-bold">0 ekor</span>
                    </div>
                    <div className="flex justify-between">
                       <span>Kerbau :</span> <span className="font-bold">0 ekor</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-[100px_1fr] border-b border-black min-h-[65px]">
                  <div className="p-1.5 border-r border-black flex items-center">Aset</div>
                  <div className="p-1 px-2 space-y-0.5">
                    <Checkbox label="Tidak Ada" />
                    <Checkbox label="Emas ( 0 )" />
                    <Checkbox label="Bank ( 0 )" />
                    <Checkbox label="Tabungan" />
                  </div>
                </div>

                <div className="grid grid-cols-[100px_1fr] border-b border-black min-h-[25px]">
                  <div className="p-1.5 border-r border-black flex items-center font-bold">Kepemilikan Lainnya</div>
                  <div className="p-1"></div>
                </div>

                <div className="grid grid-cols-[100px_1fr] min-h-[40px]">
                  <div className="p-1.5 border-r border-black flex items-start font-bold">Keterangan Lainnya :</div>
                  <div className="p-1"></div>
                </div>
              </div>
           </div>



           <div className="mt-auto pt-4 flex justify-between items-end border-t border-gray-100 italic">
              <div className="text-[8px] text-gray-400 font-mono italic underline">F-AZN / PDP / 2024</div>
              <div className="text-[10px] font-bold tracking-tight">Halaman 1 dari 4</div>
           </div>
          </div>

            {/* PAGE 2: Keuangan & Bidang Usaha */}
            <div 
              className="bg-white shadow-2xl rounded-sm p-12 print:shadow-none print:p-10 flex flex-col font-sans overflow-hidden shrink-0" 
              style={{ 
                fontSize: `${templateConfig.fontSize}pt`,
                width: '210mm',
                minHeight: '330mm',
                height: '330mm'
              }}
            >
               <div className="mb-6">
                 <h3 className="font-bold underline mb-4 uppercase" style={{ fontSize: `${templateConfig.fontSize + 2}pt` }}>Keuangan Keluarga</h3>
                 
                 {/* Table Pendapatan */}
                 <div className="mb-4">
                   <table className="w-full border-collapse border border-black" style={{ fontSize: `${templateConfig.fontSize}pt` }}>
                     <thead>
                       <tr className="bg-gray-50 uppercase font-bold text-center">
                         <th className="border border-black p-2 w-[10%]">No</th>
                         <th className="border border-black p-2 w-[60%] text-left">Pendapatan Keluarga (A), bersumber dari</th>
                         <th className="border border-black p-2 w-[30%] text-center">Jumlah (Rp/bulan)</th>
                       </tr>
                     </thead>
                     <tbody>
                       <tr className="h-7 text-center">
                         <td className="border border-black">1</td>
                         <td className="border border-black px-2 text-left">Usaha Pokok Suami :</td>
                         <td className="border border-black font-bold">{formatCurrency(surveyData.usahaSuami)}</td>
                       </tr>
                       <tr className="h-7 text-center">
                         <td className="border border-black">2</td>
                         <td className="border border-black px-2 text-left">Usaha Pokok Istri :</td>
                         <td className="border border-black font-bold">{formatCurrency(surveyData.usahaIstri)}</td>
                       </tr>
                       <tr className="h-7 text-center">
                         <td className="border border-black">3</td>
                         <td className="border border-black px-2 text-left">Usaha Lainnya :</td>
                         <td className="border border-black font-bold">{formatCurrency(surveyData.usahaLain)}</td>
                       </tr>
                       <tr className="h-7 text-center">
                         <td className="border border-black">4</td>
                         <td className="border border-black px-2 text-left">Dari orang tua :</td>
                         <td className="border border-black font-bold">{formatCurrency(surveyData.dariOrtu)}</td>
                       </tr>
                       <tr className="h-7 text-center">
                         <td className="border border-black">5</td>
                         <td className="border border-black px-2 text-left">Dari anak/menantu :</td>
                         <td className="border border-black font-bold">{formatCurrency(surveyData.dariAnak)}</td>
                       </tr>
                       <tr className="h-7 text-center">
                         <td className="border border-black">6</td>
                         <td className="border border-black px-2 text-left">Penghasilan lainnya, sebutkan : {surveyData.penghasilanLainKet || '..................................'}</td>
                         <td className="border border-black font-bold">{formatCurrency(surveyData.penghasilanLain)}</td>
                       </tr>
                       <tr className="h-8 bg-gray-50 font-bold uppercase">
                         <td colSpan={2} className="border border-black px-2 text-right">TOTAL PENDAPATAN (A)</td>
                         <td className="border border-black font-bold">
                           {(() => {
                             const total = [surveyData.usahaSuami, surveyData.usahaIstri, surveyData.usahaLain, surveyData.dariOrtu, surveyData.dariAnak, surveyData.penghasilanLain]
                               .reduce((acc, curr) => acc + (parseInt(curr) || 0), 0);
                             return total > 0 ? total.toLocaleString('id-ID') : '';
                           })()}
                         </td>
                       </tr>
                     </tbody>
                   </table>
                 </div>

                 {/* Table Pengeluaran */}
                 <div className="mb-4">
                   <table className="w-full border-collapse border border-black" style={{ fontSize: `${templateConfig.fontSize}pt` }}>
                     <thead>
                       <tr className="bg-gray-50 uppercase font-bold text-center">
                         <th className="border border-black p-2 w-[10%]">No</th>
                         <th className="border border-black p-2 w-[60%] text-left">Pengeluaran Rutin (B), dialokasikan untuk</th>
                         <th className="border border-black p-2 w-[30%] text-center">Jumlah (Rp/bulan)</th>
                       </tr>
                     </thead>
                     <tbody>
                       <tr className="h-7 text-center">
                         <td className="border border-black">1</td>
                         <td className="border border-black px-2 text-left">Kebutuhan Dapur (Sembako, dll) :</td>
                         <td className="border border-black font-bold">{formatCurrency(surveyData.kebutuhanDapur)}</td>
                       </tr>
                       <tr className="h-7 text-center">
                         <td className="border border-black">2</td>
                         <td className="border border-black px-2 text-left">Pendidikan (SPP, Kursus, dll) :</td>
                         <td className="border border-black font-bold">{formatCurrency(surveyData.pendidikan)}</td>
                       </tr>
                       <tr className="h-7 text-center">
                         <td className="border border-black">3</td>
                         <td className="border border-black px-2 text-left">Kesehatan (Obat, Kontrol, BPJS, dll) :</td>
                         <td className="border border-black font-bold">{formatCurrency(surveyData.kesehatan)}</td>
                       </tr>
                       <tr className="h-7 text-center">
                         <td className="border border-black">4</td>
                         <td className="border border-black px-2 text-left font-bold">Biaya iuran rutin (Listrik, Air, Kebersihan-Siskamling) :</td>
                         <td className="border border-black font-bold">{formatCurrency(surveyData.biayaIuran)}</td>
                       </tr>
                       <tr className="h-7 text-center">
                         <td className="border border-black">5</td>
                         <td className="border border-black px-2 text-left">Transportasi (BBM, Ongkos, Maintenance) :</td>
                         <td className="border border-black font-bold">{formatCurrency(surveyData.transportasi)}</td>
                       </tr>
                       <tr className="h-7 text-center">
                         <td className="border border-black">6</td>
                         <td className="border border-black px-2 text-left">Pengeluaran lainnya : Sewa Rumah / ............................</td>
                         <td className="border border-black font-bold">{formatCurrency(surveyData.pengeluaranLain)}</td>
                       </tr>
                       <tr className="h-8 bg-gray-50 font-bold uppercase">
                         <td colSpan={2} className="border border-black px-2 text-right">TOTAL PENGELUARAN (B)</td>
                         <td className="border border-black font-bold">
                           {(() => {
                             const total = [surveyData.kebutuhanDapur, surveyData.pendidikan, surveyData.kesehatan, surveyData.biayaIuran, surveyData.transportasi, surveyData.pengeluaranLain]
                               .reduce((acc, curr) => acc + (parseInt(curr) || 0), 0);
                             return total > 0 ? total.toLocaleString('id-ID') : '';
                           })()}
                         </td>
                       </tr>
                     </tbody>
                   </table>
                 </div>

                 <div className="mt-4 space-y-3 border border-black p-4 font-bold">
                    <div className="grid grid-cols-[300px_1fr]">
                      <span>SISA PENDAPATAN PER BULAN (A-B)</span>
                      <span className="font-bold">
                        {(() => {
                          const totalA = [surveyData.usahaSuami, surveyData.usahaIstri, surveyData.usahaLain, surveyData.dariOrtu, surveyData.dariAnak, surveyData.penghasilanLain]
                            .reduce((acc, curr) => acc + (parseInt(curr) || 0), 0);
                          const totalB = [surveyData.kebutuhanDapur, surveyData.pendidikan, surveyData.kesehatan, surveyData.biayaIuran, surveyData.transportasi, surveyData.pengeluaranLain]
                            .reduce((acc, curr) => acc + (parseInt(curr) || 0), 0);
                          const sisa = totalA - totalB;
                          return sisa !== 0 || totalA > 0 ? `= ( ${totalA.toLocaleString('id-ID')} ) - ( ${totalB.toLocaleString('id-ID')} ) = ( ${sisa.toLocaleString('id-ID')} )` : '= ( - ) - ( - ) = ( - )';
                        })()}
                      </span>
                    </div>
                    <div className="grid grid-cols-[300px_1fr]">
                      <span>Jumlah Pendapatan (Total A) / Anggota Keluarga</span>
                      <span className="font-bold">
                        {(() => {
                          const totalA = [surveyData.usahaSuami, surveyData.usahaIstri, surveyData.usahaLain, surveyData.dariOrtu, surveyData.dariAnak, surveyData.penghasilanLain]
                            .reduce((acc, curr) => acc + (parseInt(curr) || 0), 0);
                          const divisor = parseInt(surveyData.jumlahKeluarga) || 1;
                          const perJiwa = Math.round(totalA / divisor);
                          return totalA > 0 ? `= ( ${totalA.toLocaleString('id-ID')} ) / ( ${divisor} ) = ( ${perJiwa.toLocaleString('id-ID')} )` : '= ( - ) / ( - ) = ( - )';
                        })()}
                      </span>
                    </div>
                 </div>

                 <div className="mt-4 border border-black p-2 min-h-[140px]">
                    <p className="font-bold mb-2 uppercase underline text-[10px]">Penjelasan Keuangan :</p>
                    <div className={cn(
                      "text-[10px] break-words whitespace-pre-wrap",
                      !surveyData.penjelasanKeuangan && "italic text-gray-400"
                    )}>
                      {surveyData.penjelasanKeuangan || 'Tuliskan keterangan tambahan mengenai kondisi keuangan keluarga jika ada...'}
                    </div>
                 </div>
                 <div className="mt-4 border border-black p-3 flex-1">
                    <p className="font-bold mb-2 uppercase underline text-[10px]">Catatan Survey Tambahan :</p>
                    <div className="h-full italic text-gray-200">.................................................................................................................................................</div>
                 </div>
               </div>
               
               <div className="mt-auto pt-4 flex justify-between items-end border-t border-gray-100 italic">
                  <div className="text-[8px] text-gray-400">F-AZN/PD-BAZ/02</div>
                  <div className="text-[10px] font-bold">Halaman 2 dari 4</div>
               </div>
            </div>

            <div 
              className="bg-white shadow-2xl rounded-sm p-12 print:shadow-none print:p-10 flex flex-col font-sans overflow-hidden shrink-0" 
              style={{ 
                fontSize: `${templateConfig.fontSize}pt`,
                width: '210mm',
                minHeight: '330mm',
                height: '330mm'
              }}
            >
               <h3 className="font-bold underline mb-4 uppercase" style={{ fontSize: `${templateConfig.fontSize + 2}pt` }}>Profil Bidang Usaha Mustahik</h3>
               <div className="border border-black overflow-hidden bg-slate-50 print:bg-white mb-6">
                    <div className="grid grid-cols-[40px_1fr_2.5fr] border-b border-black min-h-[60px]">
                      <div className="p-2 border-r border-black font-bold flex items-center justify-center">1</div>
                      <div className="p-2 border-r border-black flex items-center" style={{ fontSize: `${templateConfig.fontSize}pt` }}>Usaha Mustahik</div>
                      <div className="p-2 grid grid-cols-2 gap-x-2">
                        <Checkbox label="a. Kuliner" fontSize={templateConfig.fontSize} />
                        <Checkbox label="b. Jasa" fontSize={templateConfig.fontSize} />
                        <Checkbox label="c. Pertanian/Peternakan" fontSize={templateConfig.fontSize} />
                        <Checkbox label="d. Ekonomi Kreatif" fontSize={templateConfig.fontSize} />
                        <Checkbox label="e. Perdagangan" fontSize={templateConfig.fontSize} />
                        <Checkbox label="f. Industri & Perdagangan" fontSize={templateConfig.fontSize} />
                        <Checkbox label="g. Perdagangan Eceran" fontSize={templateConfig.fontSize} />
                        <Checkbox label="h. Kehutanan" fontSize={templateConfig.fontSize} />
                      </div>
                    </div>

                    <div className="grid grid-cols-[40px_1fr_2.5fr] border-b border-black min-h-[40px]">
                      <div className="p-2 border-r border-black font-bold flex items-center justify-center">2</div>
                      <div className="p-2 border-r border-black flex items-center" style={{ fontSize: `${templateConfig.fontSize}pt` }}>Lama Usaha</div>
                      <div className="p-2 grid grid-cols-4 gap-2">
                        <Checkbox label="< 1 Thn" fontSize={templateConfig.fontSize} />
                        <Checkbox label="1-2 Thn" fontSize={templateConfig.fontSize} />
                        <Checkbox label="3-4 Thn" fontSize={templateConfig.fontSize} />
                        <Checkbox label="> 5 Thn" fontSize={templateConfig.fontSize} />
                      </div>
                    </div>

                    <div className="grid grid-cols-[40px_1fr_2.5fr] border-b border-black">
                      <div className="p-2 border-r border-black font-bold flex items-center justify-center">3</div>
                      <div className="flex flex-col border-r border-black" style={{ fontSize: `${templateConfig.fontSize}pt` }}>
                        <div className="p-1 px-2 border-b border-black min-h-[30px] flex items-center">3.1. Sumber Modal</div>
                        <div className="p-1 px-2 border-b border-black min-h-[30px] flex items-center">3.2. Jumlah Pekerja</div>
                        <div className="p-1 px-2 min-h-[30px] flex items-center">3.3. Status Usaha</div>
                      </div>
                      <div className="flex flex-col">
                        <div className="p-1 px-2 border-b border-black min-h-[30px] grid grid-cols-2">
                          <Checkbox label="Sendiri" fontSize={templateConfig.fontSize} />
                          <Checkbox label="Sdr & Pinjam" fontSize={templateConfig.fontSize} />
                        </div>
                        <div className="p-1 px-2 border-b border-black min-h-[30px] grid grid-cols-3">
                          <Checkbox label="2 Org" fontSize={templateConfig.fontSize} />
                          <Checkbox label="5-10" fontSize={templateConfig.fontSize} />
                          <Checkbox label="> 10" fontSize={templateConfig.fontSize} />
                        </div>
                        <div className="p-1 px-2 min-h-[30px] grid grid-cols-3">
                          <Checkbox label="Untung" fontSize={templateConfig.fontSize} />
                          <Checkbox label="Impas" fontSize={templateConfig.fontSize} />
                          <Checkbox label="G. Tikar" fontSize={templateConfig.fontSize} />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-[40px_1fr_2.5fr]">
                      <div className="p-2 border-r border-black font-bold flex items-center justify-center">4</div>
                      <div className="flex flex-col border-r border-black" style={{ fontSize: `${templateConfig.fontSize}pt` }}>
                        <div className="p-1 px-2 border-b border-black min-h-[30px] flex items-center">4.1. Keberlanjutan</div>
                        <div className="p-1 px-2 border-b border-black min-h-[30px] flex items-center">4.2. Aspek Legal</div>
                        <div className="p-1 px-2 min-h-[30px] flex items-center">4.3. Akses Tekno</div>
                      </div>
                      <div className="flex flex-col">
                        <div className="p-1 px-2 border-b border-black min-h-[30px] grid grid-cols-2">
                          <Checkbox label="Berlanjut" fontSize={templateConfig.fontSize} />
                          <Checkbox label="Tidak" fontSize={templateConfig.fontSize} />
                        </div>
                        <div className="p-1 px-2 border-b border-black min-h-[30px] grid grid-cols-2">
                          <Checkbox label="Ada" fontSize={templateConfig.fontSize} />
                          <Checkbox label="Tidak Ada" fontSize={templateConfig.fontSize} />
                        </div>
                        <div className="p-1 px-2 min-h-[30px] grid grid-cols-2">
                          <Checkbox label="Ada" fontSize={templateConfig.fontSize} />
                          <Checkbox label="Tidak Ada" fontSize={templateConfig.fontSize} />
                        </div>
                      </div>
                    </div>
                 </div>

               <h3 className="font-bold underline mb-4 uppercase text-center" style={{ fontSize: `${templateConfig.fontSize + 2}pt` }}>REKAPITULASI KELAYAKAN & PENGESAHAN</h3>
               
               <div className="mb-4">
                  <table className="w-full border-collapse border border-black" style={{ fontSize: `${templateConfig.fontSize}pt` }}>

                    <thead className="bg-gray-50 uppercase font-bold text-center">
                      <tr>
                        <th className="border border-black p-2 w-[22%]">Parameter</th>
                        <th className="border border-black p-2 w-[23%]">Kelayakan</th>
                        <th className="border border-black p-2 w-[55%]">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="h-12 text-center" style={{ fontSize: `${templateConfig.fontSize}pt` }}>
                        <td className="border border-black px-2 text-left uppercase">Indeks Rumah</td>
                        <td className="border border-black px-4">
                           <div className="flex gap-4 justify-center">
                              <Checkbox label="Layak" fontSize={templateConfig.fontSize} />
                              <Checkbox label="Tidak Layak" fontSize={templateConfig.fontSize} />
                           </div>
                        </td>
                        <td className="border border-black"></td>
                      </tr>
                      <tr className="h-12 text-center" style={{ fontSize: `${templateConfig.fontSize}pt` }}>
                        <td className="border border-black px-2 text-left uppercase">Kepemilikan Harta</td>
                        <td className="border border-black px-4">
                           <div className="flex gap-4 justify-center">
                              <Checkbox label="Layak" fontSize={templateConfig.fontSize} />
                              <Checkbox label="Tidak Layak" fontSize={templateConfig.fontSize} />
                           </div>
                        </td>
                        <td className="border border-black"></td>
                      </tr>
                      <tr className="h-12 text-center" style={{ fontSize: `${templateConfig.fontSize}pt` }}>
                        <td className="border border-black px-2 text-left uppercase">Pendapatan Keluarga</td>
                        <td className="border border-black px-4">
                           <div className="flex gap-4 justify-center">
                              <Checkbox label="Layak" fontSize={templateConfig.fontSize} />
                              <Checkbox label="Tidak Layak" fontSize={templateConfig.fontSize} />
                           </div>
                        </td>
                        <td className="border border-black"></td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-4 border border-black p-3 min-h-[80px]">
                    <p className="font-bold uppercase underline mb-1" style={{ fontSize: `${templateConfig.fontSize + 1}pt` }}>Keterangan Lain :</p>
                    <p className="italic text-gray-400" style={{ fontSize: `${templateConfig.fontSize}pt` }}>Hal menarik yang berhubungan dengan program atau layak untuk dipublikasikan...</p>
                  </div>
               </div>

               <div className="grid grid-cols-2 border border-black mb-8 overflow-hidden">
                  <div className="border-r border-black flex flex-col">
                    <div className="bg-gray-100 p-2 font-bold uppercase text-center border-b border-black" style={{ fontSize: `${templateConfig.fontSize}pt` }}>REKOMENDASI (Surveyor)</div>
                    <div className="p-4 flex-1 space-y-4">
                       <div className="flex gap-4">
                          <Checkbox label="Layak" fontSize={templateConfig.fontSize} />
                          <Checkbox label="Tidak Layak" fontSize={templateConfig.fontSize} />
                          <Checkbox label="Dipertimbangkan" fontSize={templateConfig.fontSize} />
                       </div>
                       <div className="flex-1 min-h-[60px] border-b border-dotted border-gray-300"></div>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <div className="bg-gray-100 p-2 font-bold uppercase text-center border-b border-black" style={{ fontSize: `${templateConfig.fontSize}pt` }}>PENYALURAN (Approval)</div>
                    <div className="p-4 flex-1 space-y-4">
                       <div className="flex gap-4">
                          <Checkbox label="Layak" fontSize={templateConfig.fontSize} />
                          <Checkbox label="Tidak Layak" fontSize={templateConfig.fontSize} />
                          <Checkbox label="Dipertimbangkan" fontSize={templateConfig.fontSize} />
                       </div>
                       <div className="flex-1 min-h-[60px] border-b border-dotted border-gray-300"></div>
                    </div>
                  </div>
               </div>

               <div className="grid grid-cols-2 border-x border-b border-black min-h-[160px] mb-8">
                  <div className="border-r border-black flex flex-col items-center justify-between p-4">
                     <span className="font-bold uppercase underline" style={{ fontSize: `${templateConfig.fontSize}pt` }}>Petugas Survey</span>
                     <div className="w-full flex flex-col items-center gap-1 pb-2">
                        <div className="w-full text-center border-b border-black font-bold uppercase min-h-[1.2rem]" style={{ fontSize: `${templateConfig.fontSize}pt` }}>
                           {surveyData.namaPetugas}
                        </div>
                        <span style={{ fontSize: `${templateConfig.fontSize - 2}pt` }}>( Tanda Tangan & Nama Terang )</span>
                     </div>
                  </div>
                  <div className="flex flex-col items-center justify-between p-4">
                     <div className="w-full text-right pr-4 mb-2" style={{ fontSize: `${templateConfig.fontSize}pt` }}>
                        ........................, .................................... 20....
                     </div>
                     <span className="font-bold uppercase underline" style={{ fontSize: `${templateConfig.fontSize}pt` }}>Mustahik / Pemohon</span>
                     <div className="w-full flex flex-col items-center gap-1 pb-2">
                        <div className="w-full text-center border-b border-black font-bold uppercase min-h-[1.2rem]" style={{ fontSize: `${templateConfig.fontSize}pt` }}>
                           {surveyData.namaMustahik}
                        </div>
                        <span style={{ fontSize: `${templateConfig.fontSize - 2}pt` }}>( Tanda Tangan & Nama Terang )</span>
                     </div>
                  </div>
               </div>

               <div className="mt-auto pt-4 flex justify-between items-end border-t border-gray-200">
                  <div className="text-[8px] text-gray-400 italic">
                    Scan via App: SIP-BAZNAS-02-2024
                  </div>
                  <div className="text-[10px] font-bold">
                    Halaman 3 dari 4
                  </div>
               </div>
            </div>

            {/* PAGE 4: Dokumentasi Foto */}
            <div 
              className="bg-white shadow-2xl rounded-sm p-12 print:shadow-none print:p-10 flex flex-col font-sans overflow-hidden shrink-0" 
              style={{ 
                fontSize: `${templateConfig.fontSize}pt`,
                width: '210mm',
                minHeight: '330mm',
                height: '330mm'
              }}
            >
               <h3 className="font-bold underline mb-8 uppercase text-center" style={{ fontSize: `${templateConfig.fontSize + 4}pt` }}>DOKUMENTASI FOTO SURVEY</h3>
               
               <div className="grid grid-cols-2 gap-6 flex-1 max-h-[850px]">
                 <div className="border border-black rounded-sm flex flex-col items-center justify-center bg-gray-50 text-gray-300 gap-4">
                   <ImageIcon className="w-16 h-16 opacity-10" />
                   <p className="text-sm font-bold uppercase tracking-widest text-gray-400">Tampak Depan Rumah</p>
                 </div>
                 <div className="border border-black rounded-sm flex flex-col items-center justify-center bg-gray-50 text-gray-300 gap-4">
                   <ImageIcon className="w-16 h-16 opacity-10" />
                   <p className="text-sm font-bold uppercase tracking-widest text-gray-400">Ruang Tamu / Kamar</p>
                 </div>
                 <div className="border border-black rounded-sm flex flex-col items-center justify-center bg-gray-50 text-gray-300 gap-4">
                   <ImageIcon className="w-16 h-16 opacity-10" />
                   <p className="text-sm font-bold uppercase tracking-widest text-gray-400">Dapur / Kamar Mandi</p>
                 </div>
                 <div className="border border-black rounded-sm flex flex-col items-center justify-center bg-gray-50 text-gray-300 gap-4">
                   <ImageIcon className="w-16 h-16 opacity-10" />
                   <p className="text-sm font-bold uppercase tracking-widest text-gray-400">Bersama Mustahik</p>
                 </div>
               </div>

               <div className="mt-8 p-4 border border-black bg-gray-50">
                  <p className="font-bold uppercase underline text-xs mb-2">Catatan Visual / Kondisi Rumah :</p>
                  <p className="italic text-gray-300 text-xs text-justify">Berikan deskripsi singkat mengenai kondisi fisik bangunan, kebersihan, dan lingkungan sekitar rumah mustahik berdasarkan hasil pantauan mata saat survey dilakukan.</p>
               </div>

               <div className="mt-auto pt-4 flex justify-between items-end border-t border-gray-200">
                  <div className="text-[8px] text-gray-400 italic">
                    Dicetak secara sistem - {new Date().toLocaleString('id-ID')}
                  </div>
                  <div className="text-[10px] font-bold">
                    Halaman 4 dari 4
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

