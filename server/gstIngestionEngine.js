/**
 * Multi-Format GST Ingestion Engine
 * Ingests and standardizes GSTR-2B JSON, GSTR-1 JSON, and Purchase/Sales Register Excel/CSV.
 */

import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { normalizeGstLineItem, validateGSTIN, quantizeAmount } from './gstNormalizer.js';

/**
 * Parses official Government GSTR-2B JSON dumps
 */
export function parseGstr2bJson(jsonContent) {
  let data;
  if (typeof jsonContent === 'string') {
    data = JSON.parse(jsonContent);
  } else {
    data = jsonContent;
  }

  // Support root level data or data.docdata wrapper
  const docdata = data.data?.docdata || data.docdata || data;
  const items = [];
  const warnings = [];

  const b2bSections = [
    { key: 'b2b', type: 'B2B' },
    { key: 'b2ba', type: 'B2BA' },
    { key: 'cdnr', type: 'CDNR' },
    { key: 'cdnra', type: 'CDNRA' }
  ];

  for (const { key, type } of b2bSections) {
    const suppliers = docdata[key];
    if (!Array.isArray(suppliers)) continue;

    for (const sup of suppliers) {
      const ctin = sup.ctin || sup.gstin;
      const cfs = sup.cfs || 'Y'; // GSTR-1 Filing status

      const invoices = sup.inv || sup.nt || [];
      for (const inv of invoices) {
        const lineItems = inv.items || [];
        
        if (lineItems.length === 0) {
          // Single invoice without sub-items
          items.push(normalizeGstLineItem({
            gstin: ctin,
            supplierName: sup.tradeName || sup.legalName || '',
            invoiceNumber: inv.inum || inv.nt_num,
            invoiceType: type,
            invoiceDate: inv.dt || inv.nt_dt,
            pos: inv.pos,
            reverseCharge: inv.rev === 'Y',
            taxableValue: inv.val || 0,
            igstAmount: inv.iamt || 0,
            cgstAmount: inv.camt || 0,
            sgstAmount: inv.samt || 0,
            cessAmount: inv.csamt || 0,
            totalInvoiceValue: inv.val || 0,
            itcAvailability: inv.itcavl || 'Y',
            itcReason: inv.rsn || null,
            imsAction: inv.ims_action || 'NO_ACTION'
          }, 'GSTR2B'));
        } else {
          // Multiple tax-rate line items for the invoice: aggregate or itemize
          let totalTxval = 0;
          let totalIamt = 0;
          let totalCamt = 0;
          let totalSamt = 0;
          let totalCsamt = 0;

          for (const itm of lineItems) {
            totalTxval += (itm.txval ?? itm.taxableValue ?? 0);
            totalIamt += (itm.iamt ?? itm.igst ?? itm.igstAmount ?? 0);
            totalCamt += (itm.camt ?? itm.cgst ?? itm.cgstAmount ?? 0);
            totalSamt += (itm.samt ?? itm.sgst ?? itm.sgstAmount ?? 0);
            totalCsamt += (itm.csamt ?? itm.cess ?? itm.cessAmount ?? 0);
          }

          items.push(normalizeGstLineItem({
            gstin: ctin,
            supplierName: sup.tradeName || sup.legalName || '',
            invoiceNumber: inv.inum || inv.nt_num,
            invoiceType: type,
            invoiceDate: inv.dt || inv.nt_dt,
            pos: inv.pos,
            reverseCharge: inv.rev === 'Y',
            taxableValue: totalTxval,
            igstAmount: totalIamt,
            cgstAmount: totalCamt,
            sgstAmount: totalSamt,
            cessAmount: totalCsamt,
            totalInvoiceValue: inv.val || (totalTxval + totalIamt + totalCamt + totalSamt + totalCsamt),
            itcAvailability: inv.itcavl || 'Y',
            itcReason: inv.rsn || null,
            imsAction: inv.ims_action || 'NO_ACTION'
          }, 'GSTR2B'));
        }
      }
    }
  }

  const summary = computeDatasetSummary(items, 'GSTR2B');
  return { success: true, documentType: 'GSTR2B', items, summary, warnings };
}

/**
 * Parses official Government GSTR-1 JSON dumps
 */
export function parseGstr1Json(jsonContent) {
  let data;
  if (typeof jsonContent === 'string') {
    data = JSON.parse(jsonContent);
  } else {
    data = jsonContent;
  }

  const root = data.data || data;
  const items = [];
  const warnings = [];

  const sections = [
    { key: 'b2b', type: 'B2B' },
    { key: 'b2cl', type: 'B2CL' },
    { key: 'b2cs', type: 'B2CS' },
    { key: 'cdnr', type: 'CDNR' }
  ];

  for (const { key, type } of sections) {
    const list = root[key];
    if (!Array.isArray(list)) continue;

    for (const entry of list) {
      const ctin = entry.ctin || '';
      const invoices = entry.inv || entry.nt || (key === 'b2cs' ? [entry] : []);

      for (const inv of invoices) {
        const lineItems = inv.items || [];
        let totalTxval = 0;
        let totalIamt = 0;
        let totalCamt = 0;
        let totalSamt = 0;
        let totalCsamt = 0;

        for (const itm of lineItems) {
          totalTxval += (itm.txval ?? itm.taxableValue ?? 0);
          totalIamt += (itm.iamt ?? itm.igst ?? itm.igstAmount ?? 0);
          totalCamt += (itm.camt ?? itm.cgst ?? itm.cgstAmount ?? 0);
          totalSamt += (itm.samt ?? itm.sgst ?? itm.sgstAmount ?? 0);
          totalCsamt += (itm.csamt ?? itm.cess ?? itm.cessAmount ?? 0);
        }

        items.push(normalizeGstLineItem({
          gstin: ctin,
          supplierName: entry.tradeName || entry.legalName || 'Outward Customer',
          invoiceNumber: inv.inum || inv.nt_num || (key === 'b2cs' ? `B2CS-${entry.pos || 'POS'}` : ''),
          invoiceType: type,
          invoiceDate: inv.dt || inv.nt_dt || null,
          pos: inv.pos || entry.pos,
          reverseCharge: inv.rev === 'Y',
          taxableValue: totalTxval || inv.txval || inv.val || 0,
          igstAmount: totalIamt || inv.iamt || inv.igst || 0,
          cgstAmount: totalCamt || inv.camt || inv.cgst || 0,
          sgstAmount: totalSamt || inv.samt || inv.sgst || 0,
          cessAmount: totalCsamt || inv.csamt || inv.cess || 0,
          totalInvoiceValue: inv.val || (totalTxval + totalIamt + totalCamt + totalSamt + totalCsamt) || 0
        }, 'GSTR1'));
      }
    }
  }

  const summary = computeDatasetSummary(items, 'GSTR1');
  return { success: true, documentType: 'GSTR1', items, summary, warnings };
}

