import { PDFDocument } from 'pdf-lib';
import { getRecipientFile, getRecipientTemplateData } from '../firebase';

/**
 * Merges all available scans for a recipient into a single PDF.
 * Order: Receipt, MPZIS, E-PPD, Survey (including multiple pages if any)
 */
export async function mergeRecipientScans(recipientId: string, recipientName: string, docSlots?: { name: string, url: string }[]) {
  const fileTypes = ['receipt', 'mpzis', 'eppd'];
  const mergedPdf = await PDFDocument.create();
  
  let addedCount = 0;

  // 1. Process Receipt, MPZIS, E-PPD
  for (const type of fileTypes) {
    const base64 = await getRecipientFile(recipientId, type);
    if (!base64) continue;
    await appendToPdf(mergedPdf, base64, () => addedCount++);
  }

  // 2. Process Survey Scans (can be multiple from SurveyTemplate)
  const surveyData = await getRecipientTemplateData(recipientId, 'survey');
  if (surveyData && surveyData.scanUrls && Array.isArray(surveyData.scanUrls)) {
    for (const base64 of surveyData.scanUrls) {
      await appendToPdf(mergedPdf, base64, () => addedCount++);
    }
  } else {
    // Fallback to legacy single file survey scan if template data not found
    const base64 = await getRecipientFile(recipientId, 'survey');
    if (base64) {
      await appendToPdf(mergedPdf, base64, () => addedCount++);
    }
  }

  // 3. Process Uploaded Documents (Slots 1-15) from input form as requested
  if (docSlots && Array.isArray(docSlots)) {
    for (const doc of docSlots) {
      if (!doc.url) continue;
      let base64 = '';
      if (doc.url.startsWith('data:')) {
        base64 = doc.url;
      } else {
        base64 = await getRecipientFile(recipientId, doc.url);
      }
      if (base64) {
        await appendToPdf(mergedPdf, base64, () => addedCount++);
      }
    }
  }

  if (addedCount === 0) {
    throw new Error('Tidak ada berkas scan yang ditemukan untuk digabungkan.');
  }

  const pdfBytes = await mergedPdf.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  const fileName = `REKAP_SCAN_${recipientName.toUpperCase().replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/**
 * Merges ONLY the uploaded requirements documents (Slots 1-15) space.
 * Opens the merged PDF in a new tab instead of iframe to bypass Chrome's block.
 */
export async function mergeRecipientUploadsOnly(recipientId: string, docSlots: { name: string, url: string }[]) {
  const mergedPdf = await PDFDocument.create();
  let addedCount = 0;

  if (docSlots && Array.isArray(docSlots)) {
    for (const doc of docSlots) {
      if (!doc.url) continue;
      let base64 = '';
      if (doc.url.startsWith('data:')) {
        base64 = doc.url;
      } else {
        base64 = await getRecipientFile(recipientId, doc.url);
      }
      if (base64) {
        await appendToPdf(mergedPdf, base64, () => addedCount++);
      }
    }
  }

  if (addedCount === 0) {
    throw new Error('Tidak ada berkas persyaratan yang ditemukan (belum diunggah).');
  }

  const pdfBytes = await mergedPdf.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  
  const newTab = window.open(url, '_blank');
  if (!newTab) {
    // Fallback if popup blocker intervenes
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/**
 * Merges ONLY the uploaded requirements documents (Slots 1-15) for multiple recipients under a registration number.
 * Excludes Receipt, MPZIS, E-PPD, and Survey. Opens in a new tab to bypass Chrome block.
 */
export async function mergeMultipleRecipientsUploadsOnly(
  noReg: string,
  recipientsWithDocs: { id: string; name: string; documents?: { name: string; url: string }[] }[]
) {
  const mergedPdf = await PDFDocument.create();
  let addedCount = 0;

  for (const recipient of recipientsWithDocs) {
    if (recipient.documents && Array.isArray(recipient.documents)) {
      for (const doc of recipient.documents) {
        if (!doc.url) continue;
        let base64 = '';
        if (doc.url.startsWith('data:')) {
          base64 = doc.url;
        } else {
          try {
            base64 = await getRecipientFile(recipient.id, doc.url);
          } catch (err) {
            console.error(`Gagal mengunduh file untuk penerima ${recipient.name} (${recipient.id}):`, err);
          }
        }
        if (base64) {
          await appendToPdf(mergedPdf, base64, () => addedCount++);
        }
      }
    }
  }

  if (addedCount === 0) {
    throw new Error('Tidak ada berkas persyaratan yang ditemukan dari penerima terpilih.');
  }

  const pdfBytes = await mergedPdf.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  
  const newTab = window.open(url, '_blank');
  if (!newTab) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

async function appendToPdf(mergedPdf: PDFDocument, base64: string, onAdd: () => void) {
  try {
    const parts = base64.split(',');
    if (parts.length < 2) return;
    
    const binaryString = atob(parts[1]);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    if (base64.includes('application/pdf')) {
      const pdf = await PDFDocument.load(bytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
      onAdd();
    } else if (base64.includes('image/')) {
      let image;
      if (base64.includes('image/jpeg') || base64.includes('image/jpg')) {
        image = await mergedPdf.embedJpg(bytes);
      } else if (base64.includes('image/png')) {
        image = await mergedPdf.embedPng(bytes);
      }

      if (image) {
        const page = mergedPdf.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
        onAdd();
      }
    }
  } catch (err) {
    console.error('Error appending to PDF:', err);
  }
}
