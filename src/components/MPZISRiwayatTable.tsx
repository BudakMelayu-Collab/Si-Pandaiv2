import React, { useState } from "react";
import { Recipient } from "../types";
import {
  ChevronDown,
  ChevronRight,
  FileCheck,
  Eye,
  Edit3,
  Copy,
  Trash2,
} from "lucide-react";
import { isRecipientFileTracked } from "../lib/utils";

interface MPZISRiwayatTableProps {
  data: Recipient[];
  sectorName?: string;
  onEditGroup?: (group: Recipient[]) => void;
  onDuplicateGroup?: (group: Recipient[]) => void;
  onDeleteRecipient?: (rec: Recipient) => void;
  onViewDetail?: (rec: Recipient) => void;
}

export default function MPZISRiwayatTable({
  data,
  sectorName = "Siak Cerdas",
  onEditGroup,
  onDuplicateGroup,
  onDeleteRecipient,
  onViewDetail,
}: MPZISRiwayatTableProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [mpzisDataMap, setMpzisDataMap] = useState<Record<string, any>>({});

  // Only include recipients that have MPZIS tracked
  const mpzisRecipients = data.filter((r) =>
    isRecipientFileTracked(r, "mpzis"),
  );

  const mpzisRecipientsKey = mpzisRecipients
    .map((r) => `${r.id}-${r.isMPZISGenerated ? "Y" : "N"}-${r.updatedAt || ""}`)
    .join(",");

  React.useEffect(() => {
    let active = true;
    const unsubscribes: (() => void)[] = [];

    const loadData = async () => {
      const { doc, onSnapshot } = await import("firebase/firestore");
      const { db, getRecipientTemplateData } = await import("../firebase");
      const { getItem } = await import("../lib/storage");

      const newMap: Record<string, any> = {};

      for (const r of mpzisRecipients) {
        if (newMap[r.id]) continue;

        let savedData = null;
        try {
          savedData = await getRecipientTemplateData(r.id, "mpzis");
        } catch (e) {}

        if (!savedData) {
          savedData =
            (await getItem(`mpzis_memo_${r.id}`)) ||
            (await getItem(`mpzis_data_${r.id}`));
        }

        if (savedData) {
          try {
            newMap[r.id] =
              typeof savedData === "string" ? JSON.parse(savedData) : savedData;
          } catch (e) {}
        }
      }

      if (active) {
        setMpzisDataMap((prev) => ({ ...prev, ...newMap }));
      }

      // Set up real-time listener for each recipient's templates/mpzis
      mpzisRecipients.forEach((r) => {
        try {
          const unsub = onSnapshot(
            doc(db, "recipients", r.id, "templates", "mpzis"),
            (docSnap) => {
              if (active && docSnap.exists()) {
                const snapData = docSnap.data();
                if (snapData && snapData.data) {
                  setMpzisDataMap((prev) => ({
                    ...prev,
                    [r.id]: snapData.data,
                  }));
                }
              }
            },
            (err) => {
              console.warn(`Error in onSnapshot for recipient ${r.id}:`, err);
            }
          );
          unsubscribes.push(unsub);
        } catch (e) {
          console.error(e);
        }
      });
    };

    loadData();

    return () => {
      active = false;
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [mpzisRecipients.length, mpzisRecipientsKey]);

  // Group by registrationId
  const groups: Record<string, Recipient[]> = {};
  mpzisRecipients.forEach((r) => {
    if (!groups[r.registrationId]) groups[r.registrationId] = [];
    groups[r.registrationId].push(r);
  });

  const groupIds = Object.keys(groups);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
        <FileCheck className="w-5 h-5 text-indigo-600" />
        <h3 className="font-bold text-slate-800">Riwayat MPZIS {sectorName}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200 text-slate-600">
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                No.
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                No Reg
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                No. MPZIS
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                Tanggal
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                Klasifikasi Program
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                Tujuan Penyaluran
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                Ashnaf
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                Sumber Dana
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                Post Anggaran RKAT
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                Jenis Transaksi
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap text-center">
                Penerima Dana
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap text-center">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groupIds.map((regId, index) => {
              const group = groups[regId];
              const first = group[0];
              const isExpanded = !!expandedRows[regId];

              const isTransfer = group.some((r) => r.bankAccountNo);
              
              const getBidangCode = (sector: string) => {
                switch(sector?.toLowerCase()) {
                  case 'siak cerdas': return 'SC';
                  case 'siak dakwah': return 'SD';
                  case 'siak peduli': return 'SP';
                  case 'siak sehat': return 'SS';
                  case 'siak sejahtera': return 'SJ';
                  default: return 'SC';
                }
              };
              const getRomanMonth = (month: number) => {
                const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
                return romans[month - 1] || 'I';
              };
              
              const dateObj = new Date(first.submissionDate || new Date());
              let mpzisNo = `${first.registrationId}/001/MPZIS/${getBidangCode(first.sector || '')}/${getRomanMonth(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`;
              
              // Calculate total amount from memo data or item props
              const mpzisData = mpzisDataMap[first.id];
              let mpzisKlasifikasi = first.sector || "-";
              let mpzisTujuanPenyaluran = first.programName ? `Melaksanakan Program ${first.programName}` : "-";
              let mpzisAshnaf = first.ashnaf || "-";
              let mpzisSumberDana = first.fundingSource || "-";
              let mpzisPosAnggaran = first.programName || "-";

              if (mpzisData) {
                 if (mpzisData.nomor) {
                    mpzisNo = mpzisData.nomor;
                    if (mpzisNo.includes('BDG.')) {
                       mpzisNo = mpzisNo.replace(/BDG\.\d/g, getBidangCode(first.sector || ''));
                    }
                 }
                 if (mpzisData.classification) mpzisKlasifikasi = mpzisData.classification;
                 if (mpzisData.purpose) mpzisTujuanPenyaluran = mpzisData.purpose;
                 if (mpzisData.ashnaf) mpzisAshnaf = mpzisData.ashnaf;
                 if (mpzisData.source) mpzisSumberDana = mpzisData.source;
                 if (mpzisData.budgetPost) mpzisPosAnggaran = mpzisData.budgetPost;
              }

              let displayRows = [];
              if (mpzisData && mpzisData.rows && mpzisData.rows.length > 0) {
                 displayRows = mpzisData.rows.map((r: any, i: number) => ({
                    id: r.id || `row-${i}`,
                    purpose: r.description || "-",
                    name: r.name || "-",
                    nik: r.nik || "-",
                    displayAmount: Number(r.amount) || 0
                 }));
              } else {
                 displayRows = group.map(item => ({
                    id: item.id,
                    purpose: item.purpose || first.purpose || "-",
                    name: item.name,
                    nik: item.nik || item.kk || "-",
                    displayAmount: Number(item.amountProposed) || 0
                 }));
              }

              const totalBantuan = displayRows.reduce(
                (sum, item) => sum + (item.displayAmount || 0),
                0,
              );

              return (
                <React.Fragment key={regId}>
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-600 whitespace-nowrap text-center">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-900 whitespace-nowrap">
                      {first.registrationId}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-600 whitespace-nowrap">
                      {mpzisNo}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-600 whitespace-nowrap">
                      {new Date(first.submissionDate).toLocaleDateString(
                        "id-ID",
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-600 whitespace-nowrap">
                      {mpzisKlasifikasi}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-600 min-w-[400px] max-w-[600px] whitespace-normal">
                      <div className="line-clamp-2" title={mpzisTujuanPenyaluran}>
                        {mpzisTujuanPenyaluran}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-600 whitespace-nowrap">
                      {mpzisAshnaf}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-600 whitespace-nowrap">
                      {mpzisSumberDana}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-600 whitespace-nowrap">
                      {mpzisPosAnggaran}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <span
                        className={`px-2 py-1 rounded-full text-[9px] uppercase font-bold tracking-wider ${isTransfer ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}
                      >
                        {isTransfer ? "TRANSFER" : "TUNAI"}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex justify-center whitespace-nowrap">
                      <button
                        onClick={() => toggleRow(regId)}
                        className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg transition-colors border ${isExpanded ? "bg-indigo-500 text-white border-indigo-600" : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50"}`}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                        {displayRows.length} Orang
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onViewDetail && onViewDetail(first)}
                          className="inline-flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 p-1.5 rounded-lg focus:outline-none transition-colors"
                          title="Lihat Detail"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onViewDetail && onViewDetail(first)}
                          className="inline-flex items-center justify-center bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 p-1.5 rounded-lg focus:outline-none transition-colors"
                          title="Edit Template MPZIS"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            onDuplicateGroup && onDuplicateGroup(group)
                          }
                          className="inline-flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 p-1.5 rounded-lg focus:outline-none transition-colors"
                          title="Duplicate"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            onDeleteRecipient && onDeleteRecipient(first)
                          }
                          className="inline-flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 p-1.5 rounded-lg focus:outline-none transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={12} className="p-0 bg-slate-50/80">
                        <div className="p-4 border-t border-indigo-100 shadow-inner">
                          <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider px-1">
                            
                          </h4>
                          <table className="w-full text-left bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                            <thead className="bg-slate-100">
                              <tr>
                                <th className="px-4 py-2.5 text-[11px] font-normal text-slate-700 border-b border-slate-200 w-12 text-center whitespace-nowrap">
                                  No.
                                </th>
                                <th className="px-4 py-2.5 text-[11px] font-normal text-slate-700 border-b border-slate-200 whitespace-nowrap">
                                  Uraian
                                </th>
                                <th className="px-4 py-2.5 text-[11px] font-normal text-slate-700 border-b border-slate-200 whitespace-nowrap">
                                  Nama
                                </th>
                                <th className="px-4 py-2.5 text-[11px] font-normal text-slate-700 border-b border-slate-200 whitespace-nowrap">
                                  Identitas
                                </th>
                                <th className="px-4 py-2.5 text-[11px] font-normal text-slate-700 border-b border-slate-200 text-right whitespace-nowrap">
                                  Jumlah Bantuan
                                </th>
                                <th className="px-4 py-2.5 text-[11px] font-normal text-slate-700 border-b border-slate-200 text-center whitespace-nowrap">
                                  Aksi
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {displayRows.map((item, index) => (
                                <tr
                                  key={item.id}
                                  className="hover:bg-slate-50/50"
                                >
                                  <td className="px-4 py-2 text-[11px] font-normal text-slate-500 text-center whitespace-nowrap">
                                    {index + 1}
                                  </td>
                                  <td className="px-4 py-2 text-[11px] font-normal text-slate-600 min-w-[400px] max-w-[600px] whitespace-normal">
                                    <div className="line-clamp-2" title={item.purpose}>
                                      {item.purpose}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-[11px] font-normal text-slate-800 whitespace-nowrap">
                                    {item.name}
                                  </td>
                                  <td className="px-4 py-2 text-[11px] font-normal text-slate-600 whitespace-nowrap">
                                    {item.nik}
                                  </td>
                                  <td className="px-4 py-2 text-[11px] font-normal text-emerald-600 text-right whitespace-nowrap">
                                    Rp{" "}
                                    {item.displayAmount?.toLocaleString(
                                      "id-ID",
                                    ) || 0}
                                  </td>
                                  <td className="px-4 py-2 flex justify-center">
                                    <button
                                      onClick={() =>
                                        onDeleteRecipient &&
                                        onDeleteRecipient(item)
                                      }
                                      className="inline-flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 p-1.5 rounded-lg focus:outline-none transition-colors"
                                      title="Hapus Penerima Ini"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-emerald-50/50">
                              <tr>
                                <td
                                  colSpan={4}
                                  className="px-4 py-3 text-xs font-bold text-slate-700 text-right uppercase tracking-wider"
                                >
                                  Total Bantuan:
                                </td>
                                <td
                                  colSpan={2}
                                  className="px-4 py-3 text-sm font-black text-emerald-700 text-left border-t border-emerald-200"
                                >
                                  Rp {totalBantuan.toLocaleString("id-ID")}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {groupIds.length === 0 && (
              <tr>
                <td
                  colSpan={12}
                  className="px-4 py-8 text-center text-sm font-medium text-slate-500 bg-white"
                >
                  Belum ada riwayat MPZIS untuk{" "}
                  {data.length > 0 ? data[0].sector : "Program Ini"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
