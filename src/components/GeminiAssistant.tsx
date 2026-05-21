import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Send, 
  Trash2, 
  BrainCircuit, 
  HelpCircle, 
  FileText, 
  TrendingUp, 
  Users, 
  LayoutDashboard,
  Bot,
  User,
  Loader2
} from "lucide-react";
import { Recipient } from "../types";
import { cn } from "../lib/utils";

interface Message {
  role: "user" | "model";
  content: string;
}

interface GeminiAssistantProps {
  recipients: Recipient[];
}

export default function GeminiAssistant({ recipients }: GeminiAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorHeader, setErrorHeader] = useState<string | null>(null);
  
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Construct summarized database context to keep the payload size optimal
  const getContextPayload = () => {
    try {
      return recipients.map(r => ({
        nama: r.name,
        nik: r.nik,
        sektor: r.sector,
        tipeBantuan: r.aidType,
        program: r.programName,
        kampung: r.kampung,
        danaDiusulkan: r.amountProposed,
        status: r.status,
        tanggalPendaftaran: r.submissionDate
      }));
    } catch (e) {
      return [];
    }
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    setErrorHeader(null);
    const updatedMessages: Message[] = [
      ...messages,
      { role: "user", content: textToSend }
    ];
    setMessages(updatedMessages);
    setInputVal("");
    setLoading(true);

    try {
      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: updatedMessages,
          contextData: getContextPayload()
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Gagal menghubungi server asisten AI.");
      }

      const responseData = await response.json();
      setMessages([
        ...updatedMessages,
        { role: "model", content: responseData.text || "Pesan kosong diterima dari asisten." }
      ]);
    } catch (err: any) {
      setErrorHeader(err.message || "Terjadi kesalahan koneksi internet atau server.");
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
    setErrorHeader(null);
  };

  // Preset prompts for easier use
  const quickQuestions = [
    {
      title: "Ringkasan Penerima",
      query: "Berikan ringkasan eksekutif tentang seluruh data Mustahik di platform Si-PANDAI saat ini dalam bentuk poin-poin yang mudah dipahami.",
      icon: Users,
      color: "text-emerald-500 bg-emerald-50 border-emerald-100"
    },
    {
      title: "Total Usulan Dana",
      query: "Berapa total nominal usulan dana bantuan (amount proposed) untuk seluruh mustahik di sistem? Kelompokkan berdasarkan program bidangnya (Siak Sehat, Sejahtera, dll) serta hitung rata-ratanya.",
      icon: TrendingUp,
      color: "text-indigo-500 bg-indigo-50 border-indigo-100"
    },
    {
      title: "Mustahik Siak Sehat",
      query: "Tolong sebutkan siapa saja nama-nama mustahik yang berada di program Bidang Siak Sehat beserta nominal bantuan yang mereka usulkan.",
      icon: Sparkles,
      color: "text-amber-500 bg-amber-50 border-amber-100"
    },
    {
      title: "Analisis Status Berkas",
      query: "Analisis status kesiapan berkas mustahik saat ini (Draft, DISETUJUI, MENUNGGU VERIFIKASI) dan berikan saran penanganan operasional untuk mempercepat pencairan (E-PPD).",
      icon: FileText,
      color: "text-sky-500 bg-sky-50 border-sky-100"
    },
  ];

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md flex flex-col h-[calc(100vh-14rem)] min-h-[500px]">
      
      {/* Header Panel */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-3xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-100">
            <BrainCircuit className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-1.5">
              Asisten Cerdas AI Gemini
              <span className="text-[9px] bg-indigo-100 text-indigo-700 font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                Real-Time
              </span>
            </h3>
            <p className="text-xs text-slate-400 font-semibold">
              Kecerdasan Buatan Terintegrasi dengan Database Mustahik Si-PANDAI
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-slate-200 hover:border-red-100 shadow-sm"
            title="Bersihkan Semua Chat"
          >
            <Trash2 className="w-4 h-4" />
            <span>Sesi Baru</span>
          </button>
        )}
      </div>

      {errorHeader && (
        <div className="p-4 bg-rose-50 border-b border-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
          <p className="flex-1">
            <strong>Koneksi Gagal:</strong> {errorHeader}
          </p>
        </div>
      )}

      {/* Conversation Thread / Welcome Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/15">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center max-w-2xl mx-auto py-8">
            <div className="text-center space-y-3 mb-8">
              <div className="w-14 h-14 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <Sparkles className="w-7 h-7" />
              </div>
              <h4 className="text-xl font-black text-slate-800">
                Halo! Saya Asisten AI Gemini Anda 🌟
              </h4>
              <p className="text-sm text-slate-500 leading-relaxed max-w-lg mx-auto font-medium">
                Punya pertanyaan mengenai Mustahik, anggaran bantuan, atau analisis data di Kabupaten Siak?
                Saya siap membantu menganalisis secara instan berdasarkan data real-time sistem saat ini (<strong>{recipients.length} Mustahik terdaftar</strong>).
              </p>
            </div>

            {/* Quick Presets Grid */}
            <div className="space-y-3">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 pl-1.5">
                <HelpCircle className="w-3.5 h-3.5" /> Klik Pertanyaan Cepat di bawah ini:
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {quickQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(q.query)}
                    className="p-4 bg-white hover:bg-slate-50/80 border border-slate-200/80 hover:border-indigo-300 rounded-2xl text-left transition-all hover:shadow-md cursor-pointer flex gap-3 text-sm group"
                  >
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border", q.color)}>
                      <q.icon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-extrabold text-slate-800 group-hover:text-indigo-600 transition-colors">
                        {q.title}
                      </p>
                      <p className="text-xs text-slate-400 font-semibold truncate">
                        {q.query}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto">
            {messages.map((m, i) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={i}
                  className={cn(
                    "flex gap-4 items-start",
                    isUser ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  {/* Avatar Icon */}
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center border font-bold text-xs shrink-0 shadow-sm",
                      isUser
                        ? "bg-slate-900 border-slate-950 text-white"
                        : "bg-indigo-50 border-indigo-100 text-indigo-600"
                    )}
                  >
                    {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  {/* Message Bubble wrapper */}
                  <div className={cn(
                    "flex flex-col max-w-[85%] space-y-1",
                    isUser ? "items-end" : "items-start"
                  )}>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">
                      {isUser ? "Anda" : "Asisten Gemini"}
                    </span>
                    <div
                      className={cn(
                        "p-4 rounded-2xl text-slate-700 text-sm leading-relaxed whitespace-pre-wrap shadow-sm",
                        isUser
                          ? "bg-slate-900 text-slate-50 rounded-tr-none border border-slate-950 font-medium"
                          : "bg-white border border-slate-200 rounded-tl-none font-medium prose prose-slate max-w-none"
                      )}
                    >
                      {m.content}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* AI Generation Loading Indicator */}
            {loading && (
              <div className="flex gap-4 items-start">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 animate-spin">
                  <Loader2 className="w-4 h-4" />
                </div>
                <div className="flex flex-col space-y-1 animate-pulse">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    Gemini sedang berpikir...
                  </span>
                  <div className="p-4 bg-indigo-50/40 border border-indigo-100/50 rounded-2xl rounded-tl-none text-xs text-indigo-600/80 font-bold flex items-center gap-2">
                    Menganalisis data mustahik & merangkum respon...
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input Form area */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/30 rounded-b-3xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(inputVal);
          }}
          className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-all shadow-inner"
        >
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={
              loading
                ? "Asisten Gemini sedang menyusun analisis..."
                : "Tulis pertanyaan Anda tentang data Mustahik atau program..."
            }
            className="flex-1 bg-transparent border-none outline-none py-2 px-3 text-sm text-slate-700 placeholder-slate-400 font-semibold"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!inputVal.trim() || loading}
            className={cn(
              "p-2.5 rounded-xl text-white font-bold flex items-center justify-center transition-all shadow-sm scale-100 hover:scale-105 active:scale-95 cursor-pointer",
              inputVal.trim() && !loading
                ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            )}
            title="Kirim Pesan"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <p className="text-[10px] text-slate-400 font-semibold text-center mt-2">
          Asisten Gemini ini tidak akan membocorkan data pribadi di luar sesi ini. Pastikan Anda menyematkan kunci API di Settings ke server dev.
        </p>
      </div>

    </div>
  );
}
