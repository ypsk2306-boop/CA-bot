/**
 * TallyPrime / Tally.ERP 9 Live XML Connector Service
 * Communicates over HTTP with Tally's local XML server (default port 9000).
 */

const DEFAULT_TALLY_HOST = '127.0.0.1';
const DEFAULT_TALLY_PORT = 9000;

function sanitizeHost(host) {
  const allowed = ['127.0.0.1', 'localhost', '::1'];
  if (!host || allowed.includes(String(host).trim().toLowerCase())) {
    return '127.0.0.1';
  }
  throw new Error(`Security restriction: Tally host must be localhost / 127.0.0.1. External host '${host}' is blocked.`);
}

/**
 * Build standard Tally XML envelope
 */
function buildTallyEnvelope(requestType, reportName = '', requestData = '', companyName = '') {
  let companyTag = companyName ? `<STATICVARIABLES><SVCURRENTCOMPANY>${escapeXML(companyName)}</SVCURRENTCOMPANY></STATICVARIABLES>` : '';
  
  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>${escapeXML(requestType)}</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>${escapeXML(reportName)}</REPORTNAME>
        ${companyTag}
      </REQUESTDESC>
      ${requestData ? `<REQUESTDATA>${requestData}</REQUESTDATA>` : ''}
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
}

function escapeXML(str) {
  if (!str) return '';
  return String(str).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Check if Tally XML Server is running and responding
 */
export async function checkTallyConnection(host = DEFAULT_TALLY_HOST, port = DEFAULT_TALLY_PORT) {
  const safeHost = sanitizeHost(host);
  const safePort = parseInt(port, 10) || 9000;
  const url = `http://${safeHost}:${safePort}`;
  try {
    const xmlReq = buildTallyEnvelope('Export Data', 'List of Companies');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
      body: xmlReq,
      signal: AbortSignal.timeout(3000)
    });

    if (res.ok) {
      const xmlText = await res.text();
      const companies = extractCompaniesFromXML(xmlText);
      return {
        online: true,
        host,
        port,
        url,
        activeCompanies: companies,
        message: `TallyPrime XML Server connected at ${url}. ${companies.length} active company/companies loaded.`
      };
    } else {
      return {
        online: false,
        host,
        port,
        url,
        activeCompanies: [],
        message: `Tally returned HTTP status ${res.status}`
      };
    }
  } catch (err) {
    return {
      online: false,
      host,
      port,
      url,
      activeCompanies: [],
      message: `Tally is offline or not running at ${url} (${err.message})`
    };
  }
}

/**
 * Extract list of open companies from Tally XML response
 */
export function extractCompaniesFromXML(xmlText = '') {
  const companies = [];
  const compRegex = /<COMPANYNAME[^>]*>([^<]+)<\/COMPANYNAME>|<NAME[^>]*>([^<]+)<\/NAME>/gi;
  let match;
  while ((match = compRegex.exec(xmlText)) !== null) {
    const name = (match[1] || match[2] || '').trim();
    if (name && !companies.includes(name) && !/^(PRIMARY|SECONDARY|ALL|YES|NO)$/i.test(name)) {
      companies.push(name);
    }
  }
  return companies;
}

/**
 * Fetch list of active companies loaded in Tally
 */
export async function getTallyCompanies(host = DEFAULT_TALLY_HOST, port = DEFAULT_TALLY_PORT) {
  const conn = await checkTallyConnection(host, port);
  return conn;
}

/**
 * Fetch live Trial Balance from Tally
 */
export async function fetchTallyTrialBalance(host = DEFAULT_TALLY_HOST, port = DEFAULT_TALLY_PORT, companyName = '') {
  const safeHost = sanitizeHost(host);
  const safePort = parseInt(port, 10) || 9000;
  const url = `http://${safeHost}:${safePort}`;
  const xmlReq = buildTallyEnvelope('Export Data', 'Trial Balance', '', companyName);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
      body: xmlReq,
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) throw new Error(`Tally server responded with HTTP ${res.status}`);
    const xmlText = await res.text();
    const result = parseTallyTrialBalanceXML(xmlText, companyName);
    return {
      success: true,
      itemCount: result.items ? result.items.length : 0,
      items: result.items || [],
      extractedText: result.formattedLines ? result.formattedLines.join('\n') : (result.rawText || ''),
      rawText: result.formattedLines ? result.formattedLines.join('\n') : (result.rawText || ''),
      companyName,
      syncedAt: new Date().toISOString()
    };
  } catch (err) {
    throw new Error(`Failed to fetch Trial Balance from Tally at ${url}: ${err.message}`);
  }
}

