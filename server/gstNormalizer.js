/**
 * GST Normalization & Statutory Validation Engine
 * Implements Mod-36 Luhn Checksum, Canonical Invoice Keys, Date Standardization,
 * Floating-Point Paise Quantization, and Section 17(5) Blocked Credit Detection.
 */

export const GST_STATE_CODES = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction'
};

const MOD36_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Validates 15-character Indian GSTIN with structural check and Mod-36 Luhn-variant checksum
 */
export function validateGSTIN(gstin) {
  if (!gstin || typeof gstin !== 'string') {
    return { valid: false, reason: 'Empty or missing GSTIN' };
  }

  const clean = gstin.trim().toUpperCase();
  if (clean.length !== 15) {
    return { valid: false, clean, reason: `Invalid length: ${clean.length} (must be exactly 15 characters)` };
  }

  const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!regex.test(clean)) {
    return { valid: false, clean, reason: 'Failed structural pattern check (e.g. 2 digits + 10 char PAN + 1 entity code + Z + checksum)' };
  }

  const stateCode = clean.substring(0, 2);
  const stateName = GST_STATE_CODES[stateCode];
  if (!stateName) {
    return { valid: false, clean, reason: `Unknown state code: ${stateCode}` };
  }

  // Mod-36 Luhn Checksum Calculation
  let factor = 1;
  let sum = 0;
  const checkDigit = clean[14];

  for (let i = 0; i < 14; i++) {
    const codePoint = MOD36_CHARS.indexOf(clean[i]);
    if (codePoint === -1) {
      return { valid: false, clean, reason: `Invalid character '${clean[i]}' at position ${i + 1}` };
    }
    let addend = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / 36) + (addend % 36);
    sum += addend;
  }

  const remainder = sum % 36;
  const calculatedCheckIndex = (36 - remainder) % 36;
  const calculatedCheckChar = MOD36_CHARS[calculatedCheckIndex];

  if (calculatedCheckChar !== checkDigit) {
    return {
      valid: false,
      clean,
      stateCode,
      stateName,
      reason: `Checksum mismatch: expected '${calculatedCheckChar}', received '${checkDigit}' (possible transposition typo)`
    };
  }

  return {
    valid: true,
    clean,
    stateCode,
    stateName,
    pan: clean.substring(2, 12),
    entityCode: clean[12]
  };
}

/**
 * Resilient Canonical Invoice Number Normalizer
 * Example: 'INV/2024-25/00042' -> '20242542'
 */
