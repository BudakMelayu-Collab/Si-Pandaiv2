import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Recipient } from '../types';
import { CheckCircle2, XCircle, AlertTriangle, FileText, Calendar, User, MapPin } from 'lucide-react';

interface VerificationLandingPageProps {
  recipientId: string;
}

export default function VerificationLandingPage({ recipientId }: VerificationLandingPageProps) {
  const [status, setStatus] = useState<'loading' | 'success' | 'not-found' | 'error'>('loading');
  const [recipient, setRecipient] = useState<Recipient | null>(null);

  useEffect(() => {
    const fetchRecipient = async () => {
      try {
        const docRef = doc(db, 'recipients', recipientId);
        const snapshot = await getDoc(docRef);
        
        if (snapshot.exists()) {
          setRecipient({ id: snapshot.id, ...snapshot.data() } as Recipient);
          setStatus('success');
        } else {
          setStatus('not-found');
        }
      } catch (error) {
        console.error("Verification error:", error);
        setStatus('error');
      }
    };

    fetchRecipient();
  }, [recipientId]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium animate-pulse text-sm">Memverifikasi Dokumen...</p>
        </div>
      </div>
    );
  }

  if (status === 'not-found' || status === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col pt-12 items-center px-6 font-sans">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <XCircle className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-black text-slate-800 mb-2 text-center">Dokumen Tidak Ditemukan</h1>
        <p className="text-slate-500 text-center max-w-sm mb-8">
          Sistem tidak dapat memverifikasi QR Code ini. Dokumen mungkin tidak valid, sudah kadaluarsa, atau telah dihapus dari sistem BAZNAS Kabupaten Siak.
        </p>
        <button 
          onClick={() => window.location.href = '/'}
          className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm"
        >
          Kembali ke Beranda
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-900 pb-24 border-t-8 border-indigo-600">
      <div className="p-6 pb-12 mt-8 max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-100/50">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-2">
            Dokumen Terverifikasi
          </h1>
          <p className="text-emerald-700 font-bold bg-emerald-50 inline-block px-4 py-1.5 rounded-full text-sm border border-emerald-200">
            Resmi Terdaftar di Sistem BAZNAS Kabupaten Siak
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nomor Registrasi</p>
              <p className="text-lg font-mono font-bold text-slate-800">{recipient?.registrationId}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Status Salurkan</p>
              <div className="inline-flex items-center gap-1.5">
                <div className={'w-2 h-2 rounded-full ' + (recipient?.status === 'Disetujui' ? 'bg-emerald-500' : recipient?.status === 'Ditolak' ? 'bg-red-500' : 'bg-amber-500')}></div>
                <span className="font-bold text-slate-700">{recipient?.status}</span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-slate-400" />
              </div>
              <div className="pt-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Nama Pemohon</p>
                <p className="text-base font-bold text-slate-800">{recipient?.name}</p>
                <p className="text-sm text-slate-500 mt-0.5">NIK: {recipient?.nik.replace(/.(?=.{4})/g, '*')}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-slate-400" />
              </div>
              <div className="pt-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Program Bantuan</p>
                <p className="text-base font-bold text-slate-800">{recipient?.programName}</p>
                <p className="text-sm text-slate-500 mt-0.5">Bidang: {recipient?.sector}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-slate-400" />
              </div>
              <div className="pt-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tanggal Pengajuan</p>
                <p className="text-base font-bold text-slate-800">
                  {recipient?.submissionDate ? new Date(recipient.submissionDate).toLocaleDateString('id-ID', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                  }) : '-'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-slate-400" />
              </div>
              <div className="pt-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Alamat Pemohon</p>
                <p className="text-base font-bold text-slate-800 leading-relaxed max-w-sm">
                  {recipient?.address}, RT {recipient?.rt}/RW {recipient?.rw}, {recipient?.kampung}, Kec. {recipient?.district}
                </p>
              </div>
            </div>
          </div>
          
          <div className="mt-10 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-start gap-3">
             <AlertTriangle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
             <p className="text-xs text-indigo-800 leading-relaxed">
               Halaman ini merupakan bukti sah bahwa permohonan bantuan ini tercatat resmi di pangkalan data (database) BAZNAS Kabupaten Siak.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
