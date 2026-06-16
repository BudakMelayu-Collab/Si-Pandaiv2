import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { Recipient } from '../types';
import { Printer, X, Save, FileText, Eye, Layout, Upload, Trash2 } from 'lucide-react';
import * as storage from '../lib/storage';
import { cn, isBase64SizeValid } from '../lib/utils';
import { updateInternalMemoPdf } from '../firebase';

interface InternalMemoTemplateProps {
  recipient: Recipient;
  onClose: () => void;
}

const terbilang = (n: number): string => {
  if (n === 0) return 'Nol Rupiah';
  
  const helper = (num: number): string => {
    const units = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
    if (num === 0) return '';
    if (num < 12) return units[num];
    if (num < 20) return units[num - 10] + ' Belas';
    if (num < 100) return (num < 20 ? units[num-10] + ' Belas' : (Math.floor(num / 10) === 1 ? 'Sepuluh' : units[Math.floor(num / 10)]) + ' Puluh ' + helper(num % 10));
    if (num < 200) return 'Seratus ' + helper(num - 100);
    if (num < 1000) return (Math.floor(num / 100) === 1 ? 'Seratus' : units[Math.floor(num / 100)]) + ' Ratus ' + helper(num % 100);
    if (num < 2000) return 'Seribu ' + helper(num - 1000);
    if (num < 1000000) return helper(Math.floor(num / 1000)) + ' Ribu ' + helper(num % 1000);
    if (num < 1000000000) return helper(Math.floor(num / 1000000)) + ' Juta ' + helper(num % 1000000);
    return '';
  };
  
  const fixIndonesian = (str: string) => {
    return str
      .replace(/Satu Puluh/g, 'Sepuluh')
      .replace(/Satu Ratus/g, 'Seratus')
      .replace(/Satu Ribu/g, 'Seribu')
      .replace(/\s+/g, ' ').trim();
  };
  
  return fixIndonesian(helper(n));
};