/**
 * Detects whether a row contains numeric transaction data or periodic summary totals
 * rather than true textual column headers.
 */
export function isSummaryOrDataRow(row) {
  if (!row || !Array.isArray(row)) return false;
  let numericCount = 0;
  for (const cell of row) {
    if (cell === null || cell === undefined || cell === '') continue;
    if (typeof cell === 'number' && Math.abs(cell) > 10) {
      numericCount++;
    } else if (typeof cell === 'string') {
      const trimmed = cell.trim();
      if (/^-?\d+(\.\d+)?$/.test(trimmed) && Math.abs(parseFloat(trimmed)) > 10) {
        numericCount++;
      }
      if (/\b\d{1,2}-[A-Za-z]{3}-\d{2,4}\s+to\s+\d{1,2}-[A-Za-z]{3}-\d{2,4}\b/i.test(trimmed)) {
        return true;
      }
    }
  }
  return numericCount >= 2;
}

/**
 * Composite Scorer for Header Row Candidates
 */
export function scoreHeaderCandidate(map, row = []) {
  if (!map) return 0;
  if (isSummaryOrDataRow(row)) return -999;
  let score = 0;
  if (map.gstin !== -1) score += 10;
  if (map.invoiceNumber !== -1) score += 10;
  if (map.supplierName !== -1) score += 6;
  if (map.invoiceDate !== -1) score += 5;
  if (map.taxableValue !== -1 || (map.taxableCols && map.taxableCols.length > 0)) score += 8;
  if (map.totalInvoiceValue !== -1) score += 6;
  if (map.cgst !== -1 || (map.cgstCols && map.cgstCols.length > 0)) score += 4;
  if (map.sgst !== -1 || (map.sgstCols && map.sgstCols.length > 0)) score += 4;
  if (map.igst !== -1 || (map.igstCols && map.igstCols.length > 0)) score += 4;
  if (map.pos !== -1) score += 3;
  if (map.invoiceType !== -1) score += 3;
  if (map.rate !== -1) score += 2;
  if (map.cess !== -1 || (map.cessCols && map.cessCols.length > 0)) score += 2;
  if (map.reverseCharge !== -1) score += 2;
  if (map.itcAvailability !== -1) score += 2;

  const nonEmpty = row.filter(c => String(c || '').trim() !== '').length;
  if (nonEmpty < 4) {
    score -= 15;
  }
  return score;
}

/**
 * Intelligent Column Header Detector for Excel / CSV Registers
 */
