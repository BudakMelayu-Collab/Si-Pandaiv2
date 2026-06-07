import React, { useState, useRef, useEffect } from 'react';
import { Camera, FileText, CheckCircle2, X, RefreshCw, ZoomIn, ArrowRight, CornerDownRight } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

type DocumentType = 'KTP' | 'KK' | 'A4' | 'F4';
type Orientation = 'landscape' | 'portrait';

export default function MobileScanner() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionValid, setSessionValid] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Custom Doc setup
  const [docType, setDocType] = useState<DocumentType>('KTP');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  
  // Image states
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Drag state
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const session = params.get('session');
      if (session) {
        setSessionId(session);
        validateSession(session);
      } else {
        setLoading(false);
      }
    }
  }, []);

  // Sync orientation based on default doc standard
  useEffect(() => {
    if (docType === 'KTP') {
      setOrientation('landscape');
    } else if (docType === 'KK') {
      setOrientation('landscape'); // KK usually held landscape
    } else {
      setOrientation('portrait'); // A4 & F4 letters are usually portrait
    }
    // Reset cropping adjustments
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }, [docType]);

  const validateSession = async (session: string) => {
    try {
      const ref = doc(db, 'ocr_sessions', session);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setSessionValid(true);
      } else {
        setSessionValid(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setRawImageSrc(event.target.result as string);
          setZoom(1);
          setOffsetX(0);
          setOffsetY(0);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Drag handlers for manual adjustments of the photo
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startX.current = clientX - offsetX;
    startY.current = clientY - offsetY;
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setOffsetX(clientX - startX.current);
    setOffsetY(clientY - startY.current);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  // Extract the cropped viewport area via Canvas API
  const cropAndUpload = async () => {
    const container = containerRef.current;
    const displayImg = imgRef.current;
    if (!rawImageSrc || !displayImg || !container || !sessionId) return;
    setUploading(true);

    try {
      const img = new Image();
      img.src = rawImageSrc;
      
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const W_img = displayImg.clientWidth;
      const H_img = displayImg.clientHeight;
      const W_mask = container.clientWidth;
      const H_mask = container.clientHeight;

      if (W_img === 0 || H_img === 0 || W_mask === 0 || H_mask === 0) {
        throw new Error('Elemen gambar atau pembungkus tidak memiliki dimensi layout.');
      }

      // Maintain the EXACT same aspect ratio as the onscreen mask to prevent any skew/distortion
      // Scale factor of 4x produces highly legible text for Gemini OCR
      const scaleFactor = 4;
      const canvasWidth = Math.round(W_mask * scaleFactor);
      const canvasHeight = Math.round(H_mask * scaleFactor);

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Compute uniform scaling factor from onscreen layout to natural image dimensions
        const scale = img.naturalWidth / (W_img * zoom);

        // Calculate source box on the original high-res image
        const sourceX = ((W_img * zoom) / 2 - W_mask / 2 - offsetX) * scale;
        const sourceY = ((H_img * zoom) / 2 - H_mask / 2 - offsetY) * scale;
        const sourceWidth = W_mask * scale;
        const sourceHeight = H_mask * scale;

        // Apply high-fidelity cropping coordinates
        let sX = sourceX;
        let sY = sourceY;
        let sW = sourceWidth;
        let sH = sourceHeight;

        let dX = 0;
        let dY = 0;
        let dW = canvasWidth;
        let dH = canvasHeight;

        // Safely clamp the cropping coordinates to prevent drawing outside source image boundaries (which causes transparent/black edges)
        if (sX < 0) {
          const shiftPx = -sX;
          const shiftRatio = shiftPx / sW;
          dX += dW * shiftRatio;
          dW -= dW * shiftRatio;
          sW -= shiftPx;
          sX = 0;
        }
        if (sY < 0) {
          const shiftPx = -sY;
          const shiftRatio = shiftPx / sH;
          dY += dH * shiftRatio;
          dH -= dH * shiftRatio;
          sH -= shiftPx;
          sY = 0;
        }
        if (sX + sW > img.naturalWidth) {
          const excessPx = (sX + sW) - img.naturalWidth;
          const excessRatio = excessPx / sW;
          dW -= dW * excessRatio;
          sW -= excessPx;
        }
        if (sY + sH > img.naturalHeight) {
          const excessPx = (sY + sH) - img.naturalHeight;
          const excessRatio = excessPx / sH;
          dH -= dH * excessRatio;
          sH -= excessPx;
        }

        if (sW > 0 && sH > 0 && dW > 0 && dH > 0) {
          ctx.drawImage(img, sX, sY, sW, sH, dX, dY, dW, dH);
        }
      }

      const quality = docType === 'KTP' ? 0.95 : 0.88; // Keep high quality to preserve clarity
      const finalBase64 = canvas.toDataURL('image/jpeg', quality);

      // Save to Firebase Firestore under preconfigured ocr_sessions
      const ref = doc(db, 'ocr_sessions', sessionId);
      await updateDoc(ref, {
        status: 'updated',
        lastUpdated: new Date().toISOString()
      });

      const snap = await getDoc(ref);
      if (snap.exists()) {
        const currentDocs = snap.data().documents || [];
        
        let labelName = 'Dokumen Terscan';
        if (docType === 'KTP') labelName = 'KTP (Draft Scan HP)';
        else if (docType === 'KK') labelName = 'KK (Draft Scan HP)';
        else if (docType === 'A4') labelName = 'Berkas A4 (Draft Scan HP)';
        else if (docType === 'F4') labelName = 'Berkas F4 (Draft Scan HP)';

        const newDoc = {
          id: `SCAN-${Date.now()}`,
          name: labelName,
          type: docType,
          fileUrl: finalBase64,
          uploadedAt: new Date().toISOString()
        };

        await updateDoc(ref, {
          documents: [...currentDocs, newDoc]
        });

        setSuccessMsg(`Berhasil mengunggah dokumen ${docType}!`);
        setRawImageSrc(null); // Return to camera selection
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err) {
      console.error(err);
      alert('Gagal memproses dan mengunggah gambar');
    } finally {
      setUploading(false);
    }
  };

  // Return appropriate height ratios for document masks
  const getMaskAspectRatio = () => {
    if (docType === 'KTP') {
      return orientation === 'landscape' ? 'aspect-[1.58/1]' : 'aspect-[1/1.58]';
    }
    if (docType === 'KK') {
      return orientation === 'landscape' ? 'aspect-[1.5/1]' : 'aspect-[1/1.5]';
    }
    // A4 (Standard 1:1.414)
    if (docType === 'A4') {
      return orientation === 'landscape' ? 'aspect-[1.414/1]' : 'aspect-[1/1.414]';
    }
    // F4 (Indonesian Folio paper: 21.5cm x 33cm = ~1:1.53)
    if (docType === 'F4') {
      return orientation === 'landscape' ? 'aspect-[1.53/1]' : 'aspect-[1/1.53]';
    }
    return 'aspect-[1/1.414]';
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-white rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400 font-medium">Memeriksa sesi registrasi...</p>
      </div>
    );
  }

  if (!sessionId || !sessionValid) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center p-6 text-center bg-slate-900 text-white">
        <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-700 max-w-sm space-y-4">
          <X className="w-16 h-16 text-rose-500 mx-auto" />
          <h2 className="text-2xl font-black tracking-tight text-white">Sesi Tidak Valid</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Qr code kedaluwarsa atau sesi tidak ditemukan. Silakan buka tab "Input via HP" di aplikasi Baznas untuk memindai ulang.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header Area */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-6 shrink-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight leading-none uppercase">Scanner HP</h1>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 block">Baznas Siak</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Tersambung</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-6 max-w-md w-full mx-auto overflow-y-auto">
        {!rawImageSrc ? (
          /* SECTION A: Template & Camera Capture Selection */
          <div className="w-full space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-extrabold tracking-tight">Pilih Ukuran & Ambil Foto</h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                Kamera ini dikalibrasi khusus untuk memotong dokumen KTP, KK, atau Kertas berkas standard A4/F4 secara presisi.
              </p>
            </div>

            {/* Document presets / template buttons */}
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-3xl space-y-4 shadow-xl">
              <div>
                <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Jenis Area Dokumen</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    { id: 'KTP', label: 'KTP (Kecil)', desc: 'Asitektur standard' },
                    { id: 'KK', label: 'Kartu Keluarga', desc: 'Presisi landscape' },
                    { id: 'A4', label: 'Berkas Ukuran A4', desc: 'Portrait standard' },
                    { id: 'F4', label: 'Berkas Ukuran F4', desc: 'Folio Indonesian' }
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setDocType(preset.id as DocumentType)}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        docType === preset.id
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <p className="font-extrabold text-sm">{preset.label}</p>
                      <p className="text-[10px] opacity-70 mt-0.5 font-medium">{preset.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Orientation toggle */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Orientasi Bidik</label>
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setOrientation('landscape')}
                      className={`py-1 px-3 rounded-lg text-xs font-bold transition-all ${
                        orientation === 'landscape' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Landscape
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientation('portrait')}
                      className={`py-1 px-3 rounded-lg text-xs font-bold transition-all ${
                        orientation === 'portrait' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Portrait
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Target guidance overlay draft so user knows what to expect */}
            <div className="bg-slate-900/50 border border-slate-800/80 p-3 rounded-2xl flex items-center gap-3">
              <div className="bg-indigo-950 p-2.5 rounded-xl border border-indigo-900 text-indigo-400">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-black uppercase text-slate-300">Format Area Yang Terscan</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate uppercase font-mono">
                  {docType} ({orientation}) &bull; Potongan Presisi
                </p>
              </div>
            </div>

            {/* Camera File capture trigger */}
            <div className="space-y-4">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                className="hidden"
                onChange={handleCapture}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-extrabold py-5 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-900/40 cursor-pointer"
              >
                <Camera className="w-6 h-6" />
                <span className="text-lg font-bold tracking-tight">Buka Kamera HP</span>
              </button>
            </div>
          </div>
        ) : (
          /* SECTION B: Interactive Cropping Area & Adjustments */
          <div className="w-full space-y-6 animate-in fade-in zoom-in-95 duration-300 flex flex-col">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-black tracking-tight flex items-center justify-center gap-2">
                Atur Area Scanner {docType}
              </h3>
              <p className="text-[11px] text-slate-400">
                Gunakan cubitan jari (drag layar) untuk menggeser dokumen agar pas di dalam garis kotak.
              </p>
            </div>

            {/* Crop Overlay Container */}
            <div className="relative w-full aspect-[4/3] bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center">
              
              {/* Dynamic Overlay Mask matching selection ratio */}
              <div 
                ref={containerRef}
                className={`w-[85%] border-2 border-dashed border-yellow-400 bg-black/40 relative z-10 transition-all shadow-[0_0_0_9999px_rgba(15,23,42,0.85)] pointer-events-none rounded-xl overflow-hidden ${getMaskAspectRatio()}`}
              >
                {/* Laser line guidance */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-yellow-400/80 animate-ping shadow-[0_0_8px_#facc15]"></div>
                
                {/* Corner guide highlights */}
                <div className="absolute top-1 left-1 w-3.5 h-3.5 border-t-4 border-l-4 border-yellow-400 rounded-tl-sm"></div>
                <div className="absolute top-1 right-1 w-3.5 h-3.5 border-t-4 border-r-4 border-yellow-400 rounded-tr-sm"></div>
                <div className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-4 border-l-4 border-yellow-400 rounded-bl-sm"></div>
                <div className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-4 border-r-4 border-yellow-400 rounded-br-sm"></div>
                
                {/* Visual Label Indicator inside viewport */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] tracking-widest font-bold uppercase py-1 px-2.5 bg-slate-900/90 text-yellow-400 rounded-lg border border-yellow-400/30">
                    Area Scan {docType}
                  </span>
                </div>
              </div>

              {/* Interactive Image underlay */}
              <div 
                className="absolute inset-0 flex items-center justify-center cursor-move"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
              >
                <img
                  ref={imgRef}
                  src={rawImageSrc || undefined}
                  alt="Raw Document"
                  className="max-h-full max-w-full select-none pointer-events-none transition-transform pointer-events-none duration-75"
                  style={{
                    transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`,
                  }}
                />
              </div>
            </div>

            {/* Quick Adjustment Controls */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl space-y-4 shadow-lg">
              <div className="flex items-center gap-4">
                <ZoomIn className="w-5 h-5 text-slate-400 shrink-0" />
                <span className="text-xs font-bold text-slate-300 w-12 text-center">Zoom: {zoom.toFixed(1)}x</span>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => { setOffsetX(0); setOffsetY(0); setZoom(1); }}
                  className="px-4 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all text-slate-300"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Atur Ulang Posisi
                </button>
              </div>
            </div>

            {/* Operations CTA */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRawImageSrc(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all text-sm border border-slate-700 cursor-pointer"
              >
                Ulangi Foto
              </button>

              <button
                type="button"
                onClick={cropAndUpload}
                disabled={uploading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-2xl transition-all text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Proses...
                  </>
                ) : (
                  <>
                    <span>Simpan & Kirim</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Global Floating Success Toast */}
        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-2xl flex items-center gap-3 w-full self-stretch animate-in fade-in slide-in-from-bottom-2">
             <CheckCircle2 className="w-5 h-5 shrink-0" />
             <p className="font-extrabold text-xs tracking-wide">{successMsg}</p>
          </div>
        )}

        {/* App sync descriptor info */}
        {!rawImageSrc && (
          <footer className="w-full text-center py-2">
            <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest leading-relaxed">
              Dokumen yang berhasil dipotong akan langsung tampil di menu input utama pendaftaran.
            </p>
          </footer>
        )}
      </main>
    </div>
  );
}