export default function InternalMemoTemplate({ recipient, onClose }: InternalMemoTemplateProps) {
  const [logo, setLogo] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<'template' | 'scan'>('template');
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [signedPdfBlobUrl, setSignedPdfBlobUrl] = useState<string | null>(null);
  const [memoData, setMemoData] = useState(() => {
    const d = new Date();
    const monthRoman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    return {
      no: `0001/IM/BAZNAS-KS/${monthRoman[d.getMonth()]}/${d.getFullYear()}`,
      date: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      toPosition: 'Ketua BAZNAS Kabupaten Siak',
      toName: 'H. Samparis Bin Tatan, S.Pd.i',
      amount: recipient.amountProposed || 0,
      reference: `REG-${recipient.nik ? recipient.nik.slice(-4) : '0000'}`,
      description: recipient.purpose || 'Pengajuan Bantuan',
      creatorName: 'Andreas Supriadi, S.Ikom',
      creatorPosition: 'Kabid. PDP',
      approverName: 'H. Sukijo',
      approverPosition: 'Wakil Ketua II PDP',
    };
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const savedLogo = await storage.getItem('baznas_logo');
        if (savedLogo) setLogo(savedLogo as string);
        
        // Try Cloud Firestore first to ensure the latest data from other devices/roles is loaded
        let savedMemo = null;
        try {
          const { getRecipientTemplateData } = await import('../firebase');
          savedMemo = await getRecipientTemplateData(recipient.id, 'memo');
          if (savedMemo) {
            await storage.setItem(`memo_${recipient.id}`, JSON.stringify(savedMemo));
          }
        } catch (e) {
          console.error("Cloud fetch failed, trying local storage fallback", e);
        }

        // If not available from cloud, fallback to local storage
        if (!savedMemo) {
          const localSaved = await storage.getItem(`memo_${recipient.id}`);
          if (localSaved) {
            savedMemo = typeof localSaved === 'string' ? JSON.parse(localSaved) : localSaved;
          }
        }

        if (savedMemo) {
          const parsed = savedMemo;
          
          // Migrasi format lama ke baru
          if (parsed.toPosition === 'Ketua BAZNAS Provinsi Riau') parsed.toPosition = 'Ketua BAZNAS Kabupaten Siak';
          if (parsed.toName === 'H. Masriadi Hasan., Lc.,M.Sha') parsed.toName = 'H. Samparis Bin Tatan, S.Pd.i';
          if (parsed.creatorName === 'Yuliana Tartila, S.Pd') parsed.creatorName = 'Andreas Supriadi, S.Ikom';
          if (parsed.creatorPosition === 'Kabag. SDM dan Umum') parsed.creatorPosition = 'Kabid. PDP';
          if (parsed.approverName === 'H. Eddi Amran, Lc.,MA') parsed.approverName = 'H. Sukijo';
          if (parsed.approverPosition === 'Wakil Ketua IV') parsed.approverPosition = 'Wakil Ketua II PDP';
          
          if (parsed.date && parsed.date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            const parts = parsed.date.split('/');
            const dForm = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            if (!isNaN(dForm.getTime())) {
               parsed.date = dForm.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            }
          }

          if (parsed.no) {
            const d = new Date();
            const monthRoman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
            const currentMonth = monthRoman[d.getMonth()];
            const currentYear = d.getFullYear();
            
            // Extract the sequence number
            const seqMatch = parsed.no.match(/^(\d+)\//);
            const seq = seqMatch ? seqMatch[1] : '0001';
            parsed.no = `${seq}/IM/BAZNAS-KS/${currentMonth}/${currentYear}`;
          }

          setMemoData(parsed);
        }

        if (recipient.hasInternalMemoPdf && !signedPdfUrl) {
          setIsLoadingFile(true);
          try {
            const { db } = await import('../firebase');
            const { doc, getDoc } = await import('firebase/firestore');
            const scanRef = doc(db, 'recipients', recipient.id, 'scans', 'memo');
            const snap = await getDoc(scanRef);
            if (snap.exists() && snap.data()?.base64) {
              setSignedPdfUrl(snap.data().base64);
            } else {
              const legacyPdf = await storage.getItem(`memo_signed_pdf_${recipient.id}`);
              if (legacyPdf) setSignedPdfUrl(legacyPdf as string);
            }
          } catch (e) {
            console.error('Failed to load memo signed PDF', e);
          } finally {
            setIsLoadingFile(false);
          }
        } else if (!recipient.hasInternalMemoPdf && !signedPdfUrl) {
          const localPdf = await storage.getItem(`memo_signed_pdf_${recipient.id}`);
          if (localPdf) setSignedPdfUrl(localPdf as string);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadData();
  }, [recipient.id, recipient.hasInternalMemoPdf, signedPdfUrl]);

  useEffect(() => {
    if (signedPdfUrl && signedPdfUrl.startsWith('data:application/pdf')) {
      const getBlob = async () => {
        try {
          const response = await fetch(signedPdfUrl);
          const blob = await response.blob();
          const objUrl = URL.createObjectURL(blob);
          setSignedPdfBlobUrl(objUrl);
        } catch (e) {
          console.error("Error creating blob url for memo pdf:", e);
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
      await storage.setItem(`memo_${recipient.id}`, JSON.stringify(memoData));
      const { saveRecipientTemplateData } = await import('../firebase');
      await saveRecipientTemplateData(recipient.id, 'memo', memoData);
      alert('Tersimpan!');
    } catch (err) {
      alert('Gagal menyimpan');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val);
  };

  const handleSavePdfToServer = async (base64: string | null) => {
    setIsUploading(true);
    try {
      await updateInternalMemoPdf(recipient.id, base64);
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
        await storage.setItem(`memo_signed_pdf_${recipient.id}`, base64);
        await handleSavePdfToServer(base64);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Scan upload error:', error);
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6 bg-slate-900/60 backdrop-blur-sm overflow-hidden animate-in fade-in duration-200 print:absolute print:inset-0 print:p-0 print:bg-white print:overflow-visible print:block">
      <div className="bg-white md:rounded-2xl w-full h-full md:h-[95vh] md:max-w-5xl shadow-2xl flex flex-col flex-1 overflow-hidden relative print:shadow-none print:h-auto print:max-w-none print:overflow-visible print:block">
        <div className="p-4 px-6 border-b border-slate-100 flex items-center gap-4 bg-white shrink-0 shadow-sm print:hidden">
          <div className="flex-1 flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">Internal Memo</h2>
              <p className="text-xs text-slate-500 font-medium">Buat dan cetak Internal Memo.</p>
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

        <div className="flex-1 overflow-y-auto bg-slate-100 p-8 print:p-0 print:bg-white custom-scrollbar flex justify-center print:overflow-visible print:block">
          {viewMode === 'template' ? (
            <div className="w-[800px] bg-white border border-slate-200 shadow-sm print:border-none print:shadow-none min-h-[1131px] p-12 print:p-0 relative font-sans text-black origin-top transform scale-100 print:scale-100 print:w-full">
              
              {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-6">
              <div className="w-[150px]">
                {logo && <img src={logo} alt="Logo" className="w-[120px] object-contain" />}
              </div>
              <div className="flex-1 text-center font-bold">
                <h1 className="text-2xl font-bold">Internal Memo</h1>
                <div className="text-sm font-normal mt-1 w-full justify-center flex">
                  {isEditing ? (
                    <input className="border border-amber-300 bg-amber-50 px-1 text-center w-64 outline-none" value={memoData.no} onChange={e => setMemoData({...memoData, no: e.target.value})} />
                  ) : (
                    <span>No. {memoData.no}</span>
                  )}
                </div>
              </div>
              <div className="w-[150px] flex justify-end">
                <QRCode value={`${window.location.origin}${window.location.pathname}?verify=${recipient.id}`} size={80} />
              </div>
            </div>

            <div className="border border-slate-200 p-8 pt-6">
              <div className="flex justify-between items-start mb-6 text-sm">
                <div className="space-y-0.5">
                  <div className="font-bold">Kepada Yth.</div>
                  <div>
                    {isEditing ? (
                       <input className="border border-amber-300 bg-amber-50 px-1 w-64 outline-none" value={memoData.toPosition} onChange={e => setMemoData({...memoData, toPosition: e.target.value})} />
                    ) : memoData.toPosition}
                  </div>
                  <div>
                    {isEditing ? (
                       <input className="border border-amber-300 bg-amber-50 px-1 w-64 outline-none" value={memoData.toName} onChange={e => setMemoData({...memoData, toName: e.target.value})} />
                    ) : memoData.toName}
                  </div>
                  <div className="font-bold">di Tempat</div>
                </div>
                <div>
                  <div className="flex gap-1 justify-end">
                    <span>Siak Sri Indrapura,</span>
                    {isEditing ? (
                       <input className="border border-amber-300 bg-amber-50 px-1 w-24 outline-none text-right" value={memoData.date} onChange={e => setMemoData({...memoData, date: e.target.value})} />
                    ) : memoData.date}
                  </div>
                </div>
              </div>

              <div className="mb-4 text-sm italic">
                Assalamualaikum warohmatullahi wabarokatuh
              </div>

              <div className="text-sm text-justify leading-relaxed mb-6">
                Teriring salam dan doa semoga senantiasa bapak dalam lindungan Allah <span className="italic">subhanahu wa ta'ala, aamiin ya Rabbal Alamin</span>. Sehubungan dengan pelaksanaan tugas dan fungsi pengelolaan zakat, infak, dan sedekah (ZIS) yang diemban oleh Badan Amil Zakat Nasional (BAZNAS) Kabupaten Siak, dan merujuk pada ketentuan yang termaktub dalam Undang-Undang Nomor 23 Tahun 2011 tentang Pengelolaan Zakat, kami mengajukan permohonan penggunaan hak amil untuk keperluan biaya operasional yang rinciannya sebagai berikut:
              </div>

              <table className="w-full border-collapse border border-black text-sm mb-2">
                <thead>
                  <tr className="bg-white">
                    <th className="border border-black p-2 font-normal text-center">Referensi</th>
                    <th className="border border-black p-2 font-normal text-center">Tanggal</th>
                    <th className="border border-black p-2 font-normal text-center w-1/2">Keterangan</th>
                    <th className="border border-black p-2 font-normal text-center">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-black p-2 text-center">
                       {isEditing ? (
                          <input className="border border-amber-300 bg-amber-50 px-1 w-full text-center outline-none" value={memoData.reference} onChange={e => setMemoData({...memoData, reference: e.target.value})} />
                       ) : memoData.reference}
                    </td>
                    <td className="border border-black p-2 text-center">{memoData.date}</td>
                    <td className="border border-black p-2 uppercase">
                        {isEditing ? (
                          <input className="border border-amber-300 bg-amber-50 px-1 w-full outline-none" value={memoData.description} onChange={e => setMemoData({...memoData, description: e.target.value})} />
                       ) : memoData.description}
                    </td>
                    <td className="border border-black p-2 text-right">
                       {isEditing ? (
                          <input type="number" className="border border-amber-300 bg-amber-50 px-1 w-32 text-right outline-none" value={memoData.amount} onChange={e => setMemoData({...memoData, amount: Number(e.target.value)})} />
                       ) : formatCurrency(memoData.amount)}
                    </td>
                  </tr>
                  <tr className="font-bold">
                    <td colSpan={3} className="border border-black p-2 text-center">Total</td>
                    <td className="border border-black p-2 text-right">{formatCurrency(memoData.amount)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="border border-black p-2 text-sm mb-6 pb-2">
                Terbilang : <span className="italic capitalize">{terbilang(memoData.amount)} Rupiah</span>
              </div>

              <div className="text-sm text-justify leading-relaxed mb-4">
                Demikian dokumen ini dibuat sebagai bentuk pertanggungjawaban kami dalam transparansi pengelolaan anggaran. Atas perhatian kami ucapkan terimakasih.
              </div>

              <div className="mb-6 text-sm italic">
                Wassalamualaikum warahmatullahi wabarakatuh
              </div>

              <table className="w-full border-collapse border border-black text-sm text-left">
                <tbody>
                  <tr>
                    <td className="border border-black p-2 font-normal w-1/4 align-top">Keterangan</td>
                    <td className="border border-black p-2 font-normal w-1/2 align-top">Dibuat oleh</td>
                    <td className="border border-black p-2 font-normal w-1/4 align-top">Disetujui oleh</td>
                  </tr>
                  <tr>
                    <td className="border border-black p-2 font-normal align-top h-24 italic">Tanda tangan</td>
                    <td className="border border-black p-2 font-normal"></td>
                    <td className="border border-black p-2 font-normal"></td>
                  </tr>
                  <tr>
                    <td className="border border-black p-2 font-normal align-top">
                      <div className="italic">Nama</div>
                      <div className="italic">Jabatan</div>
                    </td>
                    <td className="border border-black p-2 font-bold align-top">
                      <div>
                        {isEditing ? (
                           <input className="border border-amber-300 bg-amber-50 px-1 w-full outline-none" value={memoData.creatorName} onChange={e => setMemoData({...memoData, creatorName: e.target.value})} />
                        ) : memoData.creatorName}
                      </div>
                      <div className="font-normal mt-1">
                        {isEditing ? (
                           <input className="border border-amber-300 bg-amber-50 px-1 w-full outline-none" value={memoData.creatorPosition} onChange={e => setMemoData({...memoData, creatorPosition: e.target.value})} />
                        ) : memoData.creatorPosition}
                      </div>
                    </td>
                    <td className="border border-black p-2 font-bold align-top">
                      <div>
                        {isEditing ? (
                           <input className="border border-amber-300 bg-amber-50 px-1 w-full outline-none" value={memoData.approverName} onChange={e => setMemoData({...memoData, approverName: e.target.value})} />
                        ) : memoData.approverName}
                      </div>
                      <div className="font-normal mt-1">
                        {isEditing ? (
                           <input className="border border-amber-300 bg-amber-50 px-1 w-full outline-none" value={memoData.approverPosition} onChange={e => setMemoData({...memoData, approverPosition: e.target.value})} />
                        ) : memoData.approverPosition}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              
            </div>
          </div>
          ) : (
            <div className="max-w-4xl w-full flex gap-6">
              <div className="flex-1 bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center min-h-[600px] border border-slate-200">
                {!signedPdfUrl ? (
                  <div className="text-center max-w-sm">
                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-indigo-100 border-dashed">
                      {isLoadingFile ? (
                        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent animate-spin rounded-full" />
                      ) : (
                        <FileText className="w-10 h-10 text-indigo-300" />
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">
                       {isLoadingFile ? 'Memuat Dokumen dari Cloud...' : 'Belum Ada Scan Internal Memo'}
                    </h3>
                    <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                       {isLoadingFile ? 'Mohon tunggu sebentar, file berukuran besar sedang diproses.' : 'Silakan upload scan Internal Memo yang sudah ditandatangani basah dalam format PDF.'}
                    </p>
                    
                    {!isLoadingFile && (
                      <label className={cn(
                        "flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-bold cursor-pointer transition-all",
                        isUploading ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
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
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold"
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
                        isUploading ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700"
                      )}>
                        {isUploading ? <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent animate-spin rounded-full" /> : <Upload className="w-3.5 h-3.5" />}
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