export function canonicalizeInvoiceNumber(rawInv) {
  if (rawInv === undefined || rawInv === null) return '';
  let s = String(rawInv).trim().toUpperCase();

  // Strip leading/trailing special characters
  s = s.replace(/^[\s\-_:\/#\\]+|[\s\-_:\/#\\]+$/g, '');

  // Strip recurring invoice prefixes (INV, BILL, TAX, EXP, PUR, TI, CDNR, etc.)
  s = s.replace(/^(?:TAX\s*INV(?:OICE)?|INV(?:OICE)?|BILL|EXP(?:ENSE)?|PUR(?:CHASE)?|TI|DN|CN|CDNR|RET)[\s\-_:\/#\\]+/i, '');

  // Split by non-alphanumeric separators (slashes, dashes, hashes, spaces, colons)
  const segments = s.split(/[^A-Z0-9]+/).filter(seg => seg.length > 0);
  if (segments.length === 0) return '0';

  // Strip leading zeroes from each numeric-only segment (e.g. '00042' -> '42')
  const cleanedSegments = segments.map(seg => {
    if (/^0+[0-9]+$/.test(seg)) {
      return seg.replace(/^0+/, '');
    }
    return seg;
  });

  return cleanedSegments.join('') || '0';
}

/**
 * Date Normalizer: Standardizes any Indian/International date format to 'YYYY-MM-DD'
 * Supports: 'DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD', 'DD.MM.YY', and Excel serial numbers
 */
export function normalizeGstDate(rawDate) {
  if (rawDate === undefined || rawDate === null || rawDate === '') {
    return null;
  }

  // Handle Excel numeric serial dates (e.g. 45450 -> '2024-06-07')
  if (typeof rawDate === 'number' || (!isNaN(rawDate) && !String(rawDate).includes('-') && !String(rawDate).includes('/'))) {
    const serial = Number(rawDate);
    if (serial > 30000 && serial < 60000) {
      const utcDays = Math.floor(serial - 25569);
      const date = new Date(utcDays * 86400 * 1000);
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const s = String(rawDate).trim();

  // YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = String(ymdMatch[2]).padStart(2, '0');
    const d = String(ymdMatch[3]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    const d = String(dmyMatch[1]).padStart(2, '0');
    const m = String(dmyMatch[2]).padStart(2, '0');
    let y = dmyMatch[3];
    if (y.length === 2) {
      y = Number(y) > 70 ? '19' + y : '20' + y;
    }
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Returns Return Period 'MMYYYY' and Financial Year 'YYYY-YY' from a normalized date
 */
export function deriveGstPeriods(normalizedDate) {
  if (!normalizedDate || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    return { returnPeriod: null, financialYear: null };
  }
  const [yearStr, monthStr] = normalizedDate.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const returnPeriod = `${monthStr}${yearStr}`;
  let financialYear;
  if (month >= 4) {
    const nextYear = String(year + 1).slice(-2);
    financialYear = `${year}-${nextYear}`;
  } else {
    const currYearShort = String(year).slice(-2);
    financialYear = `${year - 1}-${currYearShort}`;
  }

  return { returnPeriod, financialYear };
}

/**
 * Quantize financial amounts into 2-decimal floats and integer paise
 * Prevents IEEE-754 floating point drift (e.g. 0.1 + 0.2 !== 0.3)
 */
export function quantizeAmount(val) {
  if (val === undefined || val === null || val === '') {
    return { floatVal: 0, paiseVal: 0 };
  }
  let num;
  if (typeof val === 'number') {
    num = val;
  } else {
    // Strip commas, currency symbols, and spaces
    const cleanStr = String(val).replace(/[₹$€£,\s]/g, '').trim();
    num = parseFloat(cleanStr);
  }

  if (isNaN(num)) {
    return { floatVal: 0, paiseVal: 0 };
  }

  const paiseVal = Math.round(num * 100);
  const floatVal = paiseVal / 100;
  return { floatVal, paiseVal };
}

/**
 * Section 17(5) Ineligible / Blocked Credit Detector
 * Automatically flags blocked credits under the Central Goods and Services Tax Act, 2017
 */
export function checkSection17_5BlockedCredit(item) {
  const hsn = String(item.hsnSac || item.hsn_sac || item.hsn || '').trim();
  const desc = String(
    item.description || item.itemName || item.particulars || item.label || 
    item.supplierName || item.vendorName || item.partyName || ''
  ).toLowerCase();

  // 1. Motor Vehicles for passenger transportation <= 13 seating capacity (Sec 17(5)(a))
  const isMotorVehicleHsn = hsn.startsWith('8702') || hsn.startsWith('8703') || hsn.startsWith('8711');
  const isMotorVehicleDesc = (desc.includes('motor car') || desc.includes('passenger vehicle') || desc.includes('four wheeler') || desc.includes('sedan') || desc.includes('suv')) &&
    !desc.includes('transport of goods') && !desc.includes('commercial truck');

  if (isMotorVehicleHsn || isMotorVehicleDesc) {
    // Check statutory exceptions under Sec 17(5)(a) Proviso:
    // (A) Further supply of such vehicles (dealers/trading)
    // (B) Transportation of passengers for hire (taxis/cabs/buses)
    // (C) Imparting training on driving such vehicles (driving schools)
    const isPassengerTransportHire = desc.includes('passenger transport') || desc.includes('transport of passenger') ||
      desc.includes('taxi') || desc.includes('cab') || desc.includes('car rental') || desc.includes('rent a cab') ||
      desc.includes('bus operator') || item.isPassengerTransport === true;
    const isDrivingSchool = desc.includes('driving school') || desc.includes('driving training') || desc.includes('motor training') || item.isDrivingSchool === true;
    const isVehicleReseller = desc.includes('further supply') || desc.includes('resale') || desc.includes('dealership') || item.isVehicleReseller === true;

    if (isPassengerTransportHire || isDrivingSchool || isVehicleReseller || item.eligibleOverride === true) {
      return {
        isBlocked: false,
        isExceptionApplicable: true,
        clause: 'Sec 17(5)(a) Proviso',
        reason: 'Eligible ITC under Section 17(5)(a) Proviso: Motor vehicle used for passenger transport for hire, driving training, or resale'
      };
    }

    return {
      isBlocked: true,
      isProvisionallyFlagged: true,
      status: 'PROVISIONALLY_FLAGGED',
      clause: 'Sec 17(5)(a)',
      reason: 'Provisionally flagged: Motor vehicles for passenger transport <= 13 seats (Sec 17(5)(a)). Check exceptions: eligible if used for passenger transport for hire, driving training, or resale.',
      statutoryException: 'Eligible under Sec 17(5)(a) Proviso if used for further supply (dealers), passenger transport for hire (taxis/cabs), or driving training.'
    };
  }

  // 2. Food, Beverages, Outdoor Catering, Beauty, Health services (Sec 17(5)(b)(i))
  const isCateringHsn = hsn.startsWith('9963');
  const isCateringDesc = desc.includes('catering') || desc.includes('food and beverage') || desc.includes('restaurant bill') ||
    desc.includes('team lunch') || desc.includes('team dinner') || desc.includes('club membership') ||
    desc.includes('health club') || desc.includes('gym membership') || desc.includes('life insurance') ||
    desc.includes('health insurance');

  if (isCateringHsn || isCateringDesc) {
    // Check statutory exceptions under Sec 17(5)(b)(i) Proviso:
    // (A) Used for making an outward taxable supply of the same category (caterer subcontracting food)
    // (B) Where it is obligatory for an employer under any law (e.g. statutory factory canteen under Factories Act 1948)
    const isSameLineBusiness = desc.includes('outward supply') || desc.includes('same line of business') ||
      desc.includes('sub-contract') || desc.includes('subcontract') || item.isSameLineOfBusiness === true;
    const isStatutoryObligation = desc.includes('factories act') || desc.includes('statutory canteen') ||
      desc.includes('mandatory under law') || item.isStatutoryObligation === true;

    if (isSameLineBusiness || isStatutoryObligation || item.eligibleOverride === true) {
      return {
        isBlocked: false,
        isExceptionApplicable: true,
        clause: 'Sec 17(5)(b)(i) Proviso',
        reason: 'Eligible ITC under Section 17(5)(b)(i) Proviso: Food/catering used for outward catering supply or mandatory statutory obligation'
      };
    }

    return {
      isBlocked: true,
      isProvisionallyFlagged: true,
      status: 'PROVISIONALLY_FLAGGED',
      clause: 'Sec 17(5)(b)(i)',
      reason: 'Provisionally flagged: Food/beverages/catering (Sec 17(5)(b)(i)). Check exceptions: eligible if used for outward catering supply or mandatory under Factories Act.',
      statutoryException: 'Eligible under Sec 17(5)(b)(i) Proviso if used for outward catering supply in same line of business or provided under statutory legal obligation.'
    };
  }

  // 3. Works contract services for construction of immovable property capitalized (Sec 17(5)(c))
  if (hsn.startsWith('9954')) {
    const isSubcontract = desc.includes('sub-contract') || desc.includes('subcontract') || desc.includes('further supply') || item.isSubcontract === true;
    if (isSubcontract || item.eligibleOverride === true) {
      return {
        isBlocked: false,
        isExceptionApplicable: true,
        clause: 'Sec 17(5)(c) Proviso',
        reason: 'Eligible ITC under Section 17(5)(c) Proviso: Works contract service used as input service for further supply of works contract'
      };
    }

    if (desc.includes('capital') || desc.includes('building') || desc.includes('civil structure') || desc.includes('office interior')) {
      return {
        isBlocked: true,
        isProvisionallyFlagged: true,
        status: 'PROVISIONALLY_FLAGGED',
        clause: 'Sec 17(5)(c)',
        reason: 'Provisionally flagged: Works contract services capitalized to immovable property (Sec 17(5)(c)). Eligible if an input service for further works contract supply.',
        statutoryException: 'Eligible under Sec 17(5)(c) Proviso where it is an input service for further supply of works contract service.'
      };
    }
  }

  // 4. Goods lost, stolen, destroyed, written off, or disposed of by way of gift or free samples (Sec 17(5)(h))
  if (
    desc.includes('free sample') || desc.includes('gift') || desc.includes('diwali gift') ||
    desc.includes('lost goods') || desc.includes('written off') || desc.includes('damaged inventory')
  ) {
    return {
      isBlocked: true,
      clause: 'Sec 17(5)(h)',
      reason: 'Goods lost, stolen, destroyed, written off, or given as gift/free sample (Sec 17(5)(h))'
    };
  }

  // 5. Goods or services used for personal consumption (Sec 17(5)(g))
  if (desc.includes('personal consumption') || desc.includes('personal use') || desc.includes('director personal')) {
    return {
      isBlocked: true,
      clause: 'Sec 17(5)(g)',
      reason: 'Goods or services used for personal consumption'
    };
  }

  return { isBlocked: false, clause: null, reason: null };
}

/**
 * Canonical Line Item Builder
 * Standardizes a raw item from any source (Books or Portal) into a unified statutory record.
 */
export function normalizeGstLineItem(raw, source = 'BOOKS') {
  const gstinValidation = validateGSTIN(raw.gstin || raw.supplierGstin || raw.vendorGstin || raw.partyGstin || raw.ctin || '');
  const rawInv = raw.invoiceNumber || raw.invoiceNo || raw.invNo || raw.billNo || raw.docNo || raw.inum || '';
  const canonicalInv = canonicalizeInvoiceNumber(rawInv);
  const normalizedDate = normalizeGstDate(raw.invoiceDate || raw.date || raw.billDate || raw.dt || raw.docDate);
  const { returnPeriod, financialYear } = deriveGstPeriods(normalizedDate);

  const taxable = quantizeAmount(raw.taxableValue || raw.taxableAmount || raw.basicAmount || raw.assessableValue || raw.txval || 0);
  const igst = quantizeAmount(raw.igstAmount || raw.igst || raw.iamt || 0);
  const cgst = quantizeAmount(raw.cgstAmount || raw.cgst || raw.camt || 0);
  const sgst = quantizeAmount(raw.sgstAmount || raw.sgst || raw.samt || 0);
  const cess = quantizeAmount(raw.cessAmount || raw.cess || raw.csamt || 0);

  let totalTaxPaise = igst.paiseVal + cgst.paiseVal + sgst.paiseVal + cess.paiseVal;
  if (totalTaxPaise === 0 && (raw.totalTax || raw.tax || raw.taxAmount)) {
    const rawTaxQuant = quantizeAmount(raw.totalTax || raw.tax || raw.taxAmount);
    totalTaxPaise = rawTaxQuant.paiseVal;
  }
  const totalTaxFloat = Math.round(totalTaxPaise) / 100;

  const rawInvoiceVal = raw.totalInvoiceValue || raw.invoiceValue || raw.totalAmount || raw.val || 0;
  const totalInvoice = rawInvoiceVal ? quantizeAmount(rawInvoiceVal) : {
    floatVal: Math.round(taxable.paiseVal + totalTaxPaise) / 100,
    paiseVal: taxable.paiseVal + totalTaxPaise
  };

  const blockedCheck = checkSection17_5BlockedCredit(raw);

  const pos = String(raw.pos || raw.placeOfSupply || '').trim().padStart(2, '0').slice(-2) || 
    (gstinValidation.valid ? gstinValidation.stateCode : '00');

  return {
    source,
    supplierGstin: gstinValidation.clean || '',
    supplierGstinValid: gstinValidation.valid,
    supplierGstinReason: gstinValidation.reason || null,
    supplierName: String(raw.supplierName || raw.vendorName || raw.partyName || raw.tradeName || gstinValidation.stateName || 'Unknown Vendor').trim(),
    invoiceNumber: String(rawInv).trim(),
    canonicalInvoiceNo: canonicalInv,
    invoiceType: String(raw.invoiceType || raw.invType || raw.typ || 'B2B').toUpperCase(),
    invoiceDate: normalizedDate,
    returnPeriod,
    financialYear,
    pos,
    reverseCharge: !!(raw.reverseCharge || raw.rcm === 'Y' || raw.revCharge === true),
    taxableValue: taxable.floatVal,
    taxableValuePaise: taxable.paiseVal,
    igst: igst.floatVal,
    igstPaise: igst.paiseVal,
    cgst: cgst.floatVal,
    cgstPaise: cgst.paiseVal,
    sgst: sgst.floatVal,
    sgstPaise: sgst.paiseVal,
    cess: cess.floatVal,
    cessPaise: cess.paiseVal,
    totalTax: totalTaxFloat,
    totalTaxPaise: totalTaxPaise,
    totalInvoiceValue: totalInvoice.floatVal,
    totalInvoiceValuePaise: totalInvoice.paiseVal,
    hsnSac: String(raw.hsnSac || raw.hsn_sac || raw.hsn || '').trim(),
    isBlocked17_5: blockedCheck.isBlocked,
    blocked17_5Clause: blockedCheck.clause,
    blocked17_5Reason: blockedCheck.reason,
    itcAvailability: raw.itcAvailability || (blockedCheck.isBlocked ? 'N' : 'Y'),
    imsAction: String(raw.imsAction || raw.ims_action || 'NO_ACTION').toUpperCase(),
    erpVoucherId: raw.voucherNo || raw.voucherId || raw.voucherno || null
  };
}