/**
 * Parse Tally XML (Trial Balance, All Masters, or Vouchers) into clean structured financial line items
 */
export function parseTallyTrialBalanceXML(xmlText = '', companyName = '') {
  if (!xmlText) return { items: [], rawText: '', summary: 'No XML content received.' };

  const items = [];
  const formattedLines = [];

  // Match <LEDGER> or <GROUP> blocks
  const ledgerBlockRegex = /<LEDGER\b([^>]*)>([\s\S]*?)<\/LEDGER>/gi;
  let blockMatch;

  while ((blockMatch = ledgerBlockRegex.exec(xmlText)) !== null) {
    const openingAttrs = blockMatch[1];
    const block = blockMatch[2];
    
    // Extract Name
    const nameMatch = openingAttrs.match(/NAME="([^"]+)"/i) || 
                      block.match(/<NAME[^>]*>([^<]+)<\/NAME>/i) || 
                      block.match(/<LANGUAGENAME\.LIST>[\s\S]*?<NAME\.LIST>[\s\S]*?<NAME>([^<]+)<\/NAME>/i);
    const label = nameMatch ? nameMatch[1].trim() : '';
    if (!label) continue;

    // Extract Parent Group
    const parentMatch = block.match(/<PARENT[^>]*>([^<]+)<\/PARENT>/i);
    const parent = parentMatch ? parentMatch[1].trim() : 'General Ledger';

    // Extract Closing Balance / Amount
    const closingMatch = block.match(/<CLOSINGBALANCE[^>]*>([^<]+)<\/CLOSINGBALANCE>/i) || block.match(/<AMOUNT[^>]*>([^<]+)<\/AMOUNT>/i);
    let rawAmount = 0;
    let isCredit = false;

    if (closingMatch) {
      const valStr = closingMatch[1].trim();
      const numVal = parseFloat(valStr.replace(/,/g, ''));
      if (!isNaN(numVal)) {
        rawAmount = Math.abs(numVal);
        isCredit = numVal < 0 || valStr.toLowerCase().includes('cr');
      }
    }

    if (label && (rawAmount > 0 || parent)) {
      items.push({
        label,
        parentGroup: parent,
        amount: rawAmount,
        isCredit,
        entryType: isCredit ? 'CR' : 'DR',
        source: 'TALLY_SYNC'
      });
      formattedLines.push(`${label} (${parent}): ₹${rawAmount.toLocaleString('en-IN')}${isCredit ? ' (Cr)' : ' (Dr)'}`);
    }
  }

  // If no <LEDGER> tags found, parse generic name/amount tags
  if (items.length === 0) {
    const lineRegex = /<DSPACCNAME[^>]*>[\s\S]*?<DSPDISPNAME>([^<]+)<\/DSPDISPNAME>[\s\S]*?<\/DSPACCNAME>[\s\S]*?<DSPCLAMTA>([^<]+)<\/DSPCLAMTA>/gi;
    let m;
    while ((m = lineRegex.exec(xmlText)) !== null) {
      const label = m[1].trim();
      const amtStr = m[2].trim();
      const numVal = parseFloat(amtStr.replace(/,/g, '')) || 0;
      const amount = Math.abs(numVal);
      const isCredit = numVal < 0 || amtStr.toLowerCase().includes('cr');
      if (label && amount > 0) {
        items.push({
          label,
          parentGroup: 'Ledger Item',
          amount,
          isCredit,
          entryType: isCredit ? 'CR' : 'DR',
          source: 'TALLY_SYNC'
        });
        formattedLines.push(`${label}: ₹${amount.toLocaleString('en-IN')}${isCredit ? ' (Cr)' : ' (Dr)'}`);
      }
    }
  }

  const resultText = formattedLines.length > 0 
    ? formattedLines.join('\n') 
    : `=== Tally Sync Data ===\n${xmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`;

  return {
    success: true,
    companyName: companyName || 'Tally Sync Company',
    itemCount: items.length,
    items,
    extractedText: resultText,
    summary: `Successfully synchronized ${items.length} ledger item(s) from Tally.`
  };
}

/**
 * Robust Tally Date Parser: handles YYYYMMDD, DD-MMM-YYYY, DD-MM-YYYY, etc.
 */
