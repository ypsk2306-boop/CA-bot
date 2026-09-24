import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { getOllamaStatus, analyzeFinancials } from './localLLM.js';
import { createFinancialWorkbook } from './excelEngine.js';
import { SAMPLE_DATASETS } from './sampleData.js';
import { 
  checkTallyConnection, 
  getTallyCompanies, 
  fetchTallyTrialBalance,
  fetchTallyBankLedgers,
  fetchTallyBankBook,
  fetchTallyPurchaseRegister,
  fetchTallyTdsEntries,
  fetchTallyCashBookAndAuditData
} from './tallyService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Global process error safety: Log fatal errors with full stack trace and exit cleanly so supervisors can restart
process.on('uncaughtException', (err) => {
  console.error('FATAL Uncaught Process Exception:', err);
  setTimeout(() => process.exit(1), 500);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('FATAL Unhandled Process Rejection at:', promise, 'reason:', reason);
  setTimeout(() => process.exit(1), 500);
});

// Middleware: Support local development origins and cloud deployment (e.g. Render)
const ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin || 
      ALLOWED_ORIGINS.includes(origin) || 
      origin.startsWith('http://localhost:') || 
      origin.startsWith('http://127.0.0.1:') ||
      origin.includes('.onrender.com') ||
      process.env.NODE_ENV === 'production'
    ) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy.'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '250mb' }));
app.use(express.urlencoded({ limit: '250mb', extended: true }));

// Temp output directory for downloadable Excel files with auto-cleanup
const OUTPUT_DIR = path.join(__dirname, '..', 'generated_files');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Clean up temp files older than 1 hour periodically
setInterval(() => {
  try {
    const now = Date.now();
    const files = fs.readdirSync(OUTPUT_DIR);
    for (const f of files) {
      const p = path.join(OUTPUT_DIR, f);
      const stat = fs.statSync(p);
      if (now - stat.mtimeMs > 60 * 60 * 1000) {
        fs.unlinkSync(p);
      }
    }
  } catch (err) {
    // Ignore cleanup errors silently
  }
}, 30 * 60 * 1000);

import { DEFAULT_CLAUDE_MODEL, CLAUDE_MODELS } from './claudeBrain.js';

// In-memory rate limiting map for /api/test-claude-key (tracks last test timestamp per client IP / session)
// Note: In single-user local deployment, this prevents accidental key-test flooding; in multi-user mode, keyed per client IP/token.
const keyTestTimestamps = new Map();

/**
 * Health check & Ollama local server status + Claude Brain availability
 */
app.get('/api/status', async (req, res) => {
  const ollamaStatus = await getOllamaStatus();
  res.json({
    status: 'online',
    systemTime: new Date().toISOString(),
    ollama: ollamaStatus,
    claudeBrain: {
      available: !!process.env.ANTHROPIC_API_KEY,
      defaultModel: DEFAULT_CLAUDE_MODEL,
      models: CLAUDE_MODELS
    }
  });
});

/**
 * Validate Anthropic Claude API Key (Protected & Dynamic Model Testing)
 */
app.post('/api/test-claude-key', async (req, res) => {
  try {
    const clientKey = req.ip || 'localhost';
    const lastTimestamp = keyTestTimestamps.get(clientKey) || 0;
    const now = Date.now();
    if (now - lastTimestamp < 2000) {
      return res.status(429).json({ valid: false, error: 'Please wait a moment between API key connection tests.' });
    }
    keyTestTimestamps.set(clientKey, now);

    const { apiKey, model } = req.body;
    const testKey = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!testKey) {
      return res.status(400).json({ valid: false, error: 'No API Key provided.' });
    }
    const testModel = model || process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL;
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: testKey });
    const response = await client.messages.create({
      model: testModel,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Ping' }]
    });
    if (response && response.content) {
      return res.json({ valid: true, message: `Anthropic Claude API Key is valid and connected! (${testModel})` });
    }
    return res.status(400).json({ valid: false, error: 'Empty response from Anthropic.' });
  } catch (err) {
    return res.status(400).json({ valid: false, error: err.message });
  }
});

import multer from 'multer';
import { parseUploadedDocument } from './documentParser.js';

// Setup Multer memory storage for direct buffer parsing (250MB ceiling for large multi-year enterprise registers)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 250 * 1024 * 1024,
    fieldSize: 250 * 1024 * 1024
  }
});

/**
 * Upload & Parse Document(s) (Single or Multi-file: PDF, Excel, CSV, TXT, Images)
 */
app.post(['/api/upload-document', '/api/upload'], upload.any(), async (req, res) => {
  try {
    const uploadedFiles = req.files || (req.file ? [req.file] : []);
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'No file(s) uploaded.' });
    }

    if (uploadedFiles.length === 1) {
      const file = uploadedFiles[0];
      const parsedData = await parseUploadedDocument(
        file.buffer,
        file.originalname,
        file.mimetype
      );
      return res.json({
        success: true,
        fileCount: 1,
        ...parsedData
      });
    }

    // Multiple files: Parse each and concatenate cleanly
    const parsedResults = [];
    for (const file of uploadedFiles) {
      try {
        const parsed = await parseUploadedDocument(
          file.buffer,
          file.originalname,
          file.mimetype
        );
        parsedResults.push({
          filename: file.originalname,
          fileType: parsed.fileType,
          text: parsed.extractedText || '',
          summary: parsed.summary || ''
        });
      } catch (fileErr) {
        console.error(`Error parsing file ${file.originalname}:`, fileErr);
        parsedResults.push({
          filename: file.originalname,
          fileType: 'ERROR',
          text: `[Error parsing ${file.originalname}: ${fileErr.message}]`,
          summary: `Failed: ${fileErr.message}`
        });
      }
    }

    const combinedText = parsedResults
      .map((r, idx) => `=== [Document ${idx + 1}: ${r.filename}] ===\n${r.text.trim()}`)
      .join('\n\n');

    const fileNamesList = parsedResults.map(r => r.filename).join(', ');

    res.json({
      success: true,
      fileCount: uploadedFiles.length,
      filename: `${uploadedFiles.length} Documents Merged (${fileNamesList})`,
      fileType: 'MULTI_DOCUMENT',
      extractedText: combinedText,
      files: parsedResults.map(r => ({ name: r.filename, type: r.fileType, summary: r.summary })),
      summary: `Successfully parsed ${uploadedFiles.length} documents into unified financial dataset.`
    });
  } catch (error) {
    console.error('Error uploading/parsing documents:', error);
    res.status(500).json({ error: error.message });
  }
});