export function identifyRegisterColumns(headerRow = []) {
  const map = {
    gstin: -1,
    supplierName: -1,
    invoiceNumber: -1,
    invoiceDate: -1,
    invoiceType: -1,
    pos: -1,
    taxableValue: -1,
    igst: -1,
    cgst: -1,
    sgst: -1,
    cess: -1,
    totalInvoiceValue: -1,
    hsnSac: -1,
    voucherNo: -1,
    itcAvailability: -1,
    reverseCharge: -1,
    rate: -1,
    reason: -1,
    taxableCols: [],
    cgstCols: [],
    sgstCols: [],
    igstCols: [],
    cessCols: []
  };

  let fallbackValueCol = -1;

  headerRow.forEach((col, idx) => {
    if (col === undefined || col === null) return;
    const raw = String(col).trim().toLowerCase();
    if (!raw || raw.endsWith(':')) return;

    // Normalize: strip currency and percentage markers like (₹), (rs), (rs.), (inr), (₹/-), (%), etc.
    const s = raw
      .replace(/\(₹\)|\(rs\.?\)|\(inr\)|\(₹\/?-\)|\(%\)/gi, '')
      .replace(/[₹]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // GSTIN / CTIN / Sales Tax No / TIN
    if (map.gstin === -1 && (
      s.includes('gstin') || s.includes('gst no') || s.includes('gst number') || 
      s.includes('party gstin') || s.includes('supplier gstin') || s.includes('vendor gstin') || 
      s.includes('ctin') || s.includes('gstin of supplier') || s.includes('gstin of isd') ||
      s.includes('sales tax no') || s.includes('sales tax') || s.includes('tax no') || s.includes('tin')
    )) {
      map.gstin = idx;
    }
    // Supplier / Party / Particulars / Trade Name / Buyer/Supplier / Receiver / Customer
    else if (map.supplierName === -1 && (
      s.includes('supplier name') || s.includes('party name') || s.includes('vendor name') || 
      s.includes('customer name') || s.includes('customer') || s.includes('receiver name') ||
      s.includes('receiver') || s.includes('buyer') || s.includes('buyer name') || s.includes('consignee') ||
      s.includes('trade name') || s.includes('legal name') || 
      s.includes('trade/legal') || s.includes('party') || s === 'particulars' || s.includes('particular') ||
      s.includes('buyer/supplier') || s === 'name' || s === 'trade'
    )) {
      map.supplierName = idx;
    }
    // Supplier Invoice Number (strictly prioritized over voucher no)
    else if (
      s.includes('supplier invoice') || s.includes('supplier inv') || s.includes('invoice no') || 
      s.includes('inv no') || s.includes('bill no') || s.includes('invoice number') || 
      s.includes('doc no') || s.includes('note no') || s.includes('note number') || 
      s.includes('document no') || s.includes('document number') || s === 'inum' || s === 'bill_no' || s === 'nt_num'
    ) {
      if (map.invoiceNumber === -1 || map.invoiceNumber === map.voucherNo) {
        map.invoiceNumber = idx;
      }
    }
    // Voucher No / Ref
    else if (
      s === 'voucher no' || s.includes('voucher no') || s === 'vch no' || 
      s.includes('vch no') || s.includes('vch. no') || s.includes('voucher number') || s === 'vch' ||
      s.includes('voucher ref') || s.includes('ref no') || s.includes('ref. no') || s.includes('reference no')
    ) {
      if (map.voucherNo === -1) {
        map.voucherNo = idx;
      }
    }
    // Invoice / Note / Document Date
    else if (map.invoiceDate === -1 && (
      s.includes('invoice date') || s.includes('bill date') || s.includes('inv date') || 
      s.includes('doc date') || s.includes('voucher date') || s.includes('note date') || 
      s.includes('document date') || s.includes('ref. date') || s.includes('ref date') ||
      s === 'date' || s.endsWith(' date') || s === 'dt' || s === 'nt_dt'
    ) && !s.includes('filing') && !s.includes('cancellation')) {
      map.invoiceDate = idx;
    }
    // Invoice / Note / Voucher Type
    else if (map.invoiceType === -1 && (
      s.includes('invoice type') || s.includes('inv type') || s.includes('note type') || 
      s.includes('document type') || s.includes('voucher type') || s.includes('vch type') ||
      s.includes('vch. type') || s === 'type' || s === 'typ'
    )) {
      map.invoiceType = idx;
    }
    // Place of Supply (POS)
    else if (map.pos === -1 && (
      s.includes('place of supply') || s === 'pos' || s.startsWith('pos ') || s.endsWith(' pos') ||
      s.includes('state code') || s.includes('place of delivery')
    )) {
      map.pos = idx;
    }
    // ITC Availability
    else if (map.itcAvailability === -1 && (
      s.includes('itc avail') || s.includes('itc eligibility') || s === 'itcavl' || s.includes('itc')
    )) {
      map.itcAvailability = idx;
    }
    // Reverse Charge
    else if (map.reverseCharge === -1 && (
      s.includes('reverse charge') || s.includes('rev charge') || s.includes('rcm') || 
      s.includes('supply attract reverse charge') || s.includes('attract reverse charge')
    )) {
      map.reverseCharge = idx;
    }
    // Rate (prevent matching 'integrated' tax strings)
    else if (map.rate === -1 && (
      s === 'rate' || s === 'tax rate' || s.startsWith('rate') || s.includes('tax rate') ||
      s.includes('applicable %') || s.includes('applicable of tax rate') ||
      (/\brate\b/i.test(s) && !s.includes('integrated'))
    )) {
      map.rate = idx;
    }
    // Reason
    else if (map.reason === -1 && (s.includes('reason') || s === 'rsn')) {
      map.reason = idx;
    }
    // HSN / SAC
    else if (map.hsnSac === -1 && (s.includes('hsn') || s.includes('sac'))) {
      map.hsnSac = idx;
    }
    // Master TAXABLE vs Columnar Purchase / Sales
    else if (
      s === 'taxable' || s === 'taxable value' || s === 'taxable amount' || 
      s === 'assessable value' || s === 'txval' || s === 'basic amount' || s === 'basic value' ||
      s.includes('taxable value') || s.includes('taxable amount') || s.includes('assessable value')
    ) {
      map.taxableValue = idx;
    }
    else if (
      s.startsWith('purchase') || s.includes('purchase @') || s.includes('purchase gst') || s.includes('purchase account') ||
      s.startsWith('sales') || s.startsWith('sale ') || s.includes('sales @') || s.includes('sales gst') || s.includes('sales account') || s.includes('sale @') ||
      s.includes('sales 18%') || s.includes('sales 28%') || s.includes('sales 5%') || s.includes('sales 12%') || s.includes('sales 0%') ||
      s.includes('domestic sales') || s.includes('export sales')
    ) {
      map.taxableCols.push(idx);
    }
    // Master CGST vs Columnar CGST
    else if (
      s === 'cgst' || s === 'central tax' || s === 'camt' ||
      s === 'tax amount central tax' || s.endsWith('central tax')
    ) {
      map.cgst = idx;
    }
    else if (s.startsWith('cgst') || s.includes('cgst') || s.includes('central tax') || s.includes('central') || s.includes('output cgst') || s.includes('out put cgst')) {
      map.cgstCols.push(idx);
    }
    // Master SGST vs Columnar SGST
    else if (
      s === 'sgst' || s === 'state tax' || s === 'samt' || s === 'utgst' ||
      s === 'state/ut tax' || s === 'state / ut tax' || s === 'tax amount state tax' || 
      s === 'tax amount state/ut tax' || s.endsWith('state tax') || s.endsWith('state/ut tax')
    ) {
      map.sgst = idx;
    }
    else if (s.startsWith('sgst') || s.includes('sgst') || s.startsWith('utgst') || s.includes('utgst') || s.includes('state tax') || s.includes('state') || s.includes('output sgst') || s.includes('out put sgst')) {
      map.sgstCols.push(idx);
    }
    // Master IGST vs Columnar IGST
    else if (
      s === 'igst' || s === 'integrated tax' || s === 'iamt' ||
      s === 'tax amount integrated tax' || s.endsWith('integrated tax')
    ) {
      map.igst = idx;
    }
    else if (s.startsWith('igst') || s.includes('igst') || s.includes('integrated tax') || s.includes('integrated') || s.includes('output igst') || s.includes('out put igst')) {
      map.igstCols.push(idx);
    }
    // Cess
    else if (s === 'cess' || s === 'csamt' || s === 'tax amount cess') {
      map.cess = idx;
    }
    else if (s.includes('cess')) {
      map.cessCols.push(idx);
    }
    // Master Total Invoice Value
    else if (
      s === 'total' || s === 'total invoice value' || s === 'invoice total' || 
      s === 'val' || s === 'invoice value' || s === 'note value' || s === 'document value'
    ) {
      map.totalInvoiceValue = idx;
    }
    else if (map.totalInvoiceValue === -1 && (
      s.includes('gross total') || s.includes('gross') || s.includes('total amount') || 
      s.includes('total value') || s.includes('gross amount') || s.includes('net amount') || 
      s.includes('debit') || s.includes('credit')
    )) {
      map.totalInvoiceValue = idx;
    }
    // Fallback 'value' column only recorded as candidate
    else if (s === 'value') {
      fallbackValueCol = idx;
    }
  });

  // Assign fallback 'value' column only if no explicit taxable column was mapped
  if (map.taxableValue === -1 && map.taxableCols.length === 0 && fallbackValueCol !== -1) {
    map.taxableValue = fallbackValueCol;
  }

  if (map.invoiceNumber === -1 && map.voucherNo !== -1) {
    map.invoiceNumber = map.voucherNo;
  }

  return map;
}

/**
 * High-Speed Streaming Excel Parser for Large Workbooks & Bloated Worksheets (e.g. 50MB+ / 1,000,000 phantom rows)
 */
export async function parseLargeExcelWithExcelJs(buffer, documentType = 'PURCHASE_REGISTER') {
  const tempPath = path.join(os.tmpdir(), `gst_upload_${Date.now()}_${Math.random().toString(36).slice(2)}.xlsx`);
  fs.writeFileSync(tempPath, buffer);

  try {
    const options = {
      sharedStrings: 'cache',
      hyperlinks: 'ignore',
      worksheets: 'emit',
      styles: 'ignore'
    };
    const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(tempPath, options);

    const items = [];
    const invoiceAggregator = new Map();
    const parsedSheets = [];
    let defaultInvoiceType = 'B2B';

    for await (const worksheetReader of workbookReader) {
      const sheetName = worksheetReader.name || 'Sheet1';
      const lowerSheet = sheetName.toLowerCase().trim();
      if (
        lowerSheet.includes('read me') || lowerSheet.includes('readme') || lowerSheet.includes('instruction') ||
        lowerSheet === 'summary' || lowerSheet === 'hsn' || lowerSheet.startsWith('doc') || 
        lowerSheet.includes('nil rated') || lowerSheet.includes('nil') || lowerSheet.includes('advrec') || 
        lowerSheet.includes('advadj') || lowerSheet.includes('b2cs') || lowerSheet === 'at' || 
        lowerSheet === 'ata' || lowerSheet === 'exemp' || lowerSheet.includes('eco')
      ) {
        continue;
      }

      if (lowerSheet.includes('cdnr') || lowerSheet.includes('credit note') || lowerSheet.includes('debit note')) {
        defaultInvoiceType = 'CDNR';
      } else if (lowerSheet.includes('b2ba')) {
        defaultInvoiceType = 'B2BA';
      } else if (lowerSheet.includes('b2cl')) {
        defaultInvoiceType = 'B2CL';
      } else if (lowerSheet.includes('exp')) {
        defaultInvoiceType = 'EXP';
      } else if (lowerSheet.includes('isd')) {
        defaultInvoiceType = 'ISD';
      } else {
        defaultInvoiceType = 'B2B';
      }

      let colMap = null;
      let consecutiveEmpty = 0;
      let sheetRowCount = 0;

      for await (const row of worksheetReader) {
        const rawVals = row.values;
        if (!rawVals || !Array.isArray(rawVals)) {
          if (colMap) {
            consecutiveEmpty++;
            if (consecutiveEmpty >= 20) break;
          }
          continue;
        }

        // ExcelJS row.values is 1-indexed (index 0 is null/empty)
        const cells = rawVals.slice(1).map(v => {
          if (v === null || v === undefined) return '';
          if (typeof v === 'object' && v.text) return v.text;
          if (typeof v === 'object' && v.result !== undefined) return v.result;
          return v;
        });

        const hasContent = cells.some(c => c !== '');
        if (!hasContent) {
          if (colMap) {
            consecutiveEmpty++;
            if (consecutiveEmpty >= 20) {
              // Reached bottom of real table: stop scanning remaining empty/phantom rows immediately
              break;
            }
          }
          continue;
        }

        consecutiveEmpty = 0;

        if (!colMap) {
          if (isSummaryOrDataRow(cells)) continue;
          const candidateMap = identifyRegisterColumns(cells);
          const score = scoreHeaderCandidate(candidateMap, cells);
          if (score >= 18) {
            colMap = candidateMap;
          }
          continue;
        }

        const gstin = colMap.gstin !== -1 ? String(cells[colMap.gstin] || '').trim() : '';
        let invNo = colMap.invoiceNumber !== -1 ? String(cells[colMap.invoiceNumber] || '').trim() : '';
        const supplierName = colMap.supplierName !== -1 ? String(cells[colMap.supplierName] || '').trim() : '';
        const voucherNo = colMap.voucherNo !== -1 ? cells[colMap.voucherNo] : '';

        // Taxable value extraction
        let taxableVal = 0;
        if (colMap.taxableValue !== -1 && cells[colMap.taxableValue] !== undefined && String(cells[colMap.taxableValue]).trim() !== '') {
          taxableVal = cells[colMap.taxableValue];
        } else if (colMap.taxableCols && colMap.taxableCols.length > 0) {
          taxableVal = colMap.taxableCols.reduce((sum, cIdx) => sum + (quantizeAmount(cells[cIdx]).floatVal || 0), 0);
        }

        // CGST
        let cgst = 0;
        if (colMap.cgst !== -1 && cells[colMap.cgst] !== undefined && String(cells[colMap.cgst]).trim() !== '') {
          cgst = cells[colMap.cgst];
        } else if (colMap.cgstCols && colMap.cgstCols.length > 0) {
          cgst = colMap.cgstCols.reduce((sum, cIdx) => sum + (quantizeAmount(cells[cIdx]).floatVal || 0), 0);
        }

        // SGST
        let sgst = 0;
        if (colMap.sgst !== -1 && cells[colMap.sgst] !== undefined && String(cells[colMap.sgst]).trim() !== '') {
          sgst = cells[colMap.sgst];
        } else if (colMap.sgstCols && colMap.sgstCols.length > 0) {
          sgst = colMap.sgstCols.reduce((sum, cIdx) => sum + (quantizeAmount(cells[cIdx]).floatVal || 0), 0);
        }

        // IGST
        let igst = 0;
        if (colMap.igst !== -1 && cells[colMap.igst] !== undefined && String(cells[colMap.igst]).trim() !== '') {
          igst = cells[colMap.igst];
        } else if (colMap.igstCols && colMap.igstCols.length > 0) {
          igst = colMap.igstCols.reduce((sum, cIdx) => sum + (quantizeAmount(cells[cIdx]).floatVal || 0), 0);
        }

        let cess = 0;
        if (colMap.cess !== -1 && cells[colMap.cess] !== undefined && String(cells[colMap.cess]).trim() !== '') {
          cess = cells[colMap.cess];
        } else if (colMap.cessCols && colMap.cessCols.length > 0) {
          cess = colMap.cessCols.reduce((sum, cIdx) => sum + (quantizeAmount(cells[cIdx]).floatVal || 0), 0);
        }

        let totalVal = colMap.totalInvoiceValue !== -1 ? cells[colMap.totalInvoiceValue] : 0;

        const firstCellStr = String(cells[0] || '').toLowerCase();
        if (cells.some(c => String(c || '').trim().toLowerCase().startsWith('total')) || invNo.toLowerCase().includes('total') || supplierName.toLowerCase().includes('total')) {
          continue;
        }

        if (['particulars', 'supplier name', 'party name', 'name', 'amount'].includes(supplierName.toLowerCase())) {
          continue;
        }

        const qTax = quantizeAmount(taxableVal).floatVal;
        const qTot = quantizeAmount(totalVal).floatVal;
        const qI = quantizeAmount(igst).floatVal;
        const qC = quantizeAmount(cgst).floatVal;
        const qS = quantizeAmount(sgst).floatVal;

        if (!gstin && !invNo && !supplierName && !voucherNo && qTax === 0 && qTot === 0 && qI === 0 && qC === 0 && qS === 0) {
          continue;
        }

        if (!invNo) {
          invNo = voucherNo ? String(voucherNo) : `PR-ROW-${row.number || 0}`;
        }
        let invType = colMap.invoiceType !== -1 && cells[colMap.invoiceType] ? String(cells[colMap.invoiceType]).trim().toUpperCase() : defaultInvoiceType;
        const isCnDn = (
          invType === 'C' || invType === 'D' || invType === 'CR' || invType === 'DR' || 
          invType.includes('CREDIT NOTE') || invType.includes('DEBIT NOTE') ||
          invType.includes('CR NOTE') || invType.includes('DR NOTE') ||
          invType.includes('CDNR') || invType.includes('CDNUR') ||
          defaultInvoiceType === 'CDNR'
        );
        if (isCnDn && !invType.includes('SALE') && !invType.includes('PURCHASE')) {
          invType = 'CDNR';
        }
        const invDate = colMap.invoiceDate !== -1 ? cells[colMap.invoiceDate] : null;
        const pos = colMap.pos !== -1 ? cells[colMap.pos] : '';
        const itcAvailability = colMap.itcAvailability !== -1 ? String(cells[colMap.itcAvailability] || '').trim().toUpperCase() : 'Y';
        const reverseCharge = colMap.reverseCharge !== -1 ? String(cells[colMap.reverseCharge] || '').trim().toUpperCase().startsWith('Y') : false;
        const itcReason = colMap.reason !== -1 ? cells[colMap.reason] : null;
        const hsnSac = colMap.hsnSac !== -1 ? cells[colMap.hsnSac] : '';

        const aggKey = (gstin && invNo) ? `${gstin.toUpperCase()}#${invNo.toUpperCase()}` : null;

        if (aggKey && invoiceAggregator.has(aggKey)) {
          const existing = invoiceAggregator.get(aggKey);
          const qTaxableCurrent = quantizeAmount(taxableVal);
          const qIgstCurrent = quantizeAmount(igst);
          const qCgstCurrent = quantizeAmount(cgst);
          const qSgstCurrent = quantizeAmount(sgst);
          const qCessCurrent = quantizeAmount(cess);

          existing.taxableValue += qTaxableCurrent.floatVal;
          existing.igstAmount += qIgstCurrent.floatVal;
          existing.cgstAmount += qCgstCurrent.floatVal;
          existing.sgstAmount += qSgstCurrent.floatVal;
          existing.cessAmount += qCessCurrent.floatVal;

          const qTotalCurrent = quantizeAmount(totalVal);
          if (qTotalCurrent.floatVal > existing.totalInvoiceValue) {
            existing.totalInvoiceValue = qTotalCurrent.floatVal;
          }
        } else {
          const qTaxable = quantizeAmount(taxableVal);
          const qIgst = quantizeAmount(igst);
          const qCgst = quantizeAmount(cgst);
          const qSgst = quantizeAmount(sgst);
          const qCess = quantizeAmount(cess);
          const qTotal = quantizeAmount(totalVal);
          const sumTax = qIgst.floatVal + qCgst.floatVal + qSgst.floatVal + qCess.floatVal;
          const computedTaxable = qTaxable.floatVal || (qTotal.floatVal > sumTax ? quantizeAmount(qTotal.floatVal - sumTax).floatVal : qTotal.floatVal);
          const computedTotal = qTotal.floatVal || quantizeAmount(computedTaxable + sumTax).floatVal;

          const record = {
            gstin,
            supplierName,
            invoiceNumber: invNo,
            invoiceType: invType,
            invoiceDate: invDate,
            pos,
            reverseCharge,
            taxableValue: computedTaxable,
            igstAmount: qIgst.floatVal,
            cgstAmount: qCgst.floatVal,
            sgstAmount: qSgst.floatVal,
            cessAmount: qCess.floatVal,
            totalInvoiceValue: computedTotal,
            itcAvailability: (itcAvailability.startsWith('N') || itcAvailability === 'NO') ? 'N' : 'Y',
            itcReason,
            hsnSac,
            voucherNo,
            imsAction: 'NO_ACTION'
          };

          if (aggKey) {
            invoiceAggregator.set(aggKey, record);
          } else {
            items.push(normalizeGstLineItem(record, documentType));
          }
        }
        sheetRowCount++;
      }

      if (sheetRowCount > 0) {
        parsedSheets.push({ sheetName, rowCount: sheetRowCount });
      }
    }

    for (const record of invoiceAggregator.values()) {
      items.push(normalizeGstLineItem(record, documentType));
    }

    if (items.length === 0) {
      if (parsedSheets.length > 0) {
        return {
          success: true,
          documentType,
          parsedSheets,
          totalParsedSheets: parsedSheets.length,
          items: [],
          summary: computeDatasetSummary([], documentType),
          warnings: ['Spreadsheet contains 0 invoice records (empty register).']
        };
      }
      throw new Error(`No valid GST invoice line items could be parsed from spreadsheet.`);
    }

    const summary = computeDatasetSummary(items, documentType);
    return {
      success: true,
      documentType,
      parsedSheets,
      totalParsedSheets: parsedSheets.length,
      items,
      summary,
      warnings: []
    };
  } finally {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (e) {}
  }
}

/**
 * Flexible Excel & CSV Purchase/Sales Register Parser (with auto-fallback to high-speed ExcelJS stream for large files)
 */
export async function parseExcelOrCsvGstRegister(buffer, documentType = 'PURCHASE_REGISTER') {
  // If file is over 10MB, bypass SheetJS in-memory reader and use high-speed ExcelJS streaming directly
  if (buffer.length > 10 * 1024 * 1024) {
    return await parseLargeExcelWithExcelJs(buffer, documentType);
  }

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    if (workbook && workbook.SheetNames && workbook.SheetNames.length > 0) {
      const isIgnoredSheet = (name) => {
        const n = String(name || '').toLowerCase().trim();
        return (
          n === 'read me' || n === 'readme' || n === 'instructions' || 
          n === 'instruction' || n === 'help' || n === 'index' || n === 'cover' ||
          n === 'vouching' || n.startsWith('vouching') || n === 'working' || n.startsWith('working') ||
          n === 'sample' || n === 'samples' || n === 'test' || n === 'audit' || n.startsWith('copy')
        );
      };

      let candidateSheetNames = workbook.SheetNames.filter(name => !isIgnoredSheet(name));
      if (candidateSheetNames.length === 0) {
        candidateSheetNames = workbook.SheetNames;
      }

  // Check if workbook contains official GST portal sheet names (B2B, CDNR, etc.)
  const portalSheetKeywords = ['b2b', 'b2ba', 'cdnr', 'cdnra', 'cdnur', 'cdnura', 'b2cl', 'b2cla', 'exp', 'expa', 'isd', 'impg', 'impgsez'];
  const hasPortalSheets = candidateSheetNames.some(name => {
    const n = name.toLowerCase();
    return portalSheetKeywords.some(kw => n.includes(kw));
  });

  const nonInvoiceSheets = [
    'summary', 'hsn', 'hsn summary', 'doc', 'docs', 'doc_issue', 'nil rated', 'nil', 
    'advrec', 'advreca', 'advadj', 'advadja', 'at', 'ata', 'atadj', 'atadja', 
    'exemp', 'b2cs', 'b2csa', 'eco', 'ecoa'
  ];

  const parsedSheets = [];
  const items = [];
  const warnings = [];

  // Aggregator to merge multi-rate items for the same invoice (same GSTIN + Invoice Number)
  const invoiceAggregator = new Map();
  let anyHeaderFound = false;

  for (const sheetName of candidateSheetNames) {
    const lower = sheetName.toLowerCase().trim();
    // If workbook has portal sheets, ignore non-invoice summary/schedule sheets
    if (hasPortalSheets && nonInvoiceSheets.some(kw => lower === kw || lower.startsWith(kw))) {
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rawRows || rawRows.length < 2) {
      continue;
    }

    // Find the header row (scan up to 25 rows for highest scoring candidate header)
    let headerRowIdx = -1;
    let colMap = null;
    let bestScore = -999;

    for (let i = 0; i < Math.min(rawRows.length, 25); i++) {
      const row = rawRows[i];
      if (!row || !Array.isArray(row) || row.length === 0 || isSummaryOrDataRow(row)) continue;
      const filledCount = row.filter(c => String(c || '').trim() !== '').length;
      if (filledCount < 2) continue;

      const singleMap = identifyRegisterColumns(row);
      const singleScore = scoreHeaderCandidate(singleMap, row);

      let candidateMap = singleScore >= 18 ? singleMap : null;
      let candidateScore = singleScore;
      let candidateRowIdx = i;

      // Check 2-tier merged headers (row i + row i+1)
      if (i + 1 < rawRows.length) {
        const nextRow = rawRows[i + 1] || [];
        if (!isSummaryOrDataRow(nextRow)) {
          const nextFilled = nextRow.filter(c => String(c || '').trim() !== '').length;
          if (nextFilled >= 2) {
            const maxLen = Math.max(row.length, nextRow.length);
            const combinedRow = [];
            for (let k = 0; k < maxLen; k++) {
              const c1 = row[k] !== undefined && row[k] !== null ? String(row[k]) : '';
              const c2 = nextRow[k] !== undefined && nextRow[k] !== null ? String(nextRow[k]) : '';
              combinedRow.push(`${c1} ${c2}`.trim());
            }
            const combinedMap = identifyRegisterColumns(combinedRow);
            const combinedScore = scoreHeaderCandidate(combinedMap, combinedRow);

            if (combinedScore > candidateScore) {
              candidateMap = combinedMap;
              candidateScore = combinedScore;
              candidateRowIdx = i + 1;
            }
          }
        }
      }

      if (candidateMap && candidateScore > bestScore) {
        bestScore = candidateScore;
        headerRowIdx = candidateRowIdx;
        colMap = candidateMap;
      }
    }

    // If no valid headers identified for this sheet, continue to next sheet
    if (headerRowIdx === -1 || !colMap) {
      continue;
    }

    anyHeaderFound = true;

    // Determine default invoice type based on sheet name if not explicitly provided in row
    const lowerSheet = sheetName.toLowerCase();
    let defaultInvoiceType = 'B2B';
    if (lowerSheet.includes('cdnr') || lowerSheet.includes('credit note') || lowerSheet.includes('debit note')) {
      defaultInvoiceType = 'CDNR';
    } else if (lowerSheet.includes('b2ba')) {
      defaultInvoiceType = 'B2BA';
    } else if (lowerSheet.includes('b2cl')) {
      defaultInvoiceType = 'B2CL';
    } else if (lowerSheet.includes('exp')) {
      defaultInvoiceType = 'EXP';
    } else if (lowerSheet.includes('isd')) {
      defaultInvoiceType = 'ISD';
    }

    let sheetRowCount = 0;

    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || !Array.isArray(row) || row.every(cell => cell === '')) continue;

      const gstin = colMap.gstin !== -1 ? String(row[colMap.gstin] || '').trim() : '';
      let invNo = colMap.invoiceNumber !== -1 ? String(row[colMap.invoiceNumber] || '').trim() : '';
      const supplierName = colMap.supplierName !== -1 ? String(row[colMap.supplierName] || '').trim() : '';
      const voucherNo = colMap.voucherNo !== -1 ? row[colMap.voucherNo] : '';

      // Taxable value extraction
      let taxableVal = 0;
      if (colMap.taxableValue !== -1 && row[colMap.taxableValue] !== undefined && String(row[colMap.taxableValue]).trim() !== '') {
        taxableVal = row[colMap.taxableValue];
      } else if (colMap.taxableCols && colMap.taxableCols.length > 0) {
        taxableVal = colMap.taxableCols.reduce((sum, cIdx) => sum + (quantizeAmount(row[cIdx]).floatVal || 0), 0);
      }

      // CGST
      let cgst = 0;
      if (colMap.cgst !== -1 && row[colMap.cgst] !== undefined && String(row[colMap.cgst]).trim() !== '') {
        cgst = row[colMap.cgst];
      } else if (colMap.cgstCols && colMap.cgstCols.length > 0) {
        cgst = colMap.cgstCols.reduce((sum, cIdx) => sum + (quantizeAmount(row[cIdx]).floatVal || 0), 0);
      }

      // SGST
      let sgst = 0;
      if (colMap.sgst !== -1 && row[colMap.sgst] !== undefined && String(row[colMap.sgst]).trim() !== '') {
        sgst = row[colMap.sgst];
      } else if (colMap.sgstCols && colMap.sgstCols.length > 0) {
        sgst = colMap.sgstCols.reduce((sum, cIdx) => sum + (quantizeAmount(row[cIdx]).floatVal || 0), 0);
      }

      // IGST
      let igst = 0;
      if (colMap.igst !== -1 && row[colMap.igst] !== undefined && String(row[colMap.igst]).trim() !== '') {
        igst = row[colMap.igst];
      } else if (colMap.igstCols && colMap.igstCols.length > 0) {
        igst = colMap.igstCols.reduce((sum, cIdx) => sum + (quantizeAmount(row[cIdx]).floatVal || 0), 0);
      }

      let cess = 0;
      if (colMap.cess !== -1 && row[colMap.cess] !== undefined && String(row[colMap.cess]).trim() !== '') {
        cess = row[colMap.cess];
      } else if (colMap.cessCols && colMap.cessCols.length > 0) {
        cess = colMap.cessCols.reduce((sum, cIdx) => sum + (quantizeAmount(row[cIdx]).floatVal || 0), 0);
      }

      let totalVal = colMap.totalInvoiceValue !== -1 ? row[colMap.totalInvoiceValue] : 0;

      // Skip summary / subtotal / total rows
      const firstCellStr = String(row[0] || '').toLowerCase();
      if (row.some(c => String(c || '').trim().toLowerCase().startsWith('total')) || invNo.toLowerCase().includes('total') || supplierName.toLowerCase().includes('total')) {
        continue;
      }

      if (['particulars', 'supplier name', 'party name', 'name', 'amount'].includes(supplierName.toLowerCase())) {
        continue;
      }

      const qTax = quantizeAmount(taxableVal).floatVal;
      const qTot = quantizeAmount(totalVal).floatVal;
      const qI = quantizeAmount(igst).floatVal;
      const qC = quantizeAmount(cgst).floatVal;
      const qS = quantizeAmount(sgst).floatVal;

      if (!gstin && !invNo && !supplierName && !voucherNo && qTax === 0 && qTot === 0 && qI === 0 && qC === 0 && qS === 0) {
        continue;
      }

      if (!gstin && !invNo && !taxableVal && !supplierName) {
        continue;
      }

      if (!invNo) {
        invNo = voucherNo ? String(voucherNo) : `PR-${r - headerRowIdx}`;
      }
      let invType = colMap.invoiceType !== -1 && row[colMap.invoiceType] ? String(row[colMap.invoiceType]).trim().toUpperCase() : defaultInvoiceType;
      const isCnDn = (
        invType === 'C' || invType === 'D' || invType === 'CR' || invType === 'DR' ||
        invType.includes('CREDIT NOTE') || invType.includes('DEBIT NOTE') ||
        invType.includes('CR NOTE') || invType.includes('DR NOTE') ||
        invType.includes('CDNR') || invType.includes('CDNUR') ||
        defaultInvoiceType === 'CDNR'
      );
      if (isCnDn && !invType.includes('SALE') && !invType.includes('PURCHASE')) {
        invType = 'CDNR';
      }
      const invDate = colMap.invoiceDate !== -1 ? row[colMap.invoiceDate] : null;
      const pos = colMap.pos !== -1 ? row[colMap.pos] : '';
      const itcAvailability = colMap.itcAvailability !== -1 ? String(row[colMap.itcAvailability] || '').trim().toUpperCase() : 'Y';
      const reverseCharge = colMap.reverseCharge !== -1 ? String(row[colMap.reverseCharge] || '').trim().toUpperCase().startsWith('Y') : false;
      const itcReason = colMap.reason !== -1 ? row[colMap.reason] : null;
      const hsnSac = colMap.hsnSac !== -1 ? row[colMap.hsnSac] : '';

      // Multi-rate line item aggregation key
      const aggKey = (gstin && invNo) ? `${gstin.toUpperCase()}#${invNo.toUpperCase()}` : null;

      if (aggKey && invoiceAggregator.has(aggKey)) {
        const existing = invoiceAggregator.get(aggKey);
        const qTaxableCurrent = quantizeAmount(taxableVal);
        const qIgstCurrent = quantizeAmount(igst);
        const qCgstCurrent = quantizeAmount(cgst);
        const qSgstCurrent = quantizeAmount(sgst);
        const qCessCurrent = quantizeAmount(cess);

        existing.taxableValue += qTaxableCurrent.floatVal;
        existing.igstAmount += qIgstCurrent.floatVal;
        existing.cgstAmount += qCgstCurrent.floatVal;
        existing.sgstAmount += qSgstCurrent.floatVal;
        existing.cessAmount += qCessCurrent.floatVal;

        // Take the declared invoice value from row if greater, otherwise update sum
        const qTotalCurrent = quantizeAmount(totalVal);
        if (qTotalCurrent.floatVal > existing.totalInvoiceValue) {
          existing.totalInvoiceValue = qTotalCurrent.floatVal;
        }
      } else {
        const qTaxable = quantizeAmount(taxableVal);
        const qIgst = quantizeAmount(igst);
        const qCgst = quantizeAmount(cgst);
        const qSgst = quantizeAmount(sgst);
        const qCess = quantizeAmount(cess);
        const qTotal = quantizeAmount(totalVal);
        const sumTax = qIgst.floatVal + qCgst.floatVal + qSgst.floatVal + qCess.floatVal;
        const computedTaxable = qTaxable.floatVal || (qTotal.floatVal > sumTax ? quantizeAmount(qTotal.floatVal - sumTax).floatVal : qTotal.floatVal);
        const computedTotal = qTotal.floatVal || quantizeAmount(computedTaxable + sumTax).floatVal;

        const record = {
          gstin,
          supplierName,
          invoiceNumber: invNo,
          invoiceType: invType,
          invoiceDate: invDate,
          pos,
          reverseCharge,
          taxableValue: computedTaxable,
          igstAmount: qIgst.floatVal,
          cgstAmount: qCgst.floatVal,
          sgstAmount: qSgst.floatVal,
          cessAmount: qCess.floatVal,
          totalInvoiceValue: computedTotal,
          itcAvailability: (itcAvailability.startsWith('N') || itcAvailability === 'NO') ? 'N' : 'Y',
          itcReason,
          hsnSac,
          voucherNo,
          imsAction: 'NO_ACTION'
        };

        if (aggKey) {
          invoiceAggregator.set(aggKey, record);
        } else {
          items.push(normalizeGstLineItem(record, documentType));
        }
      }

      sheetRowCount++;
    }

    if (sheetRowCount > 0) {
      parsedSheets.push({ sheetName, rowCount: sheetRowCount });
    }
  }

  // Finalize aggregated invoices
    for (const record of invoiceAggregator.values()) {
      items.push(normalizeGstLineItem(record, documentType));
    }

    if (items.length > 0) {
      const summary = computeDatasetSummary(items, documentType);
      return {
        success: true,
        documentType,
        parsedSheets,
        totalParsedSheets: parsedSheets.length,
        items,
        summary,
        warnings
      };
    }

    if (anyHeaderFound) {
      const summary = computeDatasetSummary([], documentType);
      return {
        success: true,
        documentType,
        parsedSheets: parsedSheets.length > 0 ? parsedSheets : [{ sheetName: candidateSheetNames[0] || 'Sheet1', rowCount: 0 }],
        totalParsedSheets: parsedSheets.length || 1,
        items: [],
        summary,
        warnings: [...warnings, 'Spreadsheet contains 0 invoice line items (empty register).']
      };
    }
    }
  } catch (err) {
    console.warn('XLSX.read could not parse spreadsheet, falling back to streaming ExcelJS parser:', err.message);
  }

  // Fallback to high-speed ExcelJS streaming parser (handles 600MB uncompressed XML, phantom rows, etc.)
  return await parseLargeExcelWithExcelJs(buffer, documentType);
}

