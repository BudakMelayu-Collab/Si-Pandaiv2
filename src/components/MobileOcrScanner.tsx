import React, { useState, useRef, useEffect } from 'react';
import { Camera, UploadCloud, CheckCircle2, ChevronLeft, Loader2, RefreshCcw } from 'lucide-react';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

export default function MobileOcrScanner() {
  const [session, setSession] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'capturing' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const sid = searchParams.get('session');
    if (sid) {
      setSession(sid);
      startCamera();
    } else {
      setStatus('error');
      setErrorMsg('Sesi tidak valid. Harap scan ulang QR code dari aplikasi desktop.');
    }

    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setStatus('capturing');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      setStatus('error');
      setErrorMsg('Kamera tidak dapat diakses. Pastikan Anda memberikan izin kamera melalui browser.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const compressImage = (base64: string, maxWidth: number = 1200): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
    });
  };

  const takePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !session) return;
    
    // Play shutter sound if supported in mobile browser
    if (navigator.vibrate) navigator.vibrate(50);

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const rawBase64 = canvas.toDataURL('image/jpeg', 0.9);
      
      setStatus('uploading');
      stopCamera();

      try {
        const compressedBase64 = await compressImage(rawBase64);
        // Save to unauthenticated OCR collection
        const ref = doc(db, 'ocr_sessions', session);
        await setDoc(ref, {
          photo: compressedBase64,
          timestamp: Date.now()
        }, { merge: true });

        setStatus('success');
      } catch (e: any) {
        console.error("Upload failed", e);
        setStatus('error');
        setErrorMsg('Gagal mengirim ke komputer. ' + e.message);
      }
    }
  };

  const retake = () => {
    setStatus('idle');
    setErrorMsg('');
    startCamera();
  };

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mb-4">
          <span className="text-2xl">⚠️</span>
        </div>
        <h2 className="text-xl font-bold mb-2">Terjadi Kesalahan</h2>
        <p className="text-slate-400 mb-6">{errorMsg}</p>
        <button onClick={retake} className="px-6 py-3 bg-indigo-600 rounded-xl font-bold">Coba Lagi</button>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-emerald-900 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <CheckCircle2 className="w-12 h-12 text-white" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Foto Berhasil Terkirim!</h2>
        <p className="text-emerald-200 mb-12">Silakan lihat layar komputer Anda. Anda bisa memindai dokumen lain sekarang.</p>
        <button onClick={retake} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold flex items-center gap-2">
          <RefreshCcw className="w-5 h-5" /> Scan Dokumen Lain
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex items-center justify-center">
        <h1 className="text-white font-bold text-lg tracking-wide uppercase">Scan KTP/KK</h1>
      </div>

      <div className="flex-1 relative bg-slate-800">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className="absolute inset-0 w-full h-full object-cover"
        />
        
        {/* Guides overlay */}
        <div className="absolute inset-0 z-10 pointer-events-none flex flex-col">
          <div className="flex-1 bg-black/40"></div>
          <div className="flex justify-between">
            <div className="w-8 bg-black/40"></div>
            <div className="w-full aspect-[4/3] border-4 border border-white/50 relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white -mt-1 -ml-1"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white -mt-1 -mr-1"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white -mb-1 -ml-1"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white -mb-1 -mr-1"></div>
            </div>
            <div className="w-8 bg-black/40"></div>
          </div>
          <div className="flex-1 bg-black/40"></div>
        </div>

        {status === 'uploading' && (
          <div className="absolute inset-0 z-20 bg-black/80 flex flex-col items-center justify-center text-white">
            <Loader2 className="w-12 h-12 animate-spin text-indigo-500 mb-4" />
            <p className="font-bold">Mengirim ke komputer...</p>
          </div>
        )}
      </div>

      <div className="h-32 bg-black flex items-center justify-center pb-4 z-10 relative">
        <button 
          onClick={takePhoto}
          disabled={status !== 'capturing'}
          className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all"
        >
          <div className="w-16 h-16 bg-white rounded-full"></div>
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