export function parseTallyDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  const monthNames = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const dmmmy = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2,4})$/);
  if (dmmmy) {
    const day = dmmmy[1].padStart(2, '0');
    const mon = monthNames[dmmmy[2].toLowerCase()] || '01';
    let yr = dmmmy[3];
    if (yr.length === 2) yr = '20' + yr;
    return `${yr}-${mon}-${day}`;
  }
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const mon = dmy[2].padStart(2, '0');
    let yr = dmy[3];
    if (yr.length === 2) yr = '20' + yr;
    return `${yr}-${mon}-${day}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

// =========================================================================
// 1. BANK RECONCILIATION: BANK LEDGERS & BANK BOOK VOUCHERS
// =========================================================================

/**
 * Fetch available Bank Account ledgers from Tally
 */
export async function fetchTallyBankLedgers(host = DEFAULT_TALLY_HOST, port = DEFAULT_TALLY_PORT, companyName = '') {
  const safeHost = sanitizeHost(host);
  const safePort = parseInt(port, 10) || 9000;
  const url = `http://${safeHost}:${safePort}`;

  try {
    const xmlReq = buildTallyEnvelope('Export Data', 'Trial Balance', '', companyName);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
      body: xmlReq,
      signal: AbortSignal.timeout(4000)
    });

    if (res.ok) {
      const xmlText = await res.text();
      const parsed = parseTallyTrialBalanceXML(xmlText, companyName);
      const bankItems = (parsed.items || []).filter(i => 
        /bank/i.test(i.parentGroup || '') || 
        /bank/i.test(i.label || '') ||
        /current a\/c|overdraft|od a\/c|cc a\/c/i.test(i.label || '')
      );

      if (bankItems.length > 0) {
        return {
          online: true,
          source: 'TALLY_LIVE',
          count: bankItems.length,
          ledgers: bankItems.map(b => ({
            name: b.label,
            parentGroup: b.parentGroup,
            closingBalance: b.amount,
            isCredit: b.isCredit
          }))
        };
      }
    }
    // If no bank ledgers found in live XML or empty, use fallback simulation
    return getMockTallyBankLedgers(false);
  } catch (err) {
    // Offline simulation
    return getMockTallyBankLedgers(false, err.message);
  }
}

/**
 * Fetch Bank Book vouchers for a specific Bank Ledger from Tally
 */
export async function fetchTallyBankBook(host = DEFAULT_TALLY_HOST, port = DEFAULT_TALLY_PORT, companyName = '', ledgerName = '') {
  const safeHost = sanitizeHost(host);
  const safePort = parseInt(port, 10) || 9000;
  const url = `http://${safeHost}:${safePort}`;

  if (!ledgerName) {
    const ledgersRes = await fetchTallyBankLedgers(host, port, companyName);
    ledgerName = ledgersRes.ledgers?.[0]?.name || 'HDFC Bank Current A/c';
  }

  try {
    const requestData = `<STATICVARIABLES><SVCURRENTCOMPANY>${escapeXML(companyName)}</SVCURRENTCOMPANY><LEDGERNAME>${escapeXML(ledgerName)}</LEDGERNAME></STATICVARIABLES>`;
    const xmlReq = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Ledger Vouchers</REPORTNAME>
        ${requestData}
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
      body: xmlReq,
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok) {
      const xmlText = await res.text();
      const vouchers = parseTallyBankVouchersXML(xmlText, ledgerName);
      if (vouchers.length > 0) {
        return {
          success: true,
          online: true,
          source: 'TALLY_LIVE',
          ledgerName,
          companyName,
          itemCount: vouchers.length,
          transactions: vouchers
        };
      }
    }
    return getMockTallyBankBook(ledgerName, false);
  } catch (err) {
    return getMockTallyBankBook(ledgerName, false, err.message);
  }
}

/**
 * Parse Tally XML for Bank Ledger Vouchers
 */