import { validateGSTIN, normalizeGstLineItem } from './gstNormalizer.js';
import { parseGstr2bJson, parseGstr1Json, parseExcelOrCsvGstRegister, computeDatasetSummary } from './gstIngestionEngine.js';

/**
 * Validate GSTIN (Mod-36 Luhn Checksum + State Code)
 */
app.post('/api/gst/validate-gstin', (req, res) => {
  const { gstin } = req.body;
  if (!gstin) {
    return res.status(400).json({ valid: false, error: 'gstin is required.' });
  }
  const result = validateGSTIN(gstin);
  res.json(result);
});

/**
 * Batch Normalization of In-Memory GST Records
 */
app.post('/api/gst/normalize-records', (req, res) => {
  try {
    const { records, documentType } = req.body;
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'records must be an array.' });
    }
    const docType = documentType || 'PURCHASE_REGISTER';
    const normalized = records.map(r => normalizeGstLineItem(r, docType));
    const summary = computeDatasetSummary(normalized, docType);
    res.json({ success: true, count: normalized.length, items: normalized, summary });
  } catch (err) {
    console.error('Error normalizing GST records:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Ingest GST File (Official GSTR-2B/1 JSON, Excel Register, or CSV)
 */
app.post('/api/gst/ingest-file', upload.any(), async (req, res) => {
  try {
    const uploadedFiles = req.files && req.files.length > 0 ? req.files : (req.file ? [req.file] : []);
    if (uploadedFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Please provide one or more GST files (JSON, Excel, or CSV).' });
    }

    const documentType = (req.body.documentType || req.query.documentType || 'PURCHASE_REGISTER').toUpperCase();
    const parsedFiles = [];
    const allItems = [];
    const allWarnings = [];

    for (const file of uploadedFiles) {
      const originalName = file.originalname.toLowerCase();
      let parseResult = null;

      try {
        if (originalName.endsWith('.json') || file.mimetype === 'application/json') {
          const jsonText = file.buffer.toString('utf8');
          const parsed = JSON.parse(jsonText);
          if (documentType.includes('GSTR1') || documentType.includes('GSTR-1') || parsed.b2cs || parsed.data?.b2cs) {
            parseResult = parseGstr1Json(parsed);
          } else {
            parseResult = parseGstr2bJson(parsed);
          }
        } else if (
          originalName.endsWith('.xlsx') || originalName.endsWith('.xls') || 
          originalName.endsWith('.csv') || originalName.endsWith('.tsv') ||
          file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel') || file.mimetype.includes('csv')
        ) {
          parseResult = await parseExcelOrCsvGstRegister(file.buffer, documentType);
        } else {
          allWarnings.push(`Skipped unsupported file format '${file.originalname}'.`);
          continue;
        }

        if (parseResult) {
          const count = (parseResult.items && Array.isArray(parseResult.items)) ? parseResult.items.length : 0;
          parsedFiles.push({
            filename: file.originalname,
            size: file.size,
            rowCount: count,
            totals: parseResult.summary?.totals || null
          });

          if (count > 0) {
            for (const item of parseResult.items) {
              item._originFile = file.originalname;
            }
            allItems.push(...parseResult.items);
          } else {
            allWarnings.push(`File '${file.originalname}' has 0 invoice records (empty register).`);
          }

          if (parseResult.warnings && parseResult.warnings.length > 0) {
            allWarnings.push(...parseResult.warnings);
          }
        }
      } catch (fileErr) {
        console.warn(`Error parsing uploaded file '${file.originalname}':`, fileErr.message);
        allWarnings.push(`Could not parse '${file.originalname}': ${fileErr.message}`);
      }
    }

    if (parsedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Could not parse any of the ${uploadedFiles.length} uploaded file(s).`,
        warnings: allWarnings
      });
    }

    const summary = computeDatasetSummary(allItems, documentType);

    return res.json({
      success: true,
      filename: parsedFiles.map(f => f.filename).join(', '),
      files: parsedFiles,
      totalFiles: parsedFiles.length,
      items: allItems,
      summary,
      warnings: allWarnings
    });
  } catch (err) {
    console.error('Error ingesting GST file(s):', err);
    res.status(400).json({ success: false, error: 'Failed to ingest GST file(s): ' + err.message });
  }
});

/**
 * Get Pre-Loaded Realistic Sample Data for Instant 1-Click Demo
 */
app.get('/api/gst/sample-data', async (req, res) => {
  try {
    const isOutward = (req.query.reconType || '').toUpperCase() === 'OUTWARD';
    const csvPath = isOutward ? path.resolve('sample_sales_register.csv') : path.resolve('sample_purchase_register.csv');
    const jsonPath = isOutward ? path.resolve('sample_gstr1.json') : path.resolve('sample_gstr2b.json');
    const registerDocType = isOutward ? 'SALES_REGISTER' : 'PURCHASE_REGISTER';

    let prResult = { items: [], summary: {} };
    let gstr2bResult = { items: [], summary: {} };

    if (fs.existsSync(csvPath)) {
      const csvBuffer = fs.readFileSync(csvPath);
      prResult = await parseExcelOrCsvGstRegister(csvBuffer, registerDocType);
    }

    if (fs.existsSync(jsonPath)) {
      const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      gstr2bResult = isOutward ? parseGstr1Json(jsonContent) : parseGstr2bJson(jsonContent);
    }

    res.json({
      success: true,
      reconType: isOutward ? 'OUTWARD' : 'INWARD',
      purchaseRegister: {
        filename: path.basename(csvPath),
        ...prResult
      },
      gstr2b: {
        filename: path.basename(jsonPath),
        ...gstr2bResult
      }
    });
  } catch (err) {
    console.error('Error loading GST sample data:', err);
    res.status(500).json({ error: 'Failed to load sample data: ' + err.message });
  }
});

import { runGstReconciliation } from './gstReconEngine.js';
import { createGstReconciliationWorkbook, createRateWiseReconciliationWorkbook } from './gstExcelEngine.js';

/**
 * Run Multi-Pass GST Reconciliation (PR vs GSTR-2B or Sales vs GSTR-1)
 */
app.post('/api/gst/reconcile', (req, res) => {
  try {
    const reconType = (req.body.reconType || req.query.reconType || 'INWARD').toUpperCase();
    const rawBooks = req.body.salesRegisterItems || req.body.purchaseRegisterItems || req.body.purchaseRegister || req.body.booksItems;
    const rawPortal = req.body.gstr1Items || req.body.gstr2bItems || req.body.gstr2b || req.body.portalItems;
    const tolerance = req.body.toleranceAmount ?? req.body.tolerance ?? req.body.options?.tolerance ?? 1.00;
    const parsedTolerance = Number(tolerance);

    if (!Array.isArray(rawBooks) || !Array.isArray(rawPortal)) {
      return res.status(400).json({ error: 'Both books items (purchase/sales register) and portal items (GSTR-2B/1) arrays are required.' });
    }

    const booksDocType = reconType === 'OUTWARD' ? 'SALES_REGISTER' : 'PURCHASE_REGISTER';
    const portalDocType = reconType === 'OUTWARD' ? 'GSTR1' : 'GSTR2B';

    // Auto-normalize if not already canonicalized
    const booksItems = rawBooks.map(item => 
      item.canonicalInvoiceNo ? item : normalizeGstLineItem(item, booksDocType)
    );
    const portalItems = rawPortal.map(item => 
      item.canonicalInvoiceNo ? item : normalizeGstLineItem(item, portalDocType)
    );

    const branchFilter = req.body.branchFilter || req.body.options?.branchFilter || 'AUTO';

    const reconResult = runGstReconciliation({
      purchaseRegisterItems: booksItems,
      gstr2bItems: portalItems,
      toleranceAmount: !isNaN(parsedTolerance) && parsedTolerance >= 0 ? parsedTolerance : 1.00,
      reconType,
      branchFilter
    });

    res.json(reconResult);
  } catch (err) {
    console.error('Error running GST reconciliation:', err);
    res.status(500).json({ error: 'Reconciliation failed: ' + err.message });
  }
});

/**
 * Generate Multi-Tab GST Reconciliation Excel Report (Combined Audit or Dedicated Rate-Wise)
 */
app.post('/api/gst/generate-excel', async (req, res) => {
  try {
    const { reconResult, reportType } = req.body;
    if (!reconResult || !reconResult.summary) {
      return res.status(400).json({ error: 'Valid reconResult is required to generate Excel audit report.' });
    }

    const isRateWise = (reportType || req.query.type || '').toLowerCase() === 'rate-wise';
    const isOutward = reconResult.reconType === 'OUTWARD' || reconResult.summary?.reconType === 'OUTWARD';
    const prefix = isRateWise 
      ? (isOutward ? 'GST_Sales_Rate_Wise_Recon' : 'GST_ITC_Rate_Wise_Recon')
      : (isOutward ? 'GST_Outward_Combined_Audit' : 'GST_ITC_Combined_Audit');

    const workbook = isRateWise 
      ? await createRateWiseReconciliationWorkbook(reconResult)
      : await createGstReconciliationWorkbook(reconResult);

    const fileId = `${prefix}_${Date.now()}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, fileId);

    await workbook.xlsx.writeFile(filePath);

    res.json({
      success: true,
      downloadUrl: `/api/download/${fileId}`,
      filename: fileId,
      message: isRateWise
        ? 'GST Rate-Wise Reconciliation Report generated successfully.'
        : 'GST Master Combined Audit Workbook generated successfully.'
    });
  } catch (err) {
    console.error('Error generating GST Excel report:', err);
    res.status(500).json({ error: 'Failed to generate Excel report: ' + err.message });
  }
});

import { parseBankStatement, parseBankStatementText } from './bankStatementParser.js';
import { runBankReconciliation } from './bankReconEngine.js';

/**
 * Ingest & Parse Bank Statement (PDF, XLSX, CSV, TXT)
 * Normalizes transactions into { date, narration, debit, credit, runningBalance, refNo }
 */
app.post('/api/bank-recon/upload', upload.any(), async (req, res) => {
  try {
    const uploadedFiles = req.files && req.files.length > 0 ? req.files : (req.file ? [req.file] : []);

    if (uploadedFiles.length > 1) {
      const parsedFiles = [];
      const allTransactions = [];
      const allWarnings = [];

      for (const file of uploadedFiles) {
        try {
          const r = await parseBankStatement(file.buffer, file.originalname, file.mimetype);
          if (r && r.transactions) {
            parsedFiles.push({
              filename: file.originalname,
              size: file.size,
              bankName: r.bankName,
              transactionCount: r.transactions.length,
              openingBalance: r.openingBalance,
              closingBalance: r.closingBalance
            });
            allTransactions.push(...r.transactions);
            if (r.warnings) allWarnings.push(...r.warnings);
          }
        } catch (e) {
          allWarnings.push(`Failed to parse ${file.originalname}: ${e.message}`);
        }
      }

      if (allTransactions.length === 0) {
        return res.status(400).json({
          error: `No valid bank transactions could be extracted from the ${uploadedFiles.length} uploaded files.`
        });
      }

      // Chronological sort
      allTransactions.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

      return res.json({
        success: true,
        bankName: parsedFiles[0]?.bankName || 'Bank Statement (Multi-File)',
        files: parsedFiles,
        totalFiles: parsedFiles.length,
        filename: parsedFiles.map(f => f.filename).join(', '),
        transactions: allTransactions,
        openingBalance: parsedFiles[0]?.openingBalance,
        closingBalance: parsedFiles[parsedFiles.length - 1]?.closingBalance,
        summary: {
          totalTransactions: allTransactions.length,
          totalCredits: allTransactions.reduce((acc, t) => acc + (t.credit || 0), 0),
          totalDebits: allTransactions.reduce((acc, t) => acc + (t.debit || 0), 0)
        },
        warnings: allWarnings
      });
    }

    let fileBuffer = null;
    let filename = 'statement';
    let mimeType = '';

    const file = uploadedFiles[0];
    if (file) {
      fileBuffer = file.buffer;
      filename = file.originalname;
      mimeType = file.mimetype;
    } else if (req.body && (req.body.text || req.body.rawText)) {
      const text = req.body.text || req.body.rawText;
      const result = parseBankStatementText(text, req.body.filename || 'pasted_statement.txt');
      return res.json(result);
    } else if (req.body && req.body.fileData) {
      fileBuffer = Buffer.from(req.body.fileData, 'base64');
      filename = req.body.filename || 'uploaded_statement.bin';
      mimeType = req.body.mimeType || '';
    } else {
      return res.status(400).json({ 
        error: 'No bank statement file uploaded. Please upload a PDF, Excel (.xlsx/.xls), CSV, or TXT bank statement.' 
      });
    }

    const result = await parseBankStatement(fileBuffer, filename, mimeType);
    if (result && !result.files) {
      result.files = [{ filename, transactionCount: result.transactions?.length || 0 }];
      result.totalFiles = 1;
    }
    return res.json(result);
  } catch (err) {
    console.error('Error ingesting bank statement:', err);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Run Statutory Bank Reconciliation Matching Engine
 * Reconciles parsed bank transactions against book/ledger line items
 */
app.post('/api/bank-recon/reconcile', (req, res) => {
  try {
    const bankInput = req.body.bankInput || req.body.bankTransactions || req.body.bankStatement || req.body.transactions;
    const bookInput = req.body.bookInput || req.body.bookLineItems || req.body.bookTransactions || req.body.lineItems || req.body.ledger;
    const options = req.body.options || {};
    if (req.body.dateToleranceDays !== undefined) options.dateToleranceDays = req.body.dateToleranceDays;
    if (req.body.minTokenScore !== undefined) options.minTokenScore = req.body.minTokenScore;
    if (req.body.bookBalance !== undefined) options.bookBalance = req.body.bookBalance;
    if (req.body.bankBalance !== undefined) options.bankBalance = req.body.bankBalance;
    if (req.body.openingBookBalance !== undefined) options.openingBookBalance = req.body.openingBookBalance;
    if (req.body.openingBankBalance !== undefined) options.openingBankBalance = req.body.openingBankBalance;

    if (!bankInput || !bookInput) {
      return res.status(400).json({
        error: 'Both bankInput (bank transactions) and bookInput (book/ledger line items) are required for reconciliation.'
      });
    }

    const result = runBankReconciliation({ bankInput, bookInput, options });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error running bank reconciliation:', err);
    return res.status(500).json({ error: 'Bank reconciliation failed: ' + err.message });
  }
});

import { createBankReconciliationWorkbook } from './bankExcelEngine.js';

/**
 * Generate Multi-Sheet Bank Reconciliation Statement (BRS) Excel Report
 * Includes: BRS Statement Sheet, Exceptions Sheet (sorted by amount desc), Matched Sheet
 */
app.post('/api/bank-recon/generate-excel', async (req, res) => {
  try {
    const { reconResult, metadata } = req.body;
    if (!reconResult || !reconResult.summary) {
      return res.status(400).json({ error: 'Valid reconResult is required to generate Bank Reconciliation Excel report.' });
    }

    const workbook = await createBankReconciliationWorkbook(reconResult, metadata || {});
    const fileId = `Bank_Reconciliation_${crypto.randomUUID()}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, fileId);

    await workbook.xlsx.writeFile(filePath);

    res.json({
      success: true,
      downloadUrl: `/api/download/${fileId}`,
      filename: fileId,
      message: 'Bank Reconciliation BRS Workbook generated successfully.'
    });
  } catch (err) {
    console.error('Error generating Bank Reconciliation Excel report:', err);
    res.status(500).json({ error: 'Failed to generate Bank Reconciliation Excel report: ' + err.message });
  }
});

import { parseTdsDocument, parseTdsDocumentText } from './tdsIngestionEngine.js';
import { extractTdsBookEntries } from './tdsBookEntryExtractor.js';

/**
 * Ingest & Parse Form 26AS / AIS / TRACES Document & Extract Book TDS Entries
 * Returns normalized source entries and normalized book TDS entries (no matching yet)
 */
app.post('/api/tds-recon/upload', upload.any(), async (req, res) => {
  try {
    let sourceResult = null;
    let fileBuffer = null;
    let filename = 'tds_statement';
    let mimeType = '';

    const uploadedFiles = req.files && req.files.length > 0 ? req.files : (req.file ? [req.file] : []);

    if (uploadedFiles.length > 1) {
      const parsedFiles = [];
      const allEntries = [];
      const allWarnings = [];
      const deductorSet = new Set();
      let totalAmountPaid = 0;
      let totalTdsDeducted = 0;

      for (const file of uploadedFiles) {
        try {
          const r = await parseTdsDocument(file.buffer, file.originalname, file.mimetype);
          if (r && r.entries) {
            parsedFiles.push({
              filename: file.originalname,
              size: file.size,
              sourceType: r.sourceType,
              entryCount: r.entries.length,
              totalTds: r.summary?.totalTdsDeducted || 0
            });
            allEntries.push(...r.entries);
            if (r.deductorTANs) {
              r.deductorTANs.forEach(tan => deductorSet.add(tan));
            }
            if (r.summary) {
              totalAmountPaid += (r.summary.totalAmountPaid || 0);
              totalTdsDeducted += (r.summary.totalTdsDeducted || 0);
            }
            if (r.warnings) allWarnings.push(...r.warnings);
          }
        } catch (e) {
          allWarnings.push(`Failed to parse ${file.originalname}: ${e.message}`);
        }
      }

      sourceResult = {
        filename: parsedFiles.map(f => f.filename).join(', '),
        files: parsedFiles,
        totalFiles: parsedFiles.length,
        sourceType: parsedFiles[0]?.sourceType || 'MULTI_FILE_26AS_AIS',
        summary: {
          totalEntries: allEntries.length,
          totalAmountPaid,
          totalTdsDeducted,
          uniqueDeductors: deductorSet.size
        },
        deductorTANs: Array.from(deductorSet),
        entries: allEntries,
        warnings: allWarnings
      };
    } else if (uploadedFiles.length === 1) {
      const file = uploadedFiles[0];
      fileBuffer = file.buffer;
      filename = file.originalname;
      mimeType = file.mimetype;
      sourceResult = await parseTdsDocument(fileBuffer, filename, mimeType);
      if (sourceResult) {
        sourceResult.files = [{ filename, size: file.size, entryCount: sourceResult.entries?.length || 0 }];
        sourceResult.totalFiles = 1;
      }
    } else if (req.body && (req.body.text || req.body.rawText)) {
      const text = req.body.text || req.body.rawText;
      filename = req.body.filename || 'pasted_tds.txt';
      sourceResult = parseTdsDocumentText(text, filename);
    } else if (req.body && req.body.fileData) {
      fileBuffer = Buffer.from(req.body.fileData, 'base64');
      filename = req.body.filename || 'uploaded_tds.bin';
      mimeType = req.body.mimeType || '';
      sourceResult = await parseTdsDocument(fileBuffer, filename, mimeType);
    }

    // Extract book items if provided
    let rawBookItems = req.body?.bookItems || req.body?.bookLineItems || req.body?.lineItems || req.body?.schema || req.body?.books;
    if (typeof rawBookItems === 'string') {
      try {
        rawBookItems = JSON.parse(rawBookItems);
      } catch (e) {
        // if plain string, ignore or parse failed
      }
    }

    const booksResult = extractTdsBookEntries(rawBookItems || []);

    if (!sourceResult && (!rawBookItems || (Array.isArray(rawBookItems) && rawBookItems.length === 0))) {
      return res.status(400).json({
        error: 'Please upload a Form 26AS / AIS / TRACES file or provide book ledger line items.'
      });
    }

    const allWarnings = [
      ...(sourceResult?.warnings || []),
      ...(booksResult?.warnings || [])
    ];

    return res.json({
      success: true,
      source: sourceResult || {
        filename: null,
        sourceType: 'NONE',
        summary: { totalEntries: 0, totalAmountPaid: 0, totalTdsDeducted: 0, uniqueDeductors: 0 },
        deductorTANs: [],
        entries: []
      },
      books: booksResult,
      warnings: allWarnings
    });
  } catch (err) {
    console.error('Error ingesting TDS data:', err);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Direct Book Ledger Ingestion for TDS Reconciliation
 * Supports: Excel (.xlsx, .xls), CSV, Tally XML, PDF, Text files
 */
app.post('/api/tds-recon/upload-books', upload.any(), async (req, res) => {
  try {
    const uploadedFiles = req.files && req.files.length > 0 ? req.files : (req.file ? [req.file] : []);
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'No book ledger file uploaded.' });
    }

    const file = uploadedFiles[0];
    const filename = file.originalname;
    const ext = (filename.split('.').pop() || '').toLowerCase();
    let rawItems = [];

    if (['xlsx', 'xls', 'xlsm'].includes(ext)) {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      let bestSheet = null;
      let maxScore = -1;
      let bestRows = [];
      let bestHeaderIdx = -1;

      for (const sheetName of workbook.SheetNames) {
        // Skip informational sheets
        if (/^(?:help|instructions|enable\s*macros|read\s*me|inter)$/i.test(sheetName)) continue;
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (rows.length < 2) continue;

        let sheetScore = 0;
        let headerIdx = -1;

        for (let r = 0; r < Math.min(15, rows.length); r++) {
          const row = rows[r].map(c => String(c).trim());
          const rowLower = row.map(c => c.toLowerCase());
          
          // Ignore single-item metadata rows like ["Account :TDS Recevable", "", ...]
          const nonBlankCount = row.filter(Boolean).length;
          if (nonBlankCount < 2) continue;
          if (row.some(c => /^account\s*:/i.test(c) || /^report\s*(?:from|to)/i.test(c) || /^company\s*:/i.test(c))) continue;

          const hasDate = rowLower.some(c => c.includes('date'));
          const hasPartyOrDesc = rowLower.some(c => 
            c.includes('particular') || c.includes('narration') || c.includes('ledger') || 
            c.includes('party') || c.includes('row labels') || c.includes('name') || c.includes('description')
          );
          const hasDebitCredit = rowLower.some(c => 
            c.includes('debit') || c.includes('credit') || c.includes('sum of debit') || 
            c.includes('dr') || c.includes('cr') || c === 'amount' || c.includes('tds')
          );

          if (hasPartyOrDesc && hasDebitCredit) {
            headerIdx = r;
            sheetScore = 10 + nonBlankCount * 2 + (hasDate ? 25 : 0) + (rows.length > 50 ? 20 : 0);
            break;
          }
        }

        if (sheetScore > maxScore) {
          maxScore = sheetScore;
          bestSheet = sheetName;
          bestRows = rows;
          bestHeaderIdx = headerIdx;
        }
      }

      // If no high scoring sheet, fallback to first sheet
      if (bestHeaderIdx === -1 && workbook.SheetNames.length > 0) {
        bestSheet = workbook.SheetNames[0];
        bestRows = XLSX.utils.sheet_to_json(workbook.Sheets[bestSheet], { header: 1, defval: '' });
        bestHeaderIdx = 0;
      }

      if (bestRows.length > 0 && bestHeaderIdx !== -1) {
        const headers = bestRows[bestHeaderIdx].map(h => String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
        const dateCol = headers.findIndex(h => h.includes('date'));
        const docNoCol = headers.findIndex(h => h.includes('docno') || h.includes('vchno') || h.includes('voucherno') || h.includes('invno') || h.includes('refno') || h.includes('ref'));
        const vchTypeCol = headers.findIndex(h => h.includes('vchtype') || h.includes('vouchertype') || h.includes('type'));
        const partyCol = headers.findIndex(h => 
          h.includes('narration') || h.includes('particular') || h.includes('ledger') || 
          h.includes('party') || h.includes('rowlabels') || h.includes('name') || h.includes('description')
        );
        const debitCol = headers.findIndex(h => h === 'debit' || h.includes('debit') || h.includes('dr'));
        const creditCol = headers.findIndex(h => h === 'credit' || h.includes('credit') || h.includes('cr'));
        const amountCol = headers.findIndex(h => h === 'amount' || h.includes('amount') || h.includes('tds'));
        const tanCol = headers.findIndex(h => h.includes('tan') || h.includes('pan'));
        const secCol = headers.findIndex(h => h.includes('sec') || h.includes('section'));

        for (let r = bestHeaderIdx + 1; r < bestRows.length; r++) {
          const row = bestRows[r];
          if (!row || row.length === 0) continue;

          const rawLabel = partyCol !== -1 ? String(row[partyCol] || '').trim() : String(row[0] || '').trim();
          if (!rawLabel || /^(?:total|grand total|opening balance|closing balance)/i.test(rawLabel)) continue;

          const debitVal = debitCol !== -1 ? (parseFloat(String(row[debitCol]).replace(/[^0-9\.-]/g, '')) || 0) : 0;
          const creditVal = creditCol !== -1 ? (parseFloat(String(row[creditCol]).replace(/[^0-9\.-]/g, '')) || 0) : 0;
          const amountVal = amountCol !== -1 ? (parseFloat(String(row[amountCol]).replace(/[^0-9\.-]/g, '')) || 0) : (debitVal || creditVal);

          if (debitVal === 0 && creditVal === 0 && amountVal === 0) continue;

          // Clean narration to isolate party name
          const cleanParty = rawLabel
            .replace(/\s*TDS\s*TDS.*$/i, '')
            .replace(/\s*TDS\s*-\s*ACT.*$/i, '')
            .replace(/\s*-\s*ACT\.\s*RECD.*$/i, '')
            .replace(/\s*TDS.*$/i, '')
            .trim();

          rawItems.push({
            label: rawLabel,
            partyName: cleanParty || rawLabel,
            accountHead: rawLabel,
            date: dateCol !== -1 ? String(row[dateCol] || '').trim() : null,
            refNo: docNoCol !== -1 ? String(row[docNoCol] || '').trim() : null,
            voucherType: vchTypeCol !== -1 ? String(row[vchTypeCol] || '').trim() : null,
            debit: debitVal,
            credit: creditVal,
            amount: amountVal,
            type: debitVal > 0 ? 'RECEIVABLE' : (creditVal > 0 ? 'PAYABLE' : 'RECEIVABLE'),
            tan: tanCol !== -1 ? String(row[tanCol] || '').replace(/\s+/g, '').toUpperCase() : null,
            section: secCol !== -1 ? String(row[secCol] || '').trim().toUpperCase() : null
          });
        }
      }
    } else if (ext === 'csv') {
      const text = file.buffer.toString('utf-8');
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length > 0) {
        const delimiter = lines[0].includes('\t') ? '\t' : (lines[0].includes('|') ? '|' : ',');
        const headers = lines[0].split(delimiter).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
        const dateCol = headers.findIndex(h => h.includes('date'));
        const docNoCol = headers.findIndex(h => h.includes('docno') || h.includes('vchno') || h.includes('ref'));
        const partyCol = headers.findIndex(h => h.includes('narration') || h.includes('particular') || h.includes('ledger') || h.includes('party') || h.includes('name'));
        const debitCol = headers.findIndex(h => h.includes('debit') || h.includes('dr'));
        const creditCol = headers.findIndex(h => h.includes('credit') || h.includes('cr'));
        const amountCol = headers.findIndex(h => h.includes('amount') || h.includes('tds'));
        const tanCol = headers.findIndex(h => h.includes('tan') || h.includes('pan'));
        const secCol = headers.findIndex(h => h.includes('sec'));

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(delimiter).map(c => c.replace(/^"|"$/g, '').trim());
          const rawLabel = partyCol !== -1 ? cols[partyCol] : cols[0];
          if (!rawLabel || /^(?:total|grand total|opening balance|closing balance)/i.test(rawLabel)) continue;
          const debit = debitCol !== -1 ? parseFloat(cols[debitCol]?.replace(/[^0-9\.-]/g, '')) || 0 : 0;
          const credit = creditCol !== -1 ? parseFloat(cols[creditCol]?.replace(/[^0-9\.-]/g, '')) || 0 : 0;
          const amount = amountCol !== -1 ? parseFloat(cols[amountCol]?.replace(/[^0-9\.-]/g, '')) || 0 : (debit || credit);
          if (debit === 0 && credit === 0 && amount === 0) continue;

          const cleanParty = rawLabel
            .replace(/\s*TDS\s*TDS.*$/i, '')
            .replace(/\s*TDS\s*-\s*ACT.*$/i, '')
            .replace(/\s*-\s*ACT\.\s*RECD.*$/i, '')
            .replace(/\s*TDS.*$/i, '')
            .trim();

          rawItems.push({
            label: rawLabel,
            partyName: cleanParty || rawLabel,
            accountHead: rawLabel,
            date: dateCol !== -1 ? cols[dateCol] : null,
            refNo: docNoCol !== -1 ? cols[docNoCol] : null,
            debit,
            credit,
            amount,
            type: debit > 0 ? 'RECEIVABLE' : (credit > 0 ? 'PAYABLE' : 'RECEIVABLE'),
            tan: tanCol !== -1 ? cols[tanCol].replace(/\s+/g, '').toUpperCase() : null,
            section: secCol !== -1 ? cols[secCol].toUpperCase() : null
          });
        }
      }
    } else {
      const parsedDoc = await parseUploadedDocument(file.buffer, filename, file.mimetype);
      const textLines = (parsedDoc.extractedText || '').split(/\r?\n/).filter(l => l.trim().length > 0);
      for (const line of textLines) {
        if (/tds|tax|194|192|206/i.test(line)) {
          const numMatch = line.match(/(?:₹|Rs\.?)?\s*([0-9,]+(?:\.[0-9]{2})?)/);
          const amt = numMatch ? parseFloat(numMatch[1].replace(/,/g, '')) : 0;
          rawItems.push({ label: line.trim(), amount: amt });
        }
      }
    }

    const booksResult = extractTdsBookEntries(rawItems);
    return res.json({
      success: true,
      books: {
        filename,
        entries: booksResult.entries,
        summary: booksResult.summary
      },
      warnings: booksResult.warnings
    });
  } catch (err) {
    console.error('Error in /api/tds-recon/upload-books:', err);
    return res.status(500).json({ error: 'Failed to parse book ledger: ' + err.message });
  }
});

import { findAndLoadTdsDocumentsForTan } from './tdsAutoLoader.js';

/**
 * Auto-detect and ingest TDS Form 26AS/AIS and Book Ledger by TAN
 * Enables zero-friction, 1-click automatic document fetching from local data repository
 */
app.post('/api/tds-recon/auto-load-by-tan', async (req, res) => {
  try {
    const { tan } = req.body;
    const result = await findAndLoadTdsDocumentsForTan(tan);
    return res.json(result);
  } catch (err) {
    console.error('Error in /api/tds-recon/auto-load-by-tan:', err);
    return res.status(500).json({ error: 'Failed to auto-load TDS documents: ' + err.message });
  }
});

import { runTdsReconciliation } from './tdsReconEngine.js';

/**
 * Run Statutory TDS Reconciliation Matching & Default Engine
 * Reconciles 26AS/AIS against Book TDS entries and computes Sec 234E / 201(1A) penalties
 */
app.post('/api/tds-recon/reconcile', (req, res) => {
  try {
    const sourceEntries = req.body.sourceEntries || req.body.tdsSourceEntries || req.body.source?.entries || [];
    const bookEntries = req.body.bookEntries || req.body.tdsBookEntries || req.body.books?.entries || req.body.bookLineItems || [];
    const options = req.body.options || {};
    if (req.body.toleranceAmount !== undefined) options.toleranceAmount = req.body.toleranceAmount;
    if (req.body.asOnDate !== undefined) options.asOnDate = req.body.asOnDate;

    if (!Array.isArray(sourceEntries) && !Array.isArray(bookEntries)) {
      return res.status(400).json({ error: 'Valid sourceEntries and/or bookEntries are required.' });
    }

    const result = runTdsReconciliation({
      sourceEntries,
      bookEntries,
      options
    });

    return res.json(result);
  } catch (err) {
    console.error('Error running TDS reconciliation:', err);
    return res.status(500).json({ error: 'TDS reconciliation failed: ' + err.message });
  }
});

import { createTdsReconciliationWorkbook } from './tdsExcelEngine.js';

/**
 * Generate Multi-Sheet Statutory TDS Reconciliation Excel Report
 * Includes:
 * 1. Summary: Books vs 26AS, Defaults counters, Sec 201(1A) interest & Sec 234E late fees, CA certification
 * 2. Section-wise reconciliation: Aggregation by TAN + Section with variance and recommendations
 * 3. Exceptions detail: Unmatched/short-deducted items sorted descending by financial exposure
 */
app.post('/api/tds-recon/generate-excel', async (req, res) => {
  try {
    const { reconResult, metadata } = req.body;
    if (!reconResult || !reconResult.summary) {
      return res.status(400).json({ error: 'Valid reconResult is required to generate TDS Reconciliation Excel report.' });
    }

    const workbook = await createTdsReconciliationWorkbook(reconResult, metadata || {});
    const fileId = `TDS_Reconciliation_${crypto.randomUUID()}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, fileId);

    await workbook.xlsx.writeFile(filePath);

    res.json({
      success: true,
      downloadUrl: `/api/download/${fileId}`,
      filename: fileId,
      message: 'TDS Statutory Reconciliation Workbook generated successfully.'
    });
  } catch (err) {
    console.error('Error generating TDS Reconciliation Excel report:', err);
    res.status(500).json({ error: 'Failed to generate TDS Reconciliation Excel report: ' + err.message });
  }
});

import { generateForm3CDAuditReport } from './form3cdEngine.js';

/**
 * Generate Form 3CD Tax Audit Statement of Particulars
 * Derives Clause 13 (Method/ICDS), Clause 21 (Sec 40A(3) cash & Sec 40(a)(ia) TDS),
 * Clause 26 (Sec 43B / 43B(h) MSME), Clause 34 (TDS/TCS Chapter XVII-B & Sec 201(1A) interest),
 * and enforces the Honest-Gap pattern for external clauses (Clause 17, 23, 31, etc.)
 */
app.post('/api/form3cd/generate', (req, res) => {
  try {
    const { schema, tdsReconResult, gstReconResult, bankReconResult, auditorInputs } = req.body;
    if (!schema && !tdsReconResult) {
      return res.status(400).json({ error: 'Financial schema or TDS reconciliation result is required to generate Form 3CD.' });
    }

    const report = generateForm3CDAuditReport({
      schema: schema || {},
      tdsReconResult: tdsReconResult || null,
      gstReconResult: gstReconResult || null,
      bankReconResult: bankReconResult || null,
      auditorInputs: auditorInputs || {}
    });

    res.json({
      success: true,
      report
    });
  } catch (err) {
    console.error('Error generating Form 3CD Tax Audit report:', err);
    res.status(500).json({ error: 'Failed to generate Form 3CD Tax Audit report: ' + err.message });
  }
});

import { processConversationalTurn } from './conversationalEngine.js';

/**
 * Interactive Conversational CA Chat (Multi-Turn Assistant)
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { userMessage, currentSchema, chatHistory, preferredModel, aiProvider, apiKey } = req.body;

    if (!userMessage) {
      return res.status(400).json({ error: 'userMessage is required.' });
    }

    const conversationResult = await processConversationalTurn({
      userMessage,
      currentSchema,
      chatHistory: chatHistory || [],
      preferredModel,
      aiProvider,
      apiKey
    });

    res.json(conversationResult);
  } catch (error) {
    console.error('Error in conversational CA chat:', error);
    res.status(500).json({ error: 'Chat failed: ' + error.message });
  }
});

/**
 * Analyze Financial Data (via Claude Brain, Local LLM, or Rule Engine)
 */
app.post('/api/analyze', async (req, res) => {
  try {
    const { rawText, userPrompt, preferredModel, explicitRegime, aiProvider, apiKey } = req.body;

    if (!rawText && !userPrompt) {
      return res.status(400).json({ error: 'Please provide financial data or a prompt.' });
    }

    const analyzedSchema = await analyzeFinancials(
      rawText || '', 
      userPrompt || '', 
      preferredModel, 
      explicitRegime || 'AUTO',
      { aiProvider, apiKey }
    );
    res.json({
      success: true,
      schema: analyzedSchema
    });
  } catch (error) {
    console.error('Error analyzing financials:', error);
    res.status(500).json({ error: 'Analysis failed: ' + error.message });
  }
});

/**
 * Generate Excel (.xlsx) file from financial schema
 */
app.post('/api/generate-excel', async (req, res) => {
  try {
    const { schema } = req.body;

    if (!schema) {
      return res.status(400).json({ error: 'Schema is required to generate Excel file.' });
    }

    const workbook = await createFinancialWorkbook(schema);

    const fileId = `Financial_Report_${crypto.randomUUID()}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, fileId);

    await workbook.xlsx.writeFile(filePath);

    res.json({
      success: true,
      filename: fileId,
      downloadUrl: `/api/download/${fileId}`,
      docType: schema.docType,
      title: schema.title
    });
  } catch (error) {
    console.error('Error generating Excel document:', error);
    res.status(500).json({ error: 'Failed to generate Excel file: ' + error.message });
  }
});

/**
 * Download generated Excel document (Path Traversal Protected)
 */
app.get('/api/download/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(OUTPUT_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Requested file not found or expired.' });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  
  stream.on('error', (err) => {
    console.error('Error streaming download file:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Download stream error' });
  });
});

/**
 * Tally Sync API: Health & Connection Check
 */
app.get('/api/tally/status', async (req, res) => {
  const host = req.query.host || '127.0.0.1';
  const port = parseInt(req.query.port, 10) || 9000;
  const status = await checkTallyConnection(host, port);
  res.json(status);
});

/**
 * Tally Sync API: Get list of open companies
 */
app.get('/api/tally/companies', async (req, res) => {
  const host = req.query.host || '127.0.0.1';
  const port = parseInt(req.query.port, 10) || 9000;
  const companies = await getTallyCompanies(host, port);
  res.json(companies);
});

/**
 * Tally Sync API: Pull live Trial Balance / Ledgers from Tally
 */
app.post('/api/tally/sync-data', async (req, res) => {
  try {
    const { host, port, companyName } = req.body;
    const targetHost = host || '127.0.0.1';
    const targetPort = parseInt(port, 10) || 9000;

    const syncResult = await fetchTallyTrialBalance(targetHost, targetPort, companyName || '');
    res.json(syncResult);
  } catch (error) {
    console.error('Error syncing data from Tally:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Tally Sync API: Fetch available Bank Account ledgers
 */
app.get('/api/tally/bank-ledgers', async (req, res) => {
  try {
    const host = req.query.host || '127.0.0.1';
    const port = parseInt(req.query.port, 10) || 9000;
    const companyName = req.query.companyName || '';
    const result = await fetchTallyBankLedgers(host, port, companyName);
    res.json(result);
  } catch (error) {
    console.error('Error fetching bank ledgers from Tally:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Tally Sync API: Pull Bank Book vouchers for BRS
 */
app.post('/api/tally/sync-bank-book', async (req, res) => {
  try {
    const { host, port, companyName, ledgerName } = req.body;
    const targetHost = host || '127.0.0.1';
    const targetPort = parseInt(port, 10) || 9000;
    const result = await fetchTallyBankBook(targetHost, targetPort, companyName || '', ledgerName || '');
    res.json(result);
  } catch (error) {
    console.error('Error syncing bank book from Tally:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Tally Sync API: Pull Purchase Register vouchers with GST breakdown
 */
app.post('/api/tally/sync-purchase-register', async (req, res) => {
  try {
    const { host, port, companyName } = req.body;
    const targetHost = host || '127.0.0.1';
    const targetPort = parseInt(port, 10) || 9000;
    const result = await fetchTallyPurchaseRegister(targetHost, targetPort, companyName || '');
    res.json(result);
  } catch (error) {
    console.error('Error syncing purchase register from Tally:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Tally Sync API: Pull TDS Ledgers & Vouchers for 26AS Recon
 */
app.post('/api/tally/sync-tds-ledgers', async (req, res) => {
  try {
    const { host, port, companyName } = req.body;
    const targetHost = host || '127.0.0.1';
    const targetPort = parseInt(port, 10) || 9000;
    const result = await fetchTallyTdsEntries(targetHost, targetPort, companyName || '');
    res.json(result);
  } catch (error) {
    console.error('Error syncing TDS ledgers from Tally:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Tally Sync API: Pull Cash Book & MSME Creditor data for Form 3CD
 */
app.post('/api/tally/sync-form3cd-data', async (req, res) => {
  try {
    const { host, port, companyName } = req.body;
    const targetHost = host || '127.0.0.1';
    const targetPort = parseInt(port, 10) || 9000;
    const result = await fetchTallyCashBookAndAuditData(targetHost, targetPort, companyName || '');
    res.json(result);
  } catch (error) {
    console.error('Error syncing Form 3CD audit data from Tally:', error);
    res.status(500).json({ error: error.message });
  }
});

// Catch-all handler for unhandled API requests (guarantees JSON instead of HTML)
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.method} ${req.originalUrl || req.url}`
  });
});

// Serve frontend production build statically
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// Global Express error handling middleware: guarantees JSON responses on any server exception
app.use((err, req, res, next) => {
  console.error('Express caught unhandled error:', err);
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = err.status || err.statusCode || (err.name === 'MulterError' ? 400 : 500);
  res.status(statusCode).json({
    success: false,
    error: err.message || 'An internal server error occurred',
    code: err.code || err.name || 'SERVER_ERROR'
  });
});

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`Local AI Financial Bot Server running on port ${PORT}`);
  console.log(`Web App URL: http://localhost:${PORT} or http://127.0.0.1:${PORT}`);
  console.log(`Bound to: 0.0.0.0 (Supports both 127.0.0.1 and localhost)`);
  console.log(`====================================================`);

  // Dynamic background warm-up of local Ollama LLM if available
  getOllamaStatus()
    .then(status => {
      if (status.connected && status.models.length > 0) {
        const warmupModel = status.models.find(m => m.includes('ca-brain')) || status.models.find(m => !m.includes('moondream')) || status.models[0];
        fetch('http://127.0.0.1:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: warmupModel,
            prompt: 'warmup',
            stream: false
          })
        })
        .then(() => console.log(`✓ Local AI Model (${warmupModel}) warmed up in memory and ready.`))
        .catch(() => console.log('Ollama standby: will connect on first request.'));
      } else {
        console.log('Ollama standby: will connect on first request.');
      }
    })
    .catch(() => {});
});

