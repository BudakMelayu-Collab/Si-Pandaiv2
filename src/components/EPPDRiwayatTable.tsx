import React, { useState } from "react";
import { Recipient } from "../types";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Eye,
  Edit3,
  Copy,
  Trash2,
} from "lucide-react";
import { isRecipientFileTracked } from "../lib/utils";

interface EPPDRiwayatTableProps {
  data: Recipient[];
  sectorName?: string;
  onEditGroup?: (group: Recipient[]) => void;
  onDuplicateGroup?: (group: Recipient[]) => void;
  onDeleteRecipient?: (rec: Recipient) => void;
  onViewDetail?: (rec: Recipient) => void;
}

export default function EPPDRiwayatTable({
  data,
  sectorName = "Siak Cerdas",
  onEditGroup,
  onDuplicateGroup,
  onDeleteRecipient,
  onViewDetail,
}: EPPDRiwayatTableProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [ppdDataMap, setPpdDataMap] = useState<Record<string, any>>({});

  // Only include recipients that have EPPD tracked
  const eppdRecipients = data.filter((r) => isRecipientFileTracked(r, "eppd"));

  const eppdRecipientsKey = eppdRecipients
    .map((r) => `${r.id}-${r.isEPPDGenerated ? "Y" : "N"}-${r.updatedAt || ""}`)
    .join(",");

  React.useEffect(() => {
    let active = true;
    const unsubscribes: (() => void)[] = [];

    const loadData = async () => {
      const { doc, onSnapshot } = await import("firebase/firestore");
      const { db, getRecipientTemplateData } = await import("../firebase");
      const { getItem } = await import("../lib/storage");

      const newMap: Record<string, any> = {};

      for (const r of eppdRecipients) {
        if (newMap[r.id]) continue;

        let savedData = null;
        try {
          savedData = await getRecipientTemplateData(r.id, "eppd");
        } catch (e) {}

        if (!savedData) {
          savedData = await getItem(`ppd_data_${r.id}`);
        }

        if (savedData) {
          try {
            newMap[r.id] =
              typeof savedData === "string" ? JSON.parse(savedData) : savedData;
          } catch (e) {}
        }
      }

      if (active) {
        setPpdDataMap((prev) => ({ ...prev, ...newMap }));
      }

      // Set up real-time listener for each recipient's templates/eppd
      eppdRecipients.forEach((r) => {
        try {
          const unsub = onSnapshot(
            doc(db, "recipients", r.id, "templates", "eppd"),
            (docSnap) => {
              if (active && docSnap.exists()) {
                const snapData = docSnap.data();
                if (snapData && snapData.data) {
                  setPpdDataMap((prev) => ({
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
  }, [eppdRecipients.length, eppdRecipientsKey]);

  // Group by registrationId
  const groups: Record<string, Recipient[]> = {};
  eppdRecipients.forEach((r) => {
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
        <FileText className="w-5 h-5 text-indigo-600" />
        <h3 className="font-bold text-slate-800">Riwayat E-PPD {sectorName}</h3>
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
                No. PPD
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                Tanggal
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                Tujuan Pengajuan
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                Dibayarkan kepada
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                Mengacu pada No. PPD
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                Mohon Dana Di Keluarkan
              </th>
              <th className="px-4 py-3 text-[11px] font-normal whitespace-nowrap">
                Transfer : No. Rek/Bank/Atas Nama
              </th>
              <th className="px-3 py-3 text-[11px] font-normal whitespace-nowrap">
                Kode Anggaran
              </th>
              <th className="px-3 py-3 text-[11px] font-normal whitespace-nowrap">
                Nama Anggaran
              </th>
              <th className="px-3 py-3 text-[11px] font-normal whitespace-nowrap text-right">
                Sub Total
              </th>
              <th className="px-3 py-3 text-[11px] font-normal whitespace-nowrap text-right">
                Total
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

              const data = ppdDataMap[first.id];

              let displayRows = [];
              if (data && data.lampiranRows && data.lampiranRows.length > 0) {
                 displayRows = data.lampiranRows.map((r: any, i: number) => {
                    const matchedRec = group[i] || first;
                    const rtVal = r.rt || matchedRec.rt || "-";
                    const rwVal = r.rw || matchedRec.rw || "-";
                    const rtRwStr = [rtVal, rwVal].filter(Boolean).filter(x => x !== '-').join('/');
                    const alamatRtRwStr = [r.alamat || matchedRec.address || "-", rtRwStr].filter(Boolean).join(' ');
                    return {
                      id: r.id || `row-${i}`,
                      purpose: first.tujuanPengajuan || first.purpose || "-",
                      name: r.nama || matchedRec.name || "-",
                      nik: r.nik || matchedRec.nik || "-",
                      noHp: r.noHp || matchedRec.contact || "-",
                      alamatRtRw: alamatRtRwStr || "-",
                      kampung: r.kampung || matchedRec.kampung || "-",
                      kecamatan: r.kecamatan || matchedRec.district || "-",
                      rekening: r.rekening || (matchedRec.bankAccountNo ? `${matchedRec.bankAccountNo} / ${matchedRec.bankName || ''} / ${matchedRec.bankAccountHolder || ''}` : "-"),
                      alamat: r.alamat || matchedRec.address || "-",
                      displayAmount: Number(r.jumlah) || 0,
                      rawRecipient: matchedRec
                    };
                 });
              } else {
                 displayRows = group.map((item) => {
                    const rtRwStr = [item.rt, item.rw].filter(Boolean).filter(x => x !== '-').join('/');
                    const alamatRtRwStr = [item.address, rtRwStr].filter(Boolean).join(' ');
                    return {
                      id: item.id,
                      purpose: item.tujuanPengajuan || first.tujuanPengajuan || item.purpose || first.purpose || "-",
                      name: item.name || "-",
                      nik: item.nik || item.kk || "-",
                      noHp: item.contact || "-",
                      alamatRtRw: alamatRtRwStr || "-",
                      kampung: item.kampung || "-",
                      kecamatan: item.district || "-",
                      rekening: item.bankAccountNo ? `${item.bankAccountNo} / ${item.bankName || ''} / ${item.bankAccountHolder || ''}` : "-",
                      alamat: item.address || "-",
                      displayAmount: Number(item.amountProposed) || 0,
                      rawRecipient: item
                    };
                 });
              }

              const totalBantuan = displayRows.reduce(
                (sum, item) => sum + (item.displayAmount || 0),
                0,
              );
              const isTransfer = group.some((r) => r.bankAccountNo && r.bankAccountNo.trim() !== '');
              const isMultiple = group.length > 1 || (data?.lampiranRows && data.lampiranRows.length > 1);

              let ppdNo = "-";
              let mengacuPpdUrl = "-";
              let ppdDate = first.submissionDate;
              let dibayarkanKepada = isMultiple ? "Terlampir" : (first.name || "-");
              
              const primaryRec = group.find(r => r.bankAccountNo && r.bankAccountNo.trim() !== '');
              let rekeningDetails = "-";
              if (isMultiple) {
                rekeningDetails = "Terlampir";
              } else if (primaryRec) {
                rekeningDetails = `${primaryRec.bankAccountNo || "-"} / ${primaryRec.bankName || "-"} / ${primaryRec.bankAccountHolder || "-"}`;
              }

              let paymentType = isTransfer ? "TRANSFER" : "TUNAI";
              let mohonDanaDikeluarkan = isTransfer ? "Transfer" : "Tunai";
              let kodeAnggaran = "-";
              let namaAnggaran = "-";
              let tujuan = first.tujuanPengajuan || first.purpose || "-";

              let totalPpdAmount = totalBantuan;

               if (data) {
                  if (data.rows && data.rows.length > 0) {
                    totalPpdAmount = data.rows.reduce((sum: number, r: any) => sum + (Number(r.total) || 0), 0);
                  }
                  
                  ppdNo = data.noPpd || "-";
                  if (ppdNo.includes('BDG.')) {
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
                     ppdNo = ppdNo.replace(/BDG\.\d/g, getBidangCode(first.sector || ''));
                  }
                  if (data.date) ppdDate = data.date;
                  dibayarkanKepada =
                    data.paidFor || data.paidTo || data.name || (isMultiple ? "Terlampir" : first.name) || "-";
                  mengacuPpdUrl =
                    data.mengacuPada || data.labels?.mengacuPada || "-";
                  tujuan =
                    data.proposeFor || data.purpose || first.tujuanPengajuan || first.purpose || "-";

                  let transferMethod = data.paymentMethod === "TRANSFER" || data.requestDisbursement?.toLowerCase() === "transfer";
                  paymentType = transferMethod ? "TRANSFER" : "TUNAI";
                  mohonDanaDikeluarkan = data.requestDisbursement || (transferMethod ? "Transfer" : "Tunai");

                  if (data.transferDetails) {
                    rekeningDetails = data.transferDetails;
                  } else if (transferMethod) {
                    rekeningDetails = `${data.bankAccountNo || "-"} / ${data.bankName || "-"} / ${data.bankAccountName || "-"}`;
                  } else if (isMultiple) {
                    rekeningDetails = "Terlampir";
                  } else if (primaryRec) {
                    rekeningDetails = `${primaryRec.bankAccountNo || "-"} / ${primaryRec.bankName || "-"} / ${primaryRec.bankAccountHolder || "-"}`;
                  } else {
                    rekeningDetails = "-";
                  }

                  if (data.budgets && data.budgets.length > 0) {
                    kodeAnggaran = data.budgets
                      .map((b: any) => b.code)
                      .join(", ");
                    namaAnggaran = data.budgets
                      .map((b: any) => b.label)
                      .join(", ");
                  } else if (data.rows && data.rows.length > 0) {
                    const codes = data.rows.map((r: any) => r.budgetCode).filter(Boolean);
                    const classifications = data.rows.map((r: any) => r.classification).filter(Boolean);
                    if (codes.length > 0) kodeAnggaran = codes.join(", ");
                    if (classifications.length > 0) namaAnggaran = classifications.join(", ");
                  }
              }

              // Try to format date properly if it's DD/MM/YYYY or from DB
              let formattedDate = ppdDate;
              if (ppdDate.includes("-") && ppdDate.includes("T")) {
                formattedDate = new Date(ppdDate).toLocaleDateString("id-ID");
              } else if (ppdDate && !isNaN(new Date(ppdDate).getTime())) {
                formattedDate = new Date(ppdDate).toLocaleDateString("id-ID");
              }

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
                      {ppdNo}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-600 whitespace-nowrap">
                      {formattedDate}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-600 min-w-[400px] max-w-[600px] whitespace-normal">
                      <div className="line-clamp-2" title={tujuan}>
                        {tujuan}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-600 whitespace-nowrap">
                      {dibayarkanKepada}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-600 whitespace-nowrap">
                      {mengacuPpdUrl}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-semibold text-indigo-600 whitespace-nowrap">
                      {mohonDanaDikeluarkan}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-normal text-slate-600 whitespace-nowrap">
                      {rekeningDetails}
                    </td>
                    <td className="px-3 py-3 text-[11px] font-normal text-slate-600 whitespace-nowrap">
                      {kodeAnggaran}
                    </td>
                    <td className="px-3 py-3 text-[11px] font-normal text-slate-600 whitespace-nowrap">
                      {namaAnggaran}
                    </td>
                    <td className="px-3 py-3 text-[11px] font-normal text-slate-700 whitespace-nowrap text-right">
                      Rp {totalPpdAmount.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-3 text-[11px] font-normal text-emerald-600 whitespace-nowrap text-right">
                      Rp {totalPpdAmount.toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3 flex gap-1.5 justify-center whitespace-nowrap">
                      <button
                        onClick={() => toggleRow(regId)}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg transition-colors border ${isExpanded ? "bg-indigo-500 text-white border-indigo-600" : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50"}`}
                        title="Lihat Detail Penerima"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap ${isExpanded ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700 border border-indigo-100"}`}>
                          {displayRows.length} Penerima Dana
                        </span>
                      </button>
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
                        title="Edit Template E-PPD"
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
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={14} className="p-0 bg-slate-50/80">
                        <div className="p-4 border-t border-indigo-100 shadow-inner">
                          <table className="w-full max-w-5xl text-left bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm table-auto">
                            <thead className="bg-slate-100">
                              <tr>
                                <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-700 border-b border-slate-200 text-center whitespace-nowrap">
                                  No
                                </th>
                                <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                                  Nama
                                </th>
                                <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                                  NIK
                                </th>
                                <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                                  No Hp
                                </th>
                                <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                                  Alamat/RT/RW
                                </th>
                                <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                                  Kampung
                                </th>
                                <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                                  Kecamatan
                                </th>
                                <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                                  Info Rekening
                                </th>
                                <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-700 border-b border-slate-200 text-right whitespace-nowrap">
                                  Jumlah
                                </th>
                                <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-700 border-b border-slate-200 text-center whitespace-nowrap">
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
                                  <td className="px-2 py-1.5 text-[10px] text-slate-500 text-center whitespace-nowrap">
                                    {index + 1}
                                  </td>
                                  <td className="px-2 py-1.5 text-[10px] font-semibold text-slate-800 whitespace-nowrap">
                                    {item.name}
                                  </td>
                                  <td className="px-2 py-1.5 text-[10px] text-slate-600 whitespace-nowrap">
                                    {item.nik}
                                  </td>
                                  <td className="px-2 py-1.5 text-[10px] text-slate-600 whitespace-nowrap">
                                    {item.noHp}
                                  </td>
                                  <td className="px-2 py-1.5 text-[10px] text-slate-600 whitespace-normal">
                                    {item.alamatRtRw}
                                  </td>
                                  <td className="px-2 py-1.5 text-[10px] text-slate-600 whitespace-nowrap">
                                    {item.kampung}
                                  </td>
                                  <td className="px-2 py-1.5 text-[10px] text-slate-600 whitespace-nowrap">
                                    {item.kecamatan}
                                  </td>
                                  <td className="px-2 py-1.5 text-[10px] text-slate-600 whitespace-nowrap">
                                    {item.rekening}
                                  </td>
                                  <td className="px-2 py-1.5 text-[10px] font-bold text-emerald-600 text-right whitespace-nowrap">
                                    Rp{" "}
                                    {item.displayAmount?.toLocaleString(
                                      "id-ID",
                                    ) || 0}
                                  </td>
                                  <td className="px-2 py-1.5 flex justify-center">
                                    <button
                                      onClick={() =>
                                        onDeleteRecipient &&
                                        onDeleteRecipient(item.rawRecipient || first)
                                      }
                                      className="inline-flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 p-1 rounded-lg focus:outline-none transition-colors"
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
                                  colSpan={8}
                                  className="px-2 py-2 text-[10px] font-bold text-slate-700 text-right uppercase tracking-wider font-semibold"
                                >
                                  Total Bantuan:
                                </td>
                                <td
                                  colSpan={2}
                                  className="px-2 py-2 text-xs font-black text-emerald-700 text-right border-t border-emerald-200"
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
                  colSpan={14}
                  className="px-4 py-8 text-center text-sm font-medium text-slate-500 bg-white"
                >
                  Belum ada riwayat E-PPD untuk{" "}
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