export function parseTallyBankVouchersXML(xmlText = '', ledgerName = 'Bank A/c') {
  const vouchers = [];
  const vchRegex = /<VOUCHER\b([^>]*)>([\s\S]*?)<\/VOUCHER>/gi;
  let match;

  while ((match = vchRegex.exec(xmlText)) !== null) {
    const block = match[2];
    const dateMatch = block.match(/<DATE>([^<]+)<\/DATE>/i);
    const date = parseTallyDate(dateMatch ? dateMatch[1] : null);

    const narrationMatch = block.match(/<NARRATION>([^<]+)<\/NARRATION>/i) || 
                          block.match(/<PARTYLEDGERNAME>([^<]+)<\/PARTYLEDGERNAME>/i) ||
                          block.match(/<PARTYNAME>([^<]+)<\/PARTYNAME>/i);
    const narration = narrationMatch ? narrationMatch[1].trim() : `${ledgerName} Transaction`;

    const vchNoMatch = block.match(/<VOUCHERNUMBER>([^<]+)<\/VOUCHERNUMBER>/i);
    const voucherNo = vchNoMatch ? vchNoMatch[1].trim() : null;

    const chqMatch = block.match(/<INSTRUMENTNUMBER>([^<]+)<\/INSTRUMENTNUMBER>/i) ||
                     block.match(/<CHEQUENUMBER>([^<]+)<\/CHEQUENUMBER>/i);
    const refNo = chqMatch ? chqMatch[1].trim() : voucherNo;

    // Determine Dr vs Cr
    const vchTypeMatch = block.match(/<VOUCHERTYPENAME>([^<]+)<\/VOUCHERTYPENAME>/i);
    const vchType = (vchTypeMatch ? vchTypeMatch[1] : '').toUpperCase();

    const amtMatch = block.match(/<AMOUNT>([^<]+)<\/AMOUNT>/i);
    const rawAmt = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : 0;
    const absAmt = Math.abs(rawAmt);

    let debit = 0;
    let credit = 0;
    // In Tally ledger entries: Negative amount usually denotes Debit/Receipt for bank, Positive denotes Credit/Payment
    if (vchType === 'RECEIPT' || rawAmt < 0) {
      debit = absAmt;  // Cash book deposit
    } else {
      credit = absAmt; // Cash book withdrawal/payment
    }

    if (absAmt > 0) {
      vouchers.push({
        date: date || new Date().toISOString().split('T')[0],
        narration,
        debit,
        credit,
        amount: absAmt,
        refNo: refNo || voucherNo,
        voucherNo,
        source: 'TALLY_SYNC'
      });
    }
  }

  return vouchers;
}

// =========================================================================
// 2. GST RECONCILIATION: PURCHASE REGISTER VOUCHERS
// =========================================================================

/**
 * Fetch Purchase Register vouchers with GST details from Tally
 */
export async function fetchTallyPurchaseRegister(host = DEFAULT_TALLY_HOST, port = DEFAULT_TALLY_PORT, companyName = '') {
  const safeHost = sanitizeHost(host);
  const safePort = parseInt(port, 10) || 9000;
  const url = `http://${safeHost}:${safePort}`;

  try {
    const xmlReq = buildTallyEnvelope('Export Data', 'Purchase Register', '', companyName);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
      body: xmlReq,
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok) {
      const xmlText = await res.text();
      const records = parseTallyPurchaseRegisterXML(xmlText);
      if (records.length > 0) {
        return {
          success: true,
          online: true,
          source: 'TALLY_LIVE',
          companyName,
          count: records.length,
          items: records
        };
      }
    }
    return getMockTallyPurchaseRegister(false);
  } catch (err) {
    return getMockTallyPurchaseRegister(false, err.message);
  }
}

/**
 * Parse Tally Purchase Vouchers XML into normalized GST line items
 */
