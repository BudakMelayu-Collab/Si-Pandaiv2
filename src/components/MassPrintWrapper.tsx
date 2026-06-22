import React, { useEffect } from 'react';
import { Recipient } from '../types';
import ReceiptTemplate from './ReceiptTemplate';
import SurveyTemplate from './SurveyTemplate';
import MPZISTemplate from './MPZISTemplate';
import EPPDTemplate from './EPPDTemplate';
import { Printer, ChevronRight } from 'lucide-react';

interface MassPrintWrapperProps {
  type: 'receipt' | 'survey' | 'mpzis' | 'eppd';
  recipients: Recipient[];
  onClose: () => void;
}

export default function MassPrintWrapper({ type, recipients, onClose }: MassPrintWrapperProps) {
  useEffect(() => {
    // Add a class to body to prevent scrolling when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const cetakMassal = () => {
    window.print();
  };

  return (
    <div className="mass-print-overlay fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[100] flex flex-col overflow-hidden print:static print:bg-white print:overflow-visible print:block print:h-auto print:p-0">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            margin: 0;
          }
          #root > div > *:not(.mass-print-overlay) {
            display: none !important;
          }
          body, html, #root, #root > div {
            background-color: white !important;
            overflow: visible !important;
            height: auto !important;
            min-height: auto !important;
            width: auto !important;
            display: block !important;
            position: static !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Strip out any flex layouts along the spine */
          .mass-print-overlay, 
          .mass-print-overlay * {
             /* We cannot wildcard * because it breaks flex inside the actual pages, but we can target the containers up to receipt-print-page */
          }
          .mass-print-overlay, 
          .mass-print-overlay > div,
          .mass-print-overlay > div > div,
          .mass-print-overlay > div > div > div,
          .mass-print-overlay .receipt-template-overlay,
          .mass-print-overlay .receipt-scrollable-container {
            display: block !important;
            position: static !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            transform: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .mass-print-item {
            page-break-after: always !important;
            break-after: page !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .mass-print-item:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          
          /* Prevent internal pages from spilling over and causing blank pages */
          .eppd-print-page,
          .lampiran-print-page,
          .receipt-print-page,
          .mpzis-template-overlay .print-container {
             height: auto !important;
             min-height: auto !important;
             margin-bottom: 0 !important;
             margin-top: 0 !important;
             padding-bottom: 0 !important; 
          }
          
          /* Target wrappers that have pb-20 or mt-6 */
          .mass-print-item > div > div {
             margin: 0 !important;
             padding: 0 !important;
          }
        }
      `}} />
      {/* Universal Toolbar for Mass Print */}
      <div className="bg-[#0f172a] border-b border-white/10 p-4 flex items-center justify-between print:hidden shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            title="Kembali"
          >
            <ChevronRight className="w-6 h-6 rotate-180" />
          </button>
          <div>
            <h3 className="font-bold text-white leading-tight">
              Cetak Massal {type === 'receipt' ? 'Tanda Terima' : type === 'survey' ? 'Data Survey' : type === 'mpzis' ? 'MPZIS' : 'E-PPD'}
            </h3>
            <p className="text-xs text-slate-400 font-medium">Banyaknya: {recipients.length} Dokumen</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={cetakMassal}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95"
          >
            <Printer className="w-5 h-5" />
            Cetak Semua Dokumen ({recipients.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-900 print:bg-white print:overflow-visible print:block print:p-0 flex flex-col py-10 gap-10 items-center">
        <div id="mass-print-container" className="w-full max-w-[1300px] flex flex-col gap-10 items-center print:block print:w-full print:max-w-none print:m-0 print:p-0">
          {recipients.map((rec, index) => (
            <div key={rec.id || `print-${index}`} className="lembar mass-print-item relative w-full flex flex-col items-center print:block print:shadow-none print:overflow-visible print:w-full print:m-0 print:p-0">
              {type === 'receipt' && (
                <ReceiptTemplate 
                  recipient={rec} 
                  onClose={() => {}} 
                  onEdit={() => {}} 
                  isEmbedded={true}
                />
              )}
              {type === 'survey' && (
                <SurveyTemplate 
                  recipient={rec} 
                  onClose={() => {}} 
                  isEmbedded={true}
                />
              )}
              {type === 'mpzis' && (
                <MPZISTemplate 
                  recipient={rec} 
                  lampiranItems={(rec as any).lampiranItems}
                  onClose={() => {}} 
                  isEmbedded={true}
                />
              )}
              {type === 'eppd' && (
                <EPPDTemplate 
                  recipient={rec} 
                  lampiranItems={(rec as any).lampiranItems}
                  records={[]} 
                  onSaveRecord={() => {}} 
                  onDeleteRecord={() => {}} 
                  onClose={() => {}} 
                  isEmbedded={true}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
