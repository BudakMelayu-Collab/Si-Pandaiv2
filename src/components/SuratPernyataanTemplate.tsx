import React, { useState, useEffect } from 'react';
import { Recipient } from '../types';
import { Printer, X, Save, FileText, Eye, Layout, Upload, Trash2 } from 'lucide-react';
import * as storage from '../lib/storage';
import { cn, isBase64SizeValid } from '../lib/utils';

interface SuratPernyataanTemplateProps {
  recipient: Recipient;
  onClose: () => void;
  isEmbedded?: boolean;
}

export default function SuratPernyataanTemplate({ recipient, onClose, isEmbedded }: SuratPernyataanTemplateProps) {
  const [logo, setLogo] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<'template' | 'scan'>('template');
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [signedPdfBlobUrl, setSignedPdfBlobUrl] = useState<string | null>(null);
  
  const [pernyataanData, setPernyataanData] = useState(() => {
    const d = new Date();
    const monthRoman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return {
      no: `0001/SP/BAZNAS-KS/${monthRoman[d.getMonth()]}/${d.getFullYear()}`,
      dayName: days[d.getDay()],
      dateString: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      name: recipient.name || '',
      nik: recipient.nik || '',
      pob: recipient.pob || '',
      dob: recipient.dob || '',
      contact: recipient.contact || '',
      address: recipient.address || '',
      businessType: recipient.purpose || '',
      infaqAmount: '',
    };
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const savedLogo = await storage.getItem('baznas_logo');
        if (savedLogo) setLogo(savedLogo as string);
        
        // Try Cloud Firestore first to ensure the latest data from other devices/roles is loaded
        let savedPernyataan = null;
        try {
          const { getRecipientTemplateData } = await import('../firebase');
          savedPernyataan = await getRecipientTemplateData(recipient.id, 'pernyataan');
          if (savedPernyataan) {
            await storage.setItem(`pernyataan_${recipient.id}`, JSON.stringify(savedPernyataan));
          }
        } catch (e) {
          console.error("Cloud fetch failed, trying local storage fallback", e);
        }

        // If not available from cloud, fallback to local storage
        if (!savedPernyataan) {
          const localSaved = await storage.getItem(`pernyataan_${recipient.id}`);
          if (localSaved) {
            savedPernyataan = typeof localSaved === 'string' ? JSON.parse(localSaved) : localSaved;
          }
        }

        if (savedPernyataan) {
          setPernyataanData(savedPernyataan);
        }

        if (recipient.hasSignedPernyataanPdf && !signedPdfUrl) {
          setIsLoadingFile(true);
          try {
            const { db } = await import('../firebase');
            const { doc, getDoc } = await import('firebase/firestore');
            const scanRef = doc(db, 'recipients', recipient.id, 'scans', 'pernyataan');
            const snap = await getDoc(scanRef);
            if (snap.exists() && snap.data()?.base64) {
              setSignedPdfUrl(snap.data().base64);
            } else {
              const legacyPdf = await storage.getItem(`pernyataan_signed_pdf_${recipient.id}`);
              if (legacyPdf) setSignedPdfUrl(legacyPdf as string);
            }
          } catch (e) {
            console.error('Failed to load pernyataan signed PDF', e);
          } finally {
            setIsLoadingFile(false);
          }
        } else if (!recipient.hasSignedPernyataanPdf && !signedPdfUrl) {
          const localPdf = await storage.getItem(`pernyataan_signed_pdf_${recipient.id}`);
          if (localPdf) setSignedPdfUrl(localPdf as string);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadData();
  }, [recipient.id, recipient.hasSignedPernyataanPdf, signedPdfUrl]);

  useEffect(() => {
    if (signedPdfUrl && signedPdfUrl.startsWith('data:application/pdf')) {
      const getBlob = async () => {
        try {
          const response = await fetch(signedPdfUrl);
          const blob = await response.blob();
          const objUrl = URL.createObjectURL(blob);
          setSignedPdfBlobUrl(objUrl);
        } catch (e) {
          console.error("Error creating blob url for pernyataan pdf:", e);
        }
      };
      getBlob();
    }
    return () => {
      if (signedPdfBlobUrl) {
        URL.revokeObjectURL(signedPdfBlobUrl);
      }
    };
  }, [signedPdfUrl]);

  const handlePrint = () => {
    window.print();
  };

  const handleSave = async () => {
    try {
      await storage.setItem(`pernyataan_${recipient.id}`, JSON.stringify(pernyataanData));
      const { saveRecipientTemplateData } = await import('../firebase');
      await saveRecipientTemplateData(recipient.id, 'pernyataan', pernyataanData);
      alert('Tersimpan!');
    } catch (err) {
      alert('Gagal menyimpan');
    }
  };

  const handleSavePdfToServer = async (base64: string | null) => {
    setIsUploading(true);
    try {
      const { updateRecipientPernyataanPdf } = await import('../firebase');
      await updateRecipientPernyataanPdf(recipient.id, base64);
      setSignedPdfUrl(base64);
    } catch (error: any) {
      console.error(error);
      alert('Gagal menyimpan ke Cloud. ' + (error.message.includes('quota') ? 'Quota storage penuh.' : 'File mungkin terlalu besar (>1MB).'));
    } finally {
      setIsUploading(false);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { ensureGoogleDriveConnected, getGoogleAccessToken } = await import('../firebase');
      await ensureGoogleDriveConnected();

      const isPdf = file.type === 'application/pdf';
      if (!isPdf) {
        alert('Mohon upload file dalam format PDF.');
        setIsUploading(false);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        if (!getGoogleAccessToken() && !isBase64SizeValid(base64)) {
          alert('File scan terlalu besar. Silakan gunakan resolusi lebih rendah atau file yang lebih kecil (Maksimal ~700KB setelah kompresi) or hubungkan Google Drive Anda.');
          setIsUploading(false);
          return;
        }

        setSignedPdfUrl(base64);
        await storage.setItem(`pernyataan_signed_pdf_${recipient.id}`, base64);
        await handleSavePdfToServer(base64);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Scan upload error:', error);
      setIsUploading(false);
    }
  };

  if (isEmbedded) {
    return (
      <div className="statement-print-page w-[800px] bg-white border border-slate-200 shadow-sm print:border-none print:shadow-none min-h-[1131px] p-12 print:p-0 relative font-sans text-black print:w-full shrink-0">
        <div className="border border-slate-200 p-8 pt-6 relative">
          
          <div className="flex flex-col items-center justify-center pb-4 mb-6 text-center border-b border-slate-100 print:border-b-0">
            <div className="mb-4">
              {logo && <img src={logo} alt="Logo" className="w-[110px] object-contain mx-auto" />}
            </div>
            <h1 className="text-xl font-bold uppercase tracking-tight text-black mt-6">Surat Pernyataan Komitmen Mustahik</h1>
            <h2 className="text-sm font-bold uppercase tracking-tight text-slate-800 mt-0.5">Program Pendayagunaan Zakat BAZNAS Kabupaten Siak</h2>
          </div>

          <div className="text-right mt-4 mb-6">
            <h2 className="text-2xl font-bold tracking-wider" style={{ fontFamily: 'serif' }}>بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم</h2>
          </div>

          <div className="mb-4 bg-gray-50/80 p-4 rounded-xl border border-gray-200/60 print:bg-gray-50 print:border-gray-200/50 print:p-4">
            <p className="italic text-justify font-medium text-sm leading-relaxed text-slate-800 print:text-black">
              "Orang yang melepaskan seorang muslim dari kesulitannya di dunia, Allah akan melepaskan kesulitannya di hari kiamat. Dan Allah senantiasa menolong hamba-Nya selama ia suka menolong saudaranya."
            </p>
            <p className="text-right text-sm font-bold text-slate-600 mt-1 print:text-black">(H.R. Muslim)</p>
          </div>

          <p className="mb-4 text-justify text-sm font-medium leading-relaxed text-black">
            Dengan menyebut asma Allah Yang Maha Pengasih lagi Maha Penyayang, pada hari ini{' '}
            <span className="font-bold underline">{pernyataanData.dayName || '....................'}</span>
            , tanggal{' '}
            <span className="font-bold underline">{pernyataanData.dateString || '...... / ...... / 20.....'}</span>
            , saya yang bertanda tangan di bawah ini:
          </p>

          <div className="space-y-3 mb-6 ml-4 text-sm font-medium text-black">
            <div className="grid grid-cols-[160px_10px_1fr] items-center">
              <span>Nama Lengkap</span><span>:</span>
              <span className="font-bold uppercase">{pernyataanData.name || '............................................................................................'}</span>
            </div>
            <div className="grid grid-cols-[160px_10px_1fr] items-center">
              <span>N I K</span><span>:</span>
              <span className="font-bold">{pernyataanData.nik || '............................................................................................'}</span>
            </div>
            <div className="grid grid-cols-[160px_10px_1fr] items-center">
              <span>Tempat, Tgl Lahir</span><span>:</span>
              <span className="font-bold">
                {pernyataanData.pob || pernyataanData.dob ? (
                  <span>{pernyataanData.pob}{pernyataanData.pob && pernyataanData.dob ? ', ' : ''}{pernyataanData.dob}</span>
                ) : (
                  '............................................................................................'
                )}
              </span>
            </div>
            <div className="grid grid-cols-[160px_10px_1fr] items-start">
              <span>Alamat</span><span>:</span>
              <span className="font-bold">{pernyataanData.address || '............................................................................................'}</span>
            </div>
            <div className="grid grid-cols-[160px_10px_1fr] items-center">
              <span>Jenis Usaha</span><span>:</span>
              <span className="font-bold uppercase">{pernyataanData.businessType || '............................................................................................'}</span>
            </div>
            <div className="grid grid-cols-[160px_10px_1fr] items-center">
              <span>No. Telp / WA</span><span>:</span>
              <span className="font-bold">{pernyataanData.contact || '............................................................................................'}</span>
            </div>
          </div>

          <p className="mb-4 text-justify text-sm font-medium leading-relaxed text-black">
            Dengan ini menyatakan siap mematuhi dan menaati segala ketentuan dan peraturan yang berlaku pada Program Pendayagunaan Zakat BAZNAS Kabupaten Siak, dengan poin-poin komitmen sebagai berikut:
          </p>

          <div className="space-y-4 mb-6 ml-2 text-sm font-medium text-black">
            <div className="flex gap-2 text-justify leading-relaxed">
              <span className="shrink-0 w-4 font-bold text-slate-900">1.</span>
              <div>
                <strong>Komitmen Spiritual & Syariah:</strong> Menjaga akhlakul karimah (melaksanakan ibadah wajib dan mengikuti majelis pengajian), menghindari unsur gharar (penipuan/ketidakpastian) dalam transaksi jual beli, serta memastikan komoditas usaha berstatus halal dan thayyib.
              </div>
            </div>
            <div className="flex gap-2 text-justify leading-relaxed">
              <span className="shrink-0 w-4 font-bold text-slate-900">2.</span>
              <div>
                <strong>Komitmen Penggunaan Modal:</strong> Mempergunakan bantuan modal usaha—dalam bentuk apa pun—sepenuhnya untuk kepentingan usaha dan bertekad kuat untuk mengembangkannya.
              </div>
            </div>
            <div className="flex gap-2 text-justify leading-relaxed">
              <span className="shrink-0 w-4 font-bold text-slate-900">3.</span>
              <div>
                <strong>Komitmen Pendampingan:</strong> Mengikuti seluruh ketentuan pendampingan program yang ditetapkan dan/atau diatur oleh Pendamping Program Bidang Ekonomi BAZNAS Siak.
              </div>
            </div>
            <div className="flex gap-2 text-justify leading-relaxed">
              <span className="shrink-0 w-4 font-bold text-slate-900">4.</span>
              <div>
                <strong>Komitmen Kemandirian:</strong> Mengelola dana bantuan tersebut secara optimal agar usaha dapat tumbuh dan berkembang secara berkelanjutan.
              </div>
            </div>
            <div className="flex gap-2 text-justify leading-relaxed">
              <span className="shrink-0 w-4 font-bold text-slate-900">5.</span>
              <div>
                <strong>Komitmen Berbagi (Infaq/Menabung):</strong> Bersedia untuk menabung dan/atau berinfaq sesuai kemampuan saya sebesar{' '}
                <span className="font-bold border-b border-black px-2 mx-1">Rp {pernyataanData.infaqAmount || '........................'}</span>{' '}
                setiap (hari / minggu / bulan).
              </div>
            </div>
          </div>

          <p className="mb-4 text-justify text-sm font-medium leading-relaxed text-black">
            Demikian Surat Pernyataan ini dibuat dengan sebenar-benarnya, dalam keadaan sadar, sehat jasmani dan rohani, serta tanpa paksaan dari pihak mana pun.
          </p>

          <div className="mb-6 bg-gray-50/80 p-4 rounded-xl border border-gray-200/60 print:bg-gray-50 print:border-gray-200/50 print:p-4">
            <p className="italic text-justify font-medium text-sm leading-relaxed text-slate-800 print:text-black">
              "Sesungguhnya seseorang di antara kamu yang berpagi-pagi dalam mencari rezeki, memikul kayu kemudian bersedekah sebagian darinya dan mencukupkan diri dari (meminta-minta) kepada orang lain, adalah lebih baik ketimbang meminta-minta kepada seseorang, yang mungkin diberi atau ditolak."
            </p>
            <p className="text-right text-sm font-bold text-slate-600 mt-1 print:text-black">(H.R. Bukhari dan Muslim)</p>
          </div>

          <div className="flex justify-end mt-12 text-sm font-medium text-black">
            <div className="w-[240px] text-left">
              <p className="mb-20">Yang Membuat Pernyataan,</p>
              <div className="font-bold underline text-base">
                <span>{pernyataanData.name}</span>
              </div>
              <p className="text-black mt-1 font-semibold">Mustahik / Penerima Manfaat</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6 bg-slate-900/60 backdrop-blur-sm overflow-hidden animate-in fade-in duration-200 print:absolute print:inset-0 print:p-0 print:bg-white print:overflow-visible print:block">
      <div className={cn("bg-white md:rounded-2xl w-full h-full md:h-[95vh] shadow-2xl flex flex-col flex-1 overflow-hidden relative print:shadow-none print:h-auto print:max-w-none print:overflow-visible print:block transition-all duration-300", isEditing ? "md:max-w-7xl" : "md:max-w-5xl")}>
        
        {/* Navigation Bar */}
        <div className="p-4 px-6 border-b border-slate-100 flex items-center gap-4 bg-white shrink-0 shadow-sm print:hidden">
          <div className="flex-1 flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">Surat Pernyataan / Akad Mustahik</h2>
              <p className="text-xs text-slate-500 font-medium">Buat, cetak, dan kelola dokumen Surat Pernyataan.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl mr-2">
              <button 
                onClick={() => setViewMode('template')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all",
                  viewMode === 'template' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Layout className="w-4 h-4" />
                Template
              </button>
              <button 
                onClick={() => setViewMode('scan')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all relative",
                  viewMode === 'scan' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Eye className="w-4 h-4" />
                Scan Tertanda
                {signedPdfUrl && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
                )}
              </button>
            </div>

            {viewMode === 'template' && (
              <>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="px-4 py-2 text-sm font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl transition-all border border-amber-200"
                >
                  {isEditing ? 'Selesai Edit' : 'Edit Mode'}
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 text-sm font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition-all flex items-center gap-2 border border-emerald-200"
                >
                  <Save className="w-4 h-4" /> Simpan
                </button>
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-sm flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> Cetak
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Workspace */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-8 print:p-0 print:bg-white custom-scrollbar flex justify-center print:overflow-visible print:block">
          {viewMode === 'template' ? (
            <div className="flex flex-col lg:flex-row gap-6 w-full max-w-full justify-center items-start print:block">
              {/* Form Input Sidebar (visible only when isEditing is true, hidden on print) */}
              {isEditing && (
                <div className="w-full lg:w-[380px] shrink-0 bg-white p-6 rounded-2xl border border-slate-200 shadow-md print:hidden flex flex-col gap-5 h-fit">
                  <div className="pb-3 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Formulir Isian</h3>
                    <p className="text-[11px] text-slate-500 font-medium">Ubah informasi di bawah ini untuk mengisi surat pernyataan secara instan:</p>
                  </div>

                  {/* Hari & Tanggal */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Waktu & Tanggal</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">HARI</label>
                        <input 
                          type="text"
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 hover:bg-slate-100/50 transition-colors"
                          value={pernyataanData.dayName} 
                          onChange={e => setPernyataanData({...pernyataanData, dayName: e.target.value})} 
                          placeholder="Hari"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">TANGGAL</label>
                        <input 
                          type="text"
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 hover:bg-slate-100/50 transition-colors"
                          value={pernyataanData.dateString} 
                          onChange={e => setPernyataanData({...pernyataanData, dateString: e.target.value})} 
                          placeholder="Tanggal"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Identitas Mustahik */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Identitas Mustahik</h4>
                    
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">NAMA LENGKAP</label>
                      <input 
                        type="text"
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 hover:bg-slate-100/50 transition-colors"
                        value={pernyataanData.name} 
                        onChange={e => setPernyataanData({...pernyataanData, name: e.target.value})} 
                        placeholder="Nama Lengkap"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">N I K</label>
                      <input 
                        type="text"
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 hover:bg-slate-100/50 transition-colors"
                        value={pernyataanData.nik} 
                        onChange={e => setPernyataanData({...pernyataanData, nik: e.target.value})} 
                        placeholder="Nomor Induk Kependudukan"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">TEMPAT LAHIR</label>
                        <input 
                          type="text"
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 hover:bg-slate-100/50 transition-colors"
                          value={pernyataanData.pob} 
                          onChange={e => setPernyataanData({...pernyataanData, pob: e.target.value})} 
                          placeholder="Tempat Lahir"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">TGL LAHIR</label>
                        <input 
                          type="text"
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 hover:bg-slate-100/50 transition-colors"
                          value={pernyataanData.dob} 
                          onChange={e => setPernyataanData({...pernyataanData, dob: e.target.value})} 
                          placeholder="Tanggal Lahir"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">ALAMAT</label>
                      <textarea 
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 hover:bg-slate-100/50 transition-colors resize-none"
                        rows={2}
                        value={pernyataanData.address} 
                        onChange={e => setPernyataanData({...pernyataanData, address: e.target.value})} 
                        placeholder="Alamat Lengkap"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">JENIS USAHA</label>
                      <input 
                        type="text"
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 hover:bg-slate-100/50 transition-colors"
                        value={pernyataanData.businessType} 
                        onChange={e => setPernyataanData({...pernyataanData, businessType: e.target.value})} 
                        placeholder="Jenis Usaha"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">NO. TELP / WA</label>
                      <input 
                        type="text"
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 hover:bg-slate-100/50 transition-colors"
                        value={pernyataanData.contact} 
                        onChange={e => setPernyataanData({...pernyataanData, contact: e.target.value})} 
                        placeholder="No. Telp / WA"
                      />
                    </div>
                  </div>

                  {/* Komitmen Berbagi */}
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Komitmen Infaq / Tabungan</h4>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">JUMLAH INFAQ (Rp)</label>
                      <input 
                        type="text"
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 hover:bg-slate-100/50 transition-colors"
                        value={pernyataanData.infaqAmount} 
                        onChange={e => setPernyataanData({...pernyataanData, infaqAmount: e.target.value})} 
                        placeholder="Kosongkan jika diisi manual"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Kosongkan jika ingin menulis jumlah secara manual dengan pena.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* The Actual Letter Document - wrapped in responsive overflow-x-auto */}
              <div className="overflow-x-auto w-full flex justify-center print:overflow-visible print:block">
                <div className="w-[800px] bg-white border border-slate-200 shadow-sm print:border-none print:shadow-none min-h-[1131px] p-12 print:p-0 relative font-sans text-black origin-top transform scale-100 print:scale-100 print:w-full shrink-0">
                  
                  {/* Form Content Wrapper (Now containing Logo and Title) */}
                  <div className="border border-slate-200 p-8 pt-6 relative">
                    
                    {/* Cop Header (Logo and Document Name inside the box) */}
                    <div className="flex flex-col items-center justify-center pb-4 mb-6 text-center border-b border-slate-100 print:border-b-0">
                      <div className="mb-4">
                        {logo && <img src={logo} alt="Logo" className="w-[110px] object-contain mx-auto" />}
                      </div>
                      <h1 className="text-xl font-bold uppercase tracking-tight text-black mt-6">Surat Pernyataan Komitmen Mustahik</h1>
                      <h2 className="text-sm font-bold uppercase tracking-tight text-slate-800 mt-0.5">Program Pendayagunaan Zakat BAZNAS Kabupaten Siak</h2>
                    </div>

                    {/* Bismillah */}
                    <div className="text-right mt-4 mb-6">
                    <h2 className="text-2xl font-bold tracking-wider" style={{ fontFamily: 'serif' }}>بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم</h2>
                  </div>

                  {/* Hadits 1 */}
                  <div className="mb-4 bg-gray-50/80 p-4 rounded-xl border border-gray-200/60 print:bg-gray-50 print:border-gray-200/50 print:p-4">
                    <p className="italic text-justify font-medium text-sm leading-relaxed text-slate-800 print:text-black">
                      "Orang yang melepaskan seorang muslim dari kesulitannya di dunia, Allah akan melepaskan kesulitannya di hari kiamat. Dan Allah senantiasa menolong hamba-Nya selama ia suka menolong saudaranya."
                    </p>
                    <p className="text-right text-sm font-bold text-slate-600 mt-1 print:text-black">(H.R. Muslim)</p>
                  </div>

                  {/* Introduction Paragraph */}
                  <p className="mb-4 text-justify text-sm font-medium leading-relaxed text-black">
                    Dengan menyebut asma Allah Yang Maha Pengasih lagi Maha Penyayang, pada hari ini{' '}
                    {isEditing ? (
                      <input 
                        className="border border-amber-300 bg-amber-50 px-1 text-center font-semibold outline-none w-24" 
                        value={pernyataanData.dayName} 
                        onChange={e => setPernyataanData({...pernyataanData, dayName: e.target.value})} 
                      />
                    ) : (
                      <span className="font-bold underline">{pernyataanData.dayName || '....................'}</span>
                    )}
                    , tanggal{' '}
                    {isEditing ? (
                      <input 
                        className="border border-amber-300 bg-amber-50 px-1 text-center font-semibold outline-none w-48" 
                        value={pernyataanData.dateString} 
                        onChange={e => setPernyataanData({...pernyataanData, dateString: e.target.value})} 
                      />
                    ) : (
                      <span className="font-bold underline">{pernyataanData.dateString || '...... / ...... / 20.....'}</span>
                    )}
                    , saya yang bertanda tangan di bawah ini:
                  </p>

                  {/* Mustahik Data Table/Grid */}
                  <div className="space-y-3 mb-6 ml-4 text-sm font-medium text-black">
                    <div className="grid grid-cols-[160px_10px_1fr] items-center">
                      <span>Nama Lengkap</span><span>:</span>
                      {isEditing ? (
                        <input 
                          className="border border-amber-300 bg-amber-50 px-1 w-full outline-none font-semibold" 
                          value={pernyataanData.name} 
                          onChange={e => setPernyataanData({...pernyataanData, name: e.target.value})} 
                        />
                      ) : (
                        <span className="font-bold uppercase">{pernyataanData.name || '............................................................................................'}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-[160px_10px_1fr] items-center">
                      <span>N I K</span><span>:</span>
                      {isEditing ? (
                        <input 
                          className="border border-amber-300 bg-amber-50 px-1 w-full outline-none font-semibold" 
                          value={pernyataanData.nik} 
                          onChange={e => setPernyataanData({...pernyataanData, nik: e.target.value})} 
                        />
                      ) : (
                        <span className="font-bold">{pernyataanData.nik || '............................................................................................'}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-[160px_10px_1fr] items-center">
                      <span>Tempat, Tgl Lahir</span><span>:</span>
                      {isEditing ? (
                        <div className="flex gap-2 w-full">
                          <input 
                            className="border border-amber-300 bg-amber-50 px-1 w-1/2 outline-none" 
                            value={pernyataanData.pob} 
                            onChange={e => setPernyataanData({...pernyataanData, pob: e.target.value})} 
                            placeholder="Tempat Lahir" 
                          />
                          <input 
                            className="border border-amber-300 bg-amber-50 px-1 w-1/2 outline-none" 
                            value={pernyataanData.dob} 
                            onChange={e => setPernyataanData({...pernyataanData, dob: e.target.value})} 
                            placeholder="Tanggal Lahir" 
                          />
                        </div>
                      ) : (
                        <span className="font-bold">
                          {pernyataanData.pob || pernyataanData.dob ? (
                            <span>{pernyataanData.pob}{pernyataanData.pob && pernyataanData.dob ? ', ' : ''}{pernyataanData.dob}</span>
                          ) : (
                            '............................................................................................'
                          )}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-[160px_10px_1fr] items-start">
                      <span>Alamat</span><span>:</span>
                      {isEditing ? (
                        <textarea 
                          className="border border-amber-300 bg-amber-50 px-1 w-full outline-none resize-none font-semibold" 
                          rows={2} 
                          value={pernyataanData.address} 
                          onChange={e => setPernyataanData({...pernyataanData, address: e.target.value})} 
                        />
                      ) : (
                        <span className="font-bold">{pernyataanData.address || '............................................................................................'}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-[160px_10px_1fr] items-center">
                      <span>Jenis Usaha</span><span>:</span>
                      {isEditing ? (
                        <input 
                          className="border border-amber-300 bg-amber-50 px-1 w-full outline-none font-semibold" 
                          value={pernyataanData.businessType} 
                          onChange={e => setPernyataanData({...pernyataanData, businessType: e.target.value})} 
                        />
                      ) : (
                        <span className="font-bold uppercase">{pernyataanData.businessType || '............................................................................................'}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-[160px_10px_1fr] items-center">
                      <span>No. Telp / WA</span><span>:</span>
                      {isEditing ? (
                        <input 
                          className="border border-amber-300 bg-amber-50 px-1 w-full outline-none font-semibold" 
                          value={pernyataanData.contact} 
                          onChange={e => setPernyataanData({...pernyataanData, contact: e.target.value})} 
                        />
                      ) : (
                        <span className="font-bold">{pernyataanData.contact || '............................................................................................'}</span>
                      )}
                    </div>
                  </div>

                  {/* Agreement Body Text */}
                  <p className="mb-4 text-justify text-sm font-medium leading-relaxed text-black">
                    Dengan ini menyatakan siap mematuhi dan menaati segala ketentuan dan peraturan yang berlaku pada Program Pendayagunaan Zakat BAZNAS Kabupaten Siak, dengan poin-poin komitmen sebagai berikut:
                  </p>

                  {/* Agreement Points */}
                  <div className="space-y-4 mb-6 ml-2 text-sm font-medium text-black">
                    <div className="flex gap-2 text-justify leading-relaxed">
                      <span className="shrink-0 w-4 font-bold text-slate-900">1.</span>
                      <div>
                        <strong>Komitmen Spiritual & Syariah:</strong> Menjaga akhlakul karimah (melaksanakan ibadah wajib dan mengikuti majelis pengajian), menghindari unsur gharar (penipuan/ketidakpastian) dalam transaksi jual beli, serta memastikan komoditas usaha berstatus halal dan thayyib.
                      </div>
                    </div>
                    <div className="flex gap-2 text-justify leading-relaxed">
                      <span className="shrink-0 w-4 font-bold text-slate-900">2.</span>
                      <div>
                        <strong>Komitmen Penggunaan Modal:</strong> Mempergunakan bantuan modal usaha—dalam bentuk apa pun—sepenuhnya untuk kepentingan usaha dan bertekad kuat untuk mengembangkannya.
                      </div>
                    </div>
                    <div className="flex gap-2 text-justify leading-relaxed">
                      <span className="shrink-0 w-4 font-bold text-slate-900">3.</span>
                      <div>
                        <strong>Komitmen Pendampingan:</strong> Mengikuti seluruh ketentuan pendampingan program yang ditetapkan dan/atau diatur oleh Pendamping Program Bidang Ekonomi BAZNAS Siak.
                      </div>
                    </div>
                    <div className="flex gap-2 text-justify leading-relaxed">
                      <span className="shrink-0 w-4 font-bold text-slate-900">4.</span>
                      <div>
                        <strong>Komitmen Kemandirian:</strong> Mengelola dana bantuan tersebut secara optimal agar usaha dapat tumbuh dan berkembang secara berkelanjutan.
                      </div>
                    </div>
                    <div className="flex gap-2 text-justify leading-relaxed">
                      <span className="shrink-0 w-4 font-bold text-slate-900">5.</span>
                      <div>
                        <strong>Komitmen Berbagi (Infaq/Menabung):</strong> Bersedia untuk menabung dan/atau berinfaq sesuai kemampuan saya sebesar{' '}
                        {isEditing ? (
                          <input 
                            className="border border-amber-300 bg-amber-50 px-1 mx-1 text-center font-semibold outline-none w-32" 
                            value={pernyataanData.infaqAmount} 
                            onChange={e => setPernyataanData({...pernyataanData, infaqAmount: e.target.value})} 
                            placeholder="Rp..." 
                          />
                        ) : (
                          <span className="font-bold border-b border-black px-2 mx-1">Rp {pernyataanData.infaqAmount || '........................'}</span>
                        )}{' '}
                        setiap (hari / minggu / bulan).
                      </div>
                    </div>
                  </div>

                  {/* Ending Statement */}
                  <p className="mb-4 text-justify text-sm font-medium leading-relaxed text-black">
                    Demikian Surat Pernyataan ini dibuat dengan sebenar-benarnya, dalam keadaan sadar, sehat jasmani dan rohani, serta tanpa paksaan dari pihak mana pun.
                  </p>

                  {/* Hadits 2 */}
                  <div className="mb-6 bg-gray-50/80 p-4 rounded-xl border border-gray-200/60 print:bg-gray-50 print:border-gray-200/50 print:p-4">
                    <p className="italic text-justify font-medium text-sm leading-relaxed text-slate-800 print:text-black">
                      "Sesungguhnya seseorang di antara kamu yang berpagi-pagi dalam mencari rezeki, memikul kayu kemudian bersedekah sebagian darinya dan mencukupkan diri dari (meminta-minta) kepada orang lain, adalah lebih baik ketimbang meminta-minta kepada seseorang, yang mungkin diberi atau ditolak."
                    </p>
                    <p className="text-right text-sm font-bold text-slate-600 mt-1 print:text-black">(H.R. Bukhari dan Muslim)</p>
                  </div>

                  {/* Signature Section - Custom aligned right without Table */}
                  <div className="flex justify-end mt-12 text-sm font-medium text-black">
                    <div className="w-[240px] text-left">
                      <p className="mb-20">Yang Membuat Pernyataan,</p>
                      <div className="font-bold underline text-base">
                        {isEditing ? (
                          <input 
                            className="border border-amber-300 bg-amber-50 px-1 w-full outline-none font-semibold text-sm" 
                            value={pernyataanData.name} 
                            onChange={e => setPernyataanData({...pernyataanData, name: e.target.value})} 
                          />
                        ) : (
                          <span>{pernyataanData.name}</span>
                        )}
                      </div>
                      <p className="text-black mt-1 font-semibold">Mustahik / Penerima Manfaat</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          ) : (
            <div className="max-w-4xl w-full flex gap-6">
              <div className="flex-1 bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center min-h-[600px] border border-slate-200">
                {!signedPdfUrl ? (
                  <div className="text-center max-w-sm">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-emerald-100 border-dashed">
                      {isLoadingFile ? (
                        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent animate-spin rounded-full" />
                      ) : (
                        <FileText className="w-10 h-10 text-emerald-300" />
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">
                       {isLoadingFile ? 'Memuat Dokumen dari Cloud...' : 'Belum Ada Scan Surat Pernyataan'}
                    </h3>
                    <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                       {isLoadingFile ? 'Mohon tunggu sebentar, file berukuran besar sedang diproses.' : 'Silakan upload scan Surat Pernyataan yang sudah ditandatangani basah oleh Mustahik dalam format PDF.'}
                    </p>
                    
                    {!isLoadingFile && (
                      <label className={cn(
                        "flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-bold cursor-pointer transition-all",
                        isUploading ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                      )}>
                        {isUploading ? <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent animate-spin rounded-full" /> : <Upload className="w-5 h-5" />}
                        {isUploading ? 'Mengupload...' : 'Pilih File PDF'}
                        <input type="file" className="hidden" accept="application/pdf" onChange={handlePdfUpload} disabled={isUploading} />
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-[800px] flex flex-col">
                    <div className="flex justify-between items-center mb-4 px-2">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Dokumen Tersimpan
                      </h3>
                      <div className="flex gap-2">
                        <a 
                          href={signedPdfBlobUrl || signedPdfUrl || ''} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                        >
                          <Eye className="w-4 h-4" /> Buka Tab Baru
                        </a>
                      </div>
                    </div>
                    <div className="flex-1 bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
                      <object 
                        data={signedPdfBlobUrl || signedPdfUrl || ''} 
                        type="application/pdf" 
                        className="w-full h-full"
                      >
                        <div className="flex items-center justify-center h-full text-slate-500 flex-col gap-4">
                          <p>Browser tidak mendukung PDF viewer terintegrasi.</p>
                          <a 
                            href={signedPdfBlobUrl || signedPdfUrl || ''} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold"
                          >
                            Unduh / Buka PDF
                          </a>
                        </div>
                      </object>
                    </div>
                  </div>
                )}
              </div>

              <div className="w-72 shrink-0 space-y-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Save className="w-4 h-4 text-emerald-500" />
                    Status Dokumen
                  </h3>
                  
                  <div className="space-y-4">
                    <div className={cn(
                      "p-3 rounded-xl flex items-start gap-3 transition-colors",
                      signedPdfUrl ? "bg-emerald-50" : "bg-slate-50"
                    )}>
                      <div className={cn(
                        "mt-0.5 w-2 h-2 rounded-full shrink-0",
                        signedPdfUrl ? "bg-emerald-500" : "bg-slate-300"
                      )} />
                      <div>
                        <p className="text-sm font-bold text-slate-800 leading-none mb-1">Scan Tertanda</p>
                        <p className="text-xs text-slate-500">{isLoadingFile ? 'Memuat...' : (signedPdfUrl ? 'Tersedia di Cloud' : 'Belum diunggah')}</p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex gap-2">
                      <label className={cn(
                        "flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2 px-3 rounded-lg cursor-pointer transition-all",
                        isUploading ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                      )}>
                        {isUploading ? <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full" /> : <Upload className="w-3.5 h-3.5" />}
                        Upload Ulang
                        <input type="file" className="hidden" accept="application/pdf" onChange={handlePdfUpload} disabled={isUploading} />
                      </label>
                      
                      {signedPdfUrl && (
                        <button 
                          disabled={isUploading}
                          onClick={() => {
                            if(confirm('Hapus file scan dari Cloud?')) {
                              setSignedPdfUrl(null);
                              handleSavePdfToServer(null);
                            }
                          }}
                          className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-all disabled:opacity-50"
                          title="Hapus file"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            @page {
              size: A4 portrait;
              margin: 1.5cm;
            }
            body {
              -webkit-print-color-adjust: exact;
            }
            ::-webkit-scrollbar {
              display: none;
            }
          }
        `}} />
      </div>
    </div>
  );
}