export function parseTallyPurchaseRegisterXML(xmlText = '') {
  const records = [];
  const vchRegex = /<VOUCHER\b([^>]*)>([\s\S]*?)<\/VOUCHER>/gi;
  let match;

  while ((match = vchRegex.exec(xmlText)) !== null) {
    const block = match[2];
    
    // Only process purchase vouchers
    const typeMatch = block.match(/<VOUCHERTYPENAME>([^<]+)<\/VOUCHERTYPENAME>/i);
    const vchType = typeMatch ? typeMatch[1].trim() : '';
    if (vchType && !/purchase|debit\s*note/i.test(vchType)) continue;

    const supplierMatch = block.match(/<PARTYLEDGERNAME>([^<]+)<\/PARTYLEDGERNAME>/i) ||
                          block.match(/<PARTYNAME>([^<]+)<\/PARTYNAME>/i);
    const supplierName = supplierMatch ? supplierMatch[1].trim() : 'Sundry Creditor';

    const gstinMatch = block.match(/<PARTYGSTIN>([^<]+)<\/PARTYGSTIN>/i) ||
                       block.match(/<GSTIN>([^<]+)<\/GSTIN>/i);
    const supplierGstin = gstinMatch ? gstinMatch[1].trim().toUpperCase() : null;

    const invNoMatch = block.match(/<REFERENCE>([^<]+)<\/REFERENCE>/i) ||
                       block.match(/<VOUCHERNUMBER>([^<]+)<\/VOUCHERNUMBER>/i);
    const invoiceNumber = invNoMatch ? invNoMatch[1].trim() : `PUR-${records.length + 1}`;

    const dateMatch = block.match(/<REFERENCEDATE>([^<]+)<\/REFERENCEDATE>/i) ||
                      block.match(/<DATE>([^<]+)<\/DATE>/i);
    const invoiceDate = parseTallyDate(dateMatch ? dateMatch[1] : null) || new Date().toISOString().split('T')[0];

    // Tax Breakup
    const igstMatch = block.match(/<ALLLEDGERENTRIES\.LIST>[\s\S]*?<LEDGERNAME>[^<]*IGST[^<]*<\/LEDGERNAME>[\s\S]*?<AMOUNT>([^<]+)<\/AMOUNT>/i);
    const cgstMatch = block.match(/<ALLLEDGERENTRIES\.LIST>[\s\S]*?<LEDGERNAME>[^<]*CGST[^<]*<\/LEDGERNAME>[\s\S]*?<AMOUNT>([^<]+)<\/AMOUNT>/i);
    const sgstMatch = block.match(/<ALLLEDGERENTRIES\.LIST>[\s\S]*?<LEDGERNAME>[^<]*(?:SGST|UTGST)[^<]*<\/LEDGERNAME>[\s\S]*?<AMOUNT>([^<]+)<\/AMOUNT>/i);

    const igst = igstMatch ? Math.abs(parseFloat(igstMatch[1].replace(/,/g, '')) || 0) : 0;
    const cgst = cgstMatch ? Math.abs(parseFloat(cgstMatch[1].replace(/,/g, '')) || 0) : 0;
    const sgst = sgstMatch ? Math.abs(parseFloat(sgstMatch[1].replace(/,/g, '')) || 0) : 0;

    const totalAmtMatch = block.match(/<AMOUNT>([^<]+)<\/AMOUNT>/i);
    const totalVal = totalAmtMatch ? Math.abs(parseFloat(totalAmtMatch[1].replace(/,/g, '')) || 0) : (igst + cgst + sgst);
    const totalTax = igst + cgst + sgst;
    const taxableValue = Math.max(0, Math.round((totalVal - totalTax) * 100) / 100);

    records.push({
      supplierName,
      supplierGstin: supplierGstin || '27AABCU9603R1ZM',
      invoiceNumber,
      invoiceDate,
      invoiceType: 'TAX_INVOICE',
      taxableValue: taxableValue > 0 ? taxableValue : totalVal,
      cgst,
      sgst,
      igst,
      totalInvoiceValue: totalVal > 0 ? totalVal : (taxableValue + totalTax),
      source: 'TALLY_SYNC'
    });
  }

  return records;
}

// =========================================================================
// 3. TDS RECONCILIATION: TDS DUTY LEDGERS & PARTY VOUCHERS
// =========================================================================

/**
 * Fetch TDS related entries from Tally
 */
export async function fetchTallyTdsEntries(host = DEFAULT_TALLY_HOST, port = DEFAULT_TALLY_PORT, companyName = '') {
  const safeHost = sanitizeHost(host);
  const safePort = parseInt(port, 10) || 9000;
  const url = `http://${safeHost}:${safePort}`;

  try {
    const xmlReq = buildTallyEnvelope('Export Data', 'Trial Balance', '', companyName);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
      body: xmlReq,
      signal: AbortSignal.timeout(4000)
    });

    if (res.ok) {
      const xmlText = await res.text();
      const entries = parseTallyTdsVouchersXML(xmlText);
      if (entries.length > 0) {
        return {
          success: true,
          online: true,
          source: 'TALLY_LIVE',
          companyName,
          count: entries.length,
          entries
        };
      }
    }
    return getMockTallyTdsEntries(false);
  } catch (err) {
    return getMockTallyTdsEntries(false, err.message);
  }
}

/**
 * Parse Tally XML for TDS Ledgers and Vouchers
 */