/**
 * Universal Dataset Summary & Statutory Metrics Calculator
 */
export function computeDatasetSummary(items = [], documentType = 'REGISTER') {
  let totalTaxablePaise = 0;
  let totalIgstPaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalCessPaise = 0;
  let totalTaxPaise = 0;
  let totalInvoicePaise = 0;

  let validGstinCount = 0;
  let invalidGstinCount = 0;
  let blocked17_5Count = 0;
  let blocked17_5Paise = 0;

  const suppliersSet = new Set();
  const returnPeriodsSet = new Set();

  for (const item of items) {
    totalTaxablePaise += (item.taxableValuePaise || 0);
    totalIgstPaise += (item.igstPaise || 0);
    totalCgstPaise += (item.cgstPaise || 0);
    totalSgstPaise += (item.sgstPaise || 0);
    totalCessPaise += (item.cessPaise || 0);
    totalTaxPaise += (item.totalTaxPaise || 0);
    totalInvoicePaise += (item.totalInvoiceValuePaise || 0);

    if (item.supplierGstinValid) {
      validGstinCount++;
    } else if (item.supplierGstin) {
      invalidGstinCount++;
    }

    if (item.isBlocked17_5) {
      blocked17_5Count++;
      blocked17_5Paise += (item.totalTaxPaise || 0);
    }

    if (item.supplierGstin) suppliersSet.add(item.supplierGstin);
    if (item.returnPeriod) returnPeriodsSet.add(item.returnPeriod);
  }

  return {
    documentType,
    totalRecords: items.length,
    uniqueSuppliers: suppliersSet.size,
    returnPeriods: Array.from(returnPeriodsSet).sort(),
    gstinMetrics: {
      validCount: validGstinCount,
      invalidCount: invalidGstinCount
    },
    totals: {
      taxableValue: totalTaxablePaise / 100,
      igst: totalIgstPaise / 100,
      cgst: totalCgstPaise / 100,
      sgst: totalSgstPaise / 100,
      cess: totalCessPaise / 100,
      totalTax: totalTaxPaise / 100,
      totalInvoiceValue: totalInvoicePaise / 100
    },
    section17_5: {
      blockedCount: blocked17_5Count,
      blockedTaxAmount: blocked17_5Paise / 100
    }
  };
}