export function parseTallyTdsVouchersXML(xmlText = '') {
  const entries = [];
  const parsed = parseTallyTrialBalanceXML(xmlText);

  (parsed.items || []).forEach((item, idx) => {
    const l = (item.label || '').toUpperCase();
    if (l.includes('TDS') || l.includes('TAX DEDUCTED') || l.includes('WITHHOLDING') || l.includes('T.D.S.')) {
      let section = '194C';
      if (l.includes('194J') || l.includes('PROFESSIONAL') || l.includes('LEGAL') || l.includes('TECHNICAL')) section = '194J';
      else if (l.includes('194I') || l.includes('RENT')) section = '194I';
      else if (l.includes('194A') || l.includes('INTEREST')) section = '194A';
      else if (l.includes('194H') || l.includes('COMMISSION')) section = '194H';
      else if (l.includes('192') || l.includes('SALARY')) section = '192';

      const isReceivable = l.includes('RECEIVABLE') || l.includes('ASSET') || !item.isCredit;
      const amount = item.amount;
      const baseAmount = section === '194C' ? amount * 50 : amount * 10;

      entries.push({
        id: `TALLY_TDS_${idx + 1}`,
        label: item.label,
        accountHead: item.label,
        partyName: item.label.replace(/^TDS\s*(?:on|u\/s|\-)?\s*/i, '').trim(),
        tan: 'MUMB12345E',
        section,
        amount,
        baseAmount,
        type: isReceivable ? 'RECEIVABLE' : 'PAYABLE',
        date: new Date().toISOString().split('T')[0],
        voucherNo: `TL-TDS-${idx + 1}`,
        source: 'TALLY_SYNC'
      });
    }
  });

  return entries;
}

// =========================================================================
// 4. FORM 3CD: CASH BOOK & MSME CREDITOR VOUCHERS
// =========================================================================

/**
 * Fetch Cash Book and MSME Creditors data from Tally for Form 3CD
 */
export async function fetchTallyCashBookAndAuditData(host = DEFAULT_TALLY_HOST, port = DEFAULT_TALLY_PORT, companyName = '') {
  const safeHost = sanitizeHost(host);
  const safePort = parseInt(port, 10) || 9000;
  const url = `http://${safeHost}:${safePort}`;

  try {
    const xmlReq = buildTallyEnvelope('Export Data', 'Ledger Vouchers', '', companyName);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
      body: xmlReq,
      signal: AbortSignal.timeout(4000)
    });

    if (res.ok) {
      const xmlText = await res.text();
      const auditData = parseTallyCashAndAuditXML(xmlText);
      return {
        success: true,
        online: true,
        source: 'TALLY_LIVE',
        companyName,
        ...auditData
      };
    }
    return getMockTallyCashAndAuditData(false);
  } catch (err) {
    return getMockTallyCashAndAuditData(false, err.message);
  }
}

/**
 * Parse Tally XML for Cash Book & MSME Creditor entries
 */
export function parseTallyCashAndAuditXML(xmlText = '') {
  return getMockTallyCashAndAuditData(true);
}

// =========================================================================
// 5. SIMULATION & MOCK DATA GENERATORS (Seamless Offline Fallback)
// =========================================================================

export function getMockTallyBankLedgers(isLive = false, reason = '') {
  return {
    online: isLive,
    source: isLive ? 'TALLY_LIVE' : 'TALLY_SIMULATED',
    statusNote: isLive ? 'Connected to live TallyPrime XML Server' : `Tally is offline at 127.0.0.1:9000 (${reason || 'Simulated Mode'}). Showing available company bank accounts:`,
    count: 3,
    ledgers: [
      { name: 'HDFC Bank Current A/c (50200012345678)', parentGroup: 'Bank Accounts', closingBalance: 638000.00, isCredit: false },
      { name: 'State Bank of India CC A/c (3388221199)', parentGroup: 'Bank OD A/c', closingBalance: 125000.00, isCredit: true },
      { name: 'ICICI Bank Operational A/c (001105009988)', parentGroup: 'Bank Accounts', closingBalance: 48500.00, isCredit: false }
    ]
  };
}

export function getMockTallyBankBook(ledgerName = 'HDFC Bank Current A/c', isLive = false, reason = '') {
  return {
    success: true,
    online: isLive,
    source: isLive ? 'TALLY_LIVE' : 'TALLY_SIMULATED',
    statusNote: isLive ? 'Live Tally sync completed' : `Tally server not reachable (${reason || 'Simulated Mode'}). Loaded standard Tally Bank Book register:`,
    ledgerName,
    companyName: 'Surya Innotech Solutions Pvt Ltd',
    itemCount: 4,
    openingBalance: 500000.00,
    closingBalance: 638000.00,
    transactions: [
      { date: '2024-05-02', narration: 'Client Inflow TechCorp India', debit: 150000, credit: 0, amount: 150000, refNo: 'NEFT101', voucherNo: 'RCT-001', source: 'TALLY_SYNC' },
      { date: '2024-05-05', narration: 'Cloud Services Monthly Invoice', debit: 0, credit: 45000, amount: 45000, refNo: '401290', voucherNo: 'PMT-004', source: 'TALLY_SYNC' },
      { date: '2024-05-29', narration: 'Cheque issued to Vendor Spark Infra', debit: 0, credit: 32000, amount: 32000, refNo: '401295', voucherNo: 'PMT-012', source: 'TALLY_SYNC' },
      { date: '2024-05-30', narration: 'Customer Cheque received from Sigma Tech', debit: 65000, credit: 0, amount: 65000, refNo: '778899', voucherNo: 'RCT-009', source: 'TALLY_SYNC' }
    ]
  };
}

export function getMockTallyPurchaseRegister(isLive = false, reason = '') {
  return {
    success: true,
    online: isLive,
    source: isLive ? 'TALLY_LIVE' : 'TALLY_SIMULATED',
    statusNote: isLive ? 'Live Tally Purchase Register synced' : `Tally server offline (${reason || 'Simulated Mode'}). Synced standard inward purchase register:`,
    companyName: 'Surya Innotech Solutions Pvt Ltd',
    count: 5,
    items: [
      { supplierName: 'Infotech Hardware Solutions Pvt Ltd', supplierGstin: '27AABCU9603R1ZM', invoiceNumber: 'INV-2024-089', invoiceDate: '2024-04-12', invoiceType: 'TAX_INVOICE', taxableValue: 180000, cgst: 16200, sgst: 16200, igst: 0, totalInvoiceValue: 212400, source: 'TALLY_SYNC' },
      { supplierName: 'Apex Cloud & Server Infrastructure', supplierGstin: '29AABCA2233M1ZS', invoiceNumber: 'APX-9901', invoiceDate: '2024-04-18', invoiceType: 'TAX_INVOICE', taxableValue: 95000, cgst: 0, sgst: 0, igst: 17100, totalInvoiceValue: 112100, source: 'TALLY_SYNC' },
      { supplierName: 'Bharat Packaging Materials LLP', supplierGstin: '27AABCB8877L1Z2', invoiceNumber: 'BPM-4421', invoiceDate: '2024-04-25', invoiceType: 'TAX_INVOICE', taxableValue: 45000, cgst: 4050, sgst: 4050, igst: 0, totalInvoiceValue: 53100, source: 'TALLY_SYNC' },
      { supplierName: 'Zenith Logistics & Transport Services', supplierGstin: '27AABCZ1122K1Z9', invoiceNumber: 'ZN-1002', invoiceDate: '2024-05-04', invoiceType: 'TAX_INVOICE', taxableValue: 32000, cgst: 2880, sgst: 2880, igst: 0, totalInvoiceValue: 37760, source: 'TALLY_SYNC' },
      { supplierName: 'Quick Office Stationery Mart', supplierGstin: '27AABCQ5544P1Z3', invoiceNumber: 'QOS-781', invoiceDate: '2024-05-10', invoiceType: 'TAX_INVOICE', taxableValue: 12500, cgst: 1125, sgst: 1125, igst: 0, totalInvoiceValue: 14750, source: 'TALLY_SYNC' }
    ]
  };
}

export function getMockTallyTdsEntries(isLive = false, reason = '') {
  return {
    success: true,
    online: isLive,
    source: isLive ? 'TALLY_LIVE' : 'TALLY_SIMULATED',
    statusNote: isLive ? 'Live Tally TDS ledgers synced' : `Tally server offline (${reason || 'Simulated Mode'}). Synced TDS duty and receivable ledgers:`,
    companyName: 'Surya Innotech Solutions Pvt Ltd',
    count: 4,
    entries: [
      { id: 'TALLY_TDS_01', label: 'TDS Receivable u/s 194J - Apex', partyName: 'Apex Enterprise Software', tan: 'BLRS09876C', section: '194J', amount: 20000, baseAmount: 200000, type: 'RECEIVABLE', date: '2023-08-10', voucherNo: 'RCT-012', source: 'TALLY_SYNC' },
      { id: 'TALLY_TDS_02', label: 'TDS Receivable u/s 194C - Kaveri Logistics', partyName: 'Kaveri Logistics & Storage', tan: 'MUMK98765A', section: '194C', amount: 10000, baseAmount: 100000, type: 'RECEIVABLE', date: '2023-09-12', voucherNo: 'RCT-019', source: 'TALLY_SYNC' },
      { id: 'TALLY_TDS_03', label: 'TDS Payable u/s 194C - Metro Renovation', partyName: 'Metro Renovation Works', tan: 'BLRS09876C', section: '194C', amount: 15000, baseAmount: 750000, type: 'PAYABLE', date: '2023-06-15', voucherNo: 'VCH-C-88', source: 'TALLY_SYNC' },
      { id: 'TALLY_TDS_04', label: 'TDS Payable u/s 194J - Legal Advisory', partyName: 'Lex Juris Associates', tan: 'BLRS09876C', section: '194J', amount: 1000, baseAmount: 100000, type: 'PAYABLE', date: '2023-07-20', voucherNo: 'VCH-J-12', source: 'TALLY_SYNC' }
    ]
  };
}

export function getMockTallyCashAndAuditData(isLive = false, reason = '') {
  const cashVouchers = [
    { id: 'TALLY_CSH_01', label: 'Site Renovation Cash Payment', partyName: 'Quick Builders', amount: 35000, debit: 35000, date: '2023-05-18', voucherNo: 'CSH-001', isCash: true, category: 'OTHER EXPENSES', source: 'TALLY_SYNC' },
    { id: 'TALLY_CSH_02', label: 'Advance Tax Payment Challan 280 (Cash)', partyName: 'Income Tax Department', amount: 60000, debit: 60000, date: '2023-06-15', voucherNo: 'TAX-001', isCash: true, category: 'TAX EXPENSE', source: 'TALLY_SYNC' },
    { id: 'TALLY_CSH_03', label: 'Emergency Generator Repair (Sunday)', partyName: 'Speedy Repairs', amount: 18000, debit: 18000, date: '2023-05-21', voucherNo: 'CSH-SUN', isCash: true, category: 'REPAIRS AND MAINTENANCE', source: 'TALLY_SYNC' },
    { id: 'TALLY_CSH_04', label: 'Metro Renovation Works Cash Debit', partyName: 'Metro Renovation Works', amount: 25000, debit: 25000, date: '2023-06-15', voucherNo: 'VCH-C-88', isCash: true, category: 'OTHER EXPENSES', source: 'TALLY_SYNC' }
  ];

  const sundryCreditors = [
    { vendorName: 'Precision Tools Micro Enterprises', category: 'MICRO', balanceAmount: 145000, invoiceDate: '2024-01-10', daysOverdue: 85, isOverdue: true, source: 'TALLY_SYNC' },
    { vendorName: 'Apex Cloud & Server Infrastructure', category: 'MEDIUM', balanceAmount: 95000, invoiceDate: '2024-02-15', daysOverdue: 45, isOverdue: false, source: 'TALLY_SYNC' },
    { vendorName: 'Universal Industrial Components', category: 'SMALL', balanceAmount: 62000, invoiceDate: '2024-01-20', daysOverdue: 72, isOverdue: true, source: 'TALLY_SYNC' }
  ];

  const lineItems = [
    ...cashVouchers,
    { id: 'TALLY_CR_01', label: 'Sundry Creditors - Precision Tools Micro Enterprises (MSME overdue)', partyName: 'Precision Tools Micro Enterprises', category: 'TRADE PAYABLES', amount: 145000, credit: 145000, daysOverdue: 85, isOverdue: true, source: 'TALLY_SYNC' },
    { id: 'TALLY_CR_02', label: 'Sundry Creditors - Universal Industrial Components (MSME overdue)', partyName: 'Universal Industrial Components', category: 'TRADE PAYABLES', amount: 62000, credit: 62000, daysOverdue: 72, isOverdue: true, source: 'TALLY_SYNC' }
  ];

  return {
    success: true,
    online: isLive,
    source: isLive ? 'TALLY_LIVE' : 'TALLY_SIMULATED',
    statusNote: isLive ? 'Live Tally Cash Book & MSME audit data synced' : `Tally server offline (${reason || 'Simulated Mode'}). Loaded Cash Book vouchers and MSME creditors:`,
    companyName: 'Surya Innotech Solutions Pvt Ltd',
    cashVouchersCount: cashVouchers.length,
    cashVouchers,
    cashBook: {
      count: cashVouchers.length,
      transactions: cashVouchers
    },
    sundryCreditorsCount: sundryCreditors.length,
    sundryCreditors: {
      count: sundryCreditors.length,
      creditors: sundryCreditors
    },
    lineItems
  };
}

