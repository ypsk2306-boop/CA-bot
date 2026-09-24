import React, { useState, useRef } from 'react';
import { 
  Building2, CreditCard, UploadCloud, FileSpreadsheet, CheckCircle2, 
  AlertTriangle, ArrowRight, Loader2, Sparkles, Search, Sliders, 
  Download, Scale, RefreshCw, FileText, Check, ShieldCheck, AlertCircle,
  Server, X
} from 'lucide-react';

export default function BankReconView({ currentSchema }) {
  const [bankFiles, setBankFiles] = useState([]);
  const [bankData, setBankData] = useState(null);
  const [isUploadingBank, setIsUploadingBank] = useState(false);
  const [isBankDragOver, setIsBankDragOver] = useState(false);

  const [bookFile, setBookFile] = useState(null);
  const [bookData, setBookData] = useState(null);
  const [isUploadingBook, setIsUploadingBook] = useState(false);

  // Tally Sync States
  const [isSyncingTally, setIsSyncingTally] = useState(false);
  const [tallyBankLedgers, setTallyBankLedgers] = useState([]);
  const [showLedgerPicker, setShowLedgerPicker] = useState(false);
  const [selectedLedgerName, setSelectedLedgerName] = useState('');
  const [tallyConnectionInfo, setTallyConnectionInfo] = useState(null);

  const [dateTolerance, setDateTolerance] = useState(3);
  const [minTokenScore, setMinTokenScore] = useState(0.20);
  const [openingBookBalance, setOpeningBookBalance] = useState('');

  const [isReconciling, setIsReconciling] = useState(false);
  const [reconResult, setReconResult] = useState(null);
  const [activeTab, setActiveTab] = useState('matched'); // 'matched' | 'unmatched_books' | 'unmatched_bank' | 'brs_statement'
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);

  const bankInputRef = useRef(null);
  const bookInputRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // 1. Bank Statement Upload (supports multi-file)
  const handleUploadBank = async (filesOrEvent) => {
    const fileArray = filesOrEvent?.target ? Array.from(filesOrEvent.target.files || []) : Array.from(filesOrEvent || []);
    if (fileArray.length === 0) return;
    setIsUploadingBank(true);

    const formData = new FormData();
    fileArray.forEach(f => formData.append('files', f));

    try {
      const res = await fetch('/api/bank-recon/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        const newFilesMeta = data.files || fileArray.map(f => ({
          filename: f.name,
          transactionCount: data.transactions?.length || 0
        }));
        setBankFiles(newFilesMeta);
        setBankData(data);
        showToast(`Parsed ${data.totalFiles || fileArray.length} bank statement(s): ${data.transactions?.length || 0} transactions.`);
      } else {
        alert('Error parsing bank statement: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setIsUploadingBank(false);
      if (bankInputRef.current) bankInputRef.current.value = '';
    }
  };

  const handleRemoveBankFile = (filenameToRemove) => {
    const remainingFiles = bankFiles.filter(f => f.filename !== filenameToRemove);
    if (remainingFiles.length === 0) {
      setBankFiles([]);
      setBankData(null);
      showToast('Cleared bank statements.');
      return;
    }
    setBankFiles(remainingFiles);
    showToast(`Removed ${filenameToRemove}.`);
  };

  // 2. Book / Ledger Upload (or raw text)
  const handleUploadBook = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBookFile(file);
    setIsUploadingBook(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && data.extractedText) {
        // Also parse line items via extraction
        const analyzeRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawText: data.extractedText,
            userPrompt: 'Extract ledger line items for bank reconciliation',
            explicitRegime: 'TRIAL_BALANCE',
            aiProvider: 'rules'
          })
        });
        const analyzeJson = await analyzeRes.json();
        const items = analyzeJson.schema?.lineItems || [];
        setBookData({
          filename: file.name,
          items
        });
        showToast(`Loaded Book Ledger: ${items.length} line items.`);
      } else {
        alert('Error reading ledger file: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Ledger upload failed: ' + err.message);
    } finally {
      setIsUploadingBook(false);
    }
  };

  // 2b. Direct Tally XML Port Sync
  const handleOpenTallySync = async () => {
    setIsSyncingTally(true);
    try {
      const res = await fetch('/api/tally/bank-ledgers');
      const data = await res.json();
      if (data.success && data.ledgers?.length > 0) {
        setTallyBankLedgers(data.ledgers);
        setTallyConnectionInfo({ online: data.online, source: data.source });
        setSelectedLedgerName(data.ledgers[0].name);
        setShowLedgerPicker(true);
      } else {
        await handleExecuteTallyBankSync('HDFC Bank Current A/c');
      }
    } catch (err) {
      console.error('Tally fetch error:', err);
      await handleExecuteTallyBankSync('HDFC Bank Current A/c');
    } finally {
      setIsSyncingTally(false);
    }
  };

  const handleExecuteTallyBankSync = async (ledgerName) => {
    const targetLedger = ledgerName || selectedLedgerName || 'HDFC Bank Current A/c';
    setIsSyncingTally(true);
    try {
      const res = await fetch('/api/tally/sync-bank-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ledgerName: targetLedger })
      });
      const data = await res.json();
      if (data.success) {
        setBookData({
          filename: `Tally: ${data.ledgerName} (${data.online ? 'Live Port 9000' : 'Simulated'})`,
          items: data.items,
          transactions: data.transactions,
          source: data.source
        });
        if (data.summary?.openingBalance !== undefined) {
          setOpeningBookBalance(String(data.summary.openingBalance));
        }
        setShowLedgerPicker(false);
        showToast(`Synced ${data.count} bank vouchers from Tally for ${data.ledgerName}!`);
      } else {
        alert('Tally Bank Sync failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Tally Bank Sync failed: ' + err.message);
    } finally {
      setIsSyncingTally(false);
    }
  };

  // 3. One-Click Sample Data Loader
  const handleLoadSampleData = () => {
    const sampleBank = {
      bankName: 'HDFC Bank',
      accountNumber: '50200012345678',
      ifsc: 'HDFC0000123',
      accountType: 'CURRENT',
      statementPeriod: { from: '2024-04-01', to: '2024-04-10' },
      openingBalance: 200000,
      closingBalance: 221249.50,
      summary: {
        totalDebit: 80000.50,
        totalCredit: 101250.00
      },
      transactions: [
        { date: '2024-04-01', narration: 'NEFT TO ARUN KUMAR SALARY', debit: 50000, credit: 0, runningBalance: 150000, refNo: 'NEFT001' },
        { date: '2024-04-02', narration: 'BY TRF M/S APEX INDUSTRIES', debit: 0, credit: 100000, runningBalance: 250000, refNo: 'NEFT99' },
        { date: '2024-04-05', narration: 'IMPS TRANSFER TATA POWER BILL', debit: 4250.50, credit: 0, runningBalance: 245749.50, refNo: 'IMPS77' },
        { date: '2024-04-08', narration: 'CLG CHEQUE CLEARING VENDOR X', debit: 25000, credit: 0, runningBalance: 220749.50, refNo: '003344' },
        { date: '2024-04-10', narration: 'CONSOLIDATED SERVICE CHGS & GST', debit: 750, credit: 0, runningBalance: 219999.50, refNo: null },
        { date: '2024-04-10', narration: 'INTEREST CREDIT CAPITALIZED', debit: 0, credit: 1250, runningBalance: 221249.50, refNo: null }
      ]
    };

    const sampleBooks = {
      filename: 'Sample_Cash_Book_Ledger.xlsx',
      items: [
        { date: '2024-04-01', label: 'Salary - Arun Kumar', debit: 0, credit: 50000, refNo: 'NEFT001', category: 'EMPLOYEE_BENEFITS' },
        { date: '2024-04-02', label: 'Apex Industries Advance Receipt', debit: 100000, credit: 0, refNo: 'NEFT99', category: 'REVENUE' },
        { date: '2024-04-03', label: 'Tata Power Electricity Bill', debit: 0, credit: 4250.50, category: 'OTHER_EXPENSES' },
        { date: '2024-04-03', label: 'Cheque issued to Vendor X', debit: 0, credit: 25000, refNo: '003344', category: 'TRADE_PAYABLES' },
        { date: '2024-04-09', label: 'Cheque issued to Supplier B (Unpresented)', debit: 0, credit: 18000, refNo: '003345', category: 'TRADE_PAYABLES' },
        { date: '2024-04-09', label: 'Cheque received from Customer C (In Transit)', debit: 35000, credit: 0, refNo: '009876', category: 'TRADE_RECEIVABLES' }
      ]
    };

    setBankData(sampleBank);
    setBookData(sampleBooks);
    setOpeningBookBalance('200000');
    showToast('Loaded demo Bank Statement & Cash Book dataset.');
  };

  // 4. Use Existing Financial Pipeline Line Items
  const handleUseActivePipeline = () => {
    if (!currentSchema?.lineItems?.length) {
      alert('No active financial statement line items found. Please generate or paste financials first.');
      return;
    }
    setBookData({
      filename: 'Active Financial Pipeline Items',
      items: currentSchema.lineItems
    });
    showToast(`Imported ${currentSchema.lineItems.length} line items from active financials.`);
  };

  // 5. Execute Bank Reconciliation
  const handleRunReconciliation = async () => {
    if (!bankData?.transactions?.length) {
      alert('Please upload or load a bank statement before running reconciliation.');
      return;
    }
    if (!bookData?.items?.length) {
      alert('Please upload or load cash/bank book line items before running reconciliation.');
      return;
    }

    setIsReconciling(true);
    try {
      const res = await fetch('/api/bank-recon/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankInput: bankData,
          bookInput: { lineItems: bookData.items },
          options: {
            dateToleranceDays: parseInt(dateTolerance, 10) || 3,
            minTokenScore: parseFloat(minTokenScore) || 0.20,
            openingBookBalance: openingBookBalance ? parseFloat(openingBookBalance) : undefined,
            openingBankBalance: bankData.openingBalance || undefined
          }
        })
      });

      const data = await res.json();
      if (data.success) {
        setReconResult(data);
        showToast('Bank Reconciliation complete!');
      } else {
        alert('Reconciliation error: ' + (data.error || 'Failed'));
      }
    } catch (err) {
      alert('Reconciliation request failed: ' + err.message);
    } finally {
      setIsReconciling(false);
    }
  };

  // 6. Download BRS Excel Workbook (.xlsx)
  const handleDownloadExcel = async () => {
    if (!reconResult) {
      alert('Please run reconciliation first before downloading the Excel BRS workbook.');
      return;
    }

    setIsDownloadingExcel(true);
    try {
      const res = await fetch('/api/bank-recon/generate-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reconResult,
          metadata: {
            bankName: bankData?.bankName || 'Bank',
            accountNumber: bankData?.accountNumber || '',
            companyName: currentSchema?.title || currentSchema?.entityName || 'Entity Account',
            asOnDate: bankData?.statementPeriod?.to || new Date().toISOString().split('T')[0]
          }
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to generate Excel BRS workbook');
      }

      const data = await res.json();
      if (data.downloadUrl) {
        const a = document.createElement('a');
        a.href = data.downloadUrl;
        a.download = data.filename || 'Bank_Reconciliation_BRS.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Downloaded BRS Excel workbook: ' + (data.filename || ''));
      }
    } catch (err) {
      console.error('Download error:', err);
      alert('Error downloading Excel: ' + err.message);
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  // Filter items by search query
  const filterList = (list = []) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(item => {
      const text = [
        item.narration, item.label, item.refNo, item.canonicalRef, 
        item.suggestedCategory, item.bankTx?.narration, item.bookTx?.label
      ].filter(Boolean).join(' ').toLowerCase();
      return text.includes(q);
    });
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 py-2.5 px-4 rounded-lg bg-blue-600 text-white text-xs shadow-xl flex items-center gap-2 border border-blue-400">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Quick Action Bar */}
      <div className="surface-card p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Bank Reconciliation Statement (BRS) Engine
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-900/50 border border-blue-700 text-blue-300 font-mono">
                  Two-Pass + Transit Delay
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Reconcile raw bank statement exports (PDF, Excel, CSV) against accounting book ledgers with exact paise precision.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleLoadSampleData}
            className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Load Demo Dataset</span>
          </button>

          <button
            onClick={handleOpenTallySync}
            disabled={isSyncingTally}
            className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 text-cyan-400 border-cyan-800/40 hover:bg-cyan-950/30"
          >
            {isSyncingTally ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Syncing Tally...</span>
              </>
            ) : (
              <>
                <Server className="w-3.5 h-3.5" />
                <span>Sync Tally Bank Book</span>
              </>
            )}
          </button>

          {currentSchema?.lineItems?.length > 0 && (
            <button
              onClick={handleUseActivePipeline}
              className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 text-slate-300 hover:text-white"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span>Use Active Financials ({currentSchema.lineItems.length})</span>
            </button>
          )}

          {reconResult && (
            <button
              onClick={handleDownloadExcel}
              disabled={isDownloadingExcel}
              className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 text-emerald-400 border-emerald-800/40 hover:bg-emerald-950/30"
            >
              {isDownloadingExcel ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Export BRS (.xlsx)</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={handleRunReconciliation}
            disabled={isReconciling || !bankData || !bookData}
            className={`btn-primary text-xs flex items-center gap-1.5 py-2 px-4 ${
              isReconciling || !bankData || !bookData ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isReconciling ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Reconciling...</span>
              </>
            ) : (
              <>
                <Scale className="w-3.5 h-3.5" />
                <span>Reconcile Accounts</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Dual Ingestion Dropzone Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Bank Statement Dropzone */}
        <div className="surface-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  1. Bank Statement (Passbook)
                </h3>
              </div>
              {bankData && (
                <span className="badge-matched text-[11px] font-mono">
                  {bankData.transactions?.length || 0} Transactions
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Upload PDF (digital or scanned with OCR), Excel (.xlsx/.xls), CSV, or TXT statements from any Indian bank.
            </p>

            <input
              type="file"
              ref={bankInputRef}
              multiple
              onChange={handleUploadBank}
              accept=".pdf,.xlsx,.xls,.csv,.tsv,.txt"
              className="hidden"
            />

            <div
              onDragOver={(e) => { e.preventDefault(); setIsBankDragOver(true); }}
              onDragLeave={() => setIsBankDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsBankDragOver(false);
                if (e.dataTransfer.files?.length) {
                  handleUploadBank(e.dataTransfer.files);
                }
              }}
              onClick={() => bankInputRef.current?.click()}
              className={`p-5 rounded-lg border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
                isBankDragOver
                  ? 'border-blue-400 bg-blue-950/30'
                  : bankFiles.length > 0
                  ? 'border-emerald-600/40 bg-emerald-950/10'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-900'
              }`}
            >
              {isUploadingBank ? (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                  <span className="text-xs">Parsing Statements with Multi-Layout Engine...</span>
                </div>
              ) : bankFiles.length > 0 ? (
                <div className="flex flex-col items-center gap-1.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <div className="text-xs font-medium text-slate-200">
                    {bankFiles.length} Statement File(s) Loaded • {bankData?.transactions?.length || 0} Total Transactions
                  </div>
                  <span className="text-[10px] text-blue-400 hover:underline mt-0.5">Click or drop to add more statements</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <UploadCloud className="w-6 h-6 text-slate-500" />
                  <div className="text-xs font-medium text-slate-300">
                    Drop One or More Bank Statements here or <span className="text-blue-400">Browse</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Multiple PDF, XLSX, CSV, TXT</div>
                </div>
              )}
            </div>

            {/* Uploaded Bank Statement Files List */}
            {bankFiles.length > 0 && (
              <div className="mt-2.5 space-y-1.5 max-h-32 overflow-y-auto pr-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
                  <span>Uploaded Statements ({bankFiles.length})</span>
                  <button 
                    type="button" 
                    onClick={(e) => { e.stopPropagation(); setBankFiles([]); setBankData(null); }}
                    className="text-slate-400 hover:text-red-400 transition-colors font-medium"
                  >
                    Clear All
                  </button>
                </div>
                {bankFiles.map((f, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-md px-2.5 py-1 text-xs text-slate-300"
                  >
                    <div className="flex items-center gap-2 truncate mr-2">
                      <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate font-medium text-[11px]" title={f.filename}>{f.filename}</span>
                      {f.transactionCount !== undefined && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950/60 text-blue-400 border border-blue-800/40 font-mono shrink-0">
                          {f.transactionCount} txs
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemoveBankFile(f.filename); }}
                      className="text-slate-400 hover:text-red-400 p-0.5 rounded hover:bg-red-950/40 transition-colors shrink-0"
                      title="Remove file"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Statement Quick Metadata */}
          {bankData && (
            <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-3 gap-2 text-[11px] font-mono">
              <div>
                <span className="text-slate-500 block text-[10px]">BANK</span>
                <span className="text-slate-300">{bankData.bankName || 'Unspecified'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">TOTAL DEBITS</span>
                <span className="text-rose-400">₹{(bankData.summary?.totalDebit || 0).toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">TOTAL CREDITS</span>
                <span className="text-emerald-400">₹{(bankData.summary?.totalCredit || 0).toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Book / Ledger Dropzone */}
        <div className="surface-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  2. Cash / Bank Book (Books)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenTallySync}
                  disabled={isSyncingTally}
                  className="text-[11px] px-2.5 py-1 rounded bg-cyan-950/40 border border-cyan-850 text-cyan-300 hover:bg-cyan-900/50 flex items-center gap-1.5 transition-colors font-medium"
                  title="Direct XML sync from TallyPrime on Port 9000"
                >
                  <Server className="w-3 h-3 text-cyan-400" />
                  <span>Sync Tally</span>
                </button>
                {bookData && (
                  <span className="badge-matched text-[11px] font-mono">
                    {bookData.items?.length || 0} Line Items
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Upload bank ledger extract, Tally trial balance XML, or pull directly from active financial statements.
            </p>

            <input
              type="file"
              ref={bookInputRef}
              onChange={handleUploadBook}
              accept=".xlsx,.xls,.csv,.xml,.txt"
              className="hidden"
            />

            <div
              onClick={() => bookInputRef.current?.click()}
              className={`p-6 rounded-lg border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
                bookData
                  ? 'border-emerald-600/40 bg-emerald-950/10'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-900'
              }`}
            >
              {isUploadingBook ? (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                  <span className="text-xs">Extracting Ledger Heads...</span>
                </div>
              ) : bookData ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  <div className="text-xs font-medium text-slate-200">
                    {bookData.filename}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {bookData.items?.length || 0} ledger vouchers loaded
                  </div>
                  <span className="text-[10px] text-blue-400 hover:underline mt-1">Click to replace file</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <FileSpreadsheet className="w-6 h-6 text-slate-500" />
                  <div className="text-xs font-medium text-slate-300">
                    Drop Cash/Bank Ledger here or <span className="text-blue-400">Browse</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Excel, CSV, Tally XML, or Tabular Text</div>
                </div>
              )}
            </div>
          </div>

          {/* Book Parameters */}
          <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">OPENING BOOK BALANCE (OPTIONAL)</label>
              <input
                type="number"
                value={openingBookBalance}
                onChange={(e) => setOpeningBookBalance(e.target.value)}
                placeholder="e.g. 200000"
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-slate-400">TRANSIT TOLERANCE</label>
                <span className="text-[10px] font-mono text-blue-400">{dateTolerance} Days</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={dateTolerance}
                onChange={(e) => setDateTolerance(parseInt(e.target.value, 10))}
                className="w-full accent-blue-500 cursor-pointer mt-1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Reconciliation Results Section */}
      {reconResult && (
        <div className="flex flex-col gap-6">
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {/* Status Card */}
            <div className="surface-card p-3.5 flex flex-col justify-between col-span-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">BRS STATUS</span>
                {reconResult.summary.isReconciled ? (
                  <span className="badge-matched text-[10px]">BALANCED</span>
                ) : (
                  <span className="badge-blocked text-[10px]">VARIANCE DETECTED</span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <div className={`text-lg font-bold font-mono tabular-nums ${reconResult.summary.isReconciled ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {reconResult.summary.isReconciled ? '₹0.00 Variance' : `₹${reconResult.summary.netVariance.toLocaleString('en-IN')}`}
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">
                {reconResult.summary.isReconciled 
                  ? 'Reconciled Book balance agrees with Bank Statement.' 
                  : 'Timing or unrecorded differences remain.'}
              </p>
            </div>

            {/* Book Balance */}
            <div className="surface-card p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">BOOK BALANCE</span>
              <div className="text-base font-bold font-mono tabular-nums text-white mt-1">
                ₹{(reconResult.summary.bookBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500">Per Cash/Bank Book</span>
            </div>

            {/* Bank Balance */}
            <div className="surface-card p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">BANK BALANCE</span>
              <div className="text-base font-bold font-mono tabular-nums text-white mt-1">
                ₹{(reconResult.summary.bankBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500">Per Passbook</span>
            </div>

            {/* Matched Count */}
            <div className="surface-card p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">MATCHED</span>
              <div className="text-base font-bold font-mono tabular-nums text-emerald-400 mt-1">
                {reconResult.matched?.length || 0}
              </div>
              <span className="text-[10px] text-slate-500">Exact, Ref & Fuzzy</span>
            </div>

            {/* Unmatched Items */}
            <div className="surface-card p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">UNMATCHED</span>
              <div className="text-base font-bold font-mono tabular-nums text-amber-400 mt-1">
                {(reconResult.unmatchedInBooks?.length || 0) + (reconResult.unmatchedInBank?.length || 0)}
              </div>
              <span className="text-[10px] text-slate-500">
                {reconResult.unmatchedInBooks?.length || 0} Bank / {reconResult.unmatchedInBank?.length || 0} Book
              </span>
            </div>
          </div>

          {/* Audit Notes Alert */}
          {reconResult.auditReport?.length > 0 && (
            <div className="surface-card p-4 border-l-4 border-l-blue-500 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Statutory Chartered Accountant Audit Notes</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-1">
                {reconResult.auditReport.map((note, idx) => (
                  <div key={idx} className="text-xs text-slate-300 flex items-start gap-1.5">
                    <span className="text-slate-500">•</span>
                    <span>{note.replace(/^[•✅⚠️]\s*/, '')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Transaction Tabs */}
          <div className="surface-card">
            {/* Tab Navigation & Search Bar */}
            <div className="p-3 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
                <button
                  onClick={() => setActiveTab('matched')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeTab === 'matched'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span>Matched Items</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/60 font-mono">
                    {reconResult.matched?.length || 0}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('unmatched_books')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeTab === 'unmatched_books'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span>Unmatched in Books</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/60 font-mono">
                    {reconResult.unmatchedInBooks?.length || 0}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('unmatched_bank')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeTab === 'unmatched_bank'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span>Unmatched in Bank</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/60 font-mono">
                    {reconResult.unmatchedInBank?.length || 0}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('brs_statement')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeTab === 'brs_statement'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Statutory BRS Statement</span>
                </button>
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter transactions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* TAB 1: Matched Items Table */}
            {activeTab === 'matched' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 text-[11px] uppercase">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Bank Narration</th>
                      <th className="py-2.5 px-3">Book Ledger Item</th>
                      <th className="py-2.5 px-3">Ref / Cheque</th>
                      <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                      <th className="py-2.5 px-3 text-center">Transit</th>
                      <th className="py-2.5 px-3 text-center">Match Tier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {filterList(reconResult.matched).map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                          {m.bankTx?.date || m.bookTx?.date || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-white max-w-xs truncate" title={m.bankTx?.narration}>
                          {m.bankTx?.narration || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 max-w-xs truncate" title={m.bookTx?.label || m.bookTx?.narration}>
                          {m.bookTx?.label || m.bookTx?.narration || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">
                          {m.bankTx?.refNo || m.bookTx?.refNo || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-emerald-400 tabular-nums">
                          ₹{(m.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                          {m.dateDiffDays === 0 ? 'Same Day' : `${m.dateDiffDays}d`}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                            m.matchType === 'EXACT' ? 'bg-emerald-950/60 border border-emerald-700 text-emerald-300' :
                            m.matchType === 'REF_MATCH' ? 'bg-blue-950/60 border border-blue-700 text-blue-300' :
                            'bg-amber-950/60 border border-amber-700 text-amber-300'
                          }`}>
                            {m.matchType} ({m.confidence}%)
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filterList(reconResult.matched).length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                          No matched items found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 2: Unmatched in Books Table */}
            {activeTab === 'unmatched_books' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 text-[11px] uppercase">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Bank Narration</th>
                      <th className="py-2.5 px-3">Ref No</th>
                      <th className="py-2.5 px-3 text-right">Debit / Wdl (₹)</th>
                      <th className="py-2.5 px-3 text-right">Credit / Dep (₹)</th>
                      <th className="py-2.5 px-3">Suggested Category</th>
                      <th className="py-2.5 px-3">Statutory Audit Observation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {filterList(reconResult.unmatchedInBooks).map((u, idx) => (
                      <tr key={idx} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                          {u.date || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-white max-w-sm truncate" title={u.narration}>
                          {u.narration}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">
                          {u.refNo || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-400 tabular-nums">
                          {u.debit > 0 ? `₹${u.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-400 tabular-nums">
                          {u.credit > 0 ? `₹${u.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="badge-variance text-[10px] font-mono">
                            {u.suggestedCategory || 'UNRECORDED'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          {u.statutoryNote || 'Direct entry in bank statement not yet posted to cash book.'}
                        </td>
                      </tr>
                    ))}
                    {filterList(reconResult.unmatchedInBooks).length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                          Zero unrecorded bank items. All bank entries are matched!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 3: Unmatched in Bank Table */}
            {activeTab === 'unmatched_bank' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 text-[11px] uppercase">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Book Particulars / Voucher</th>
                      <th className="py-2.5 px-3">Cheque / Ref No</th>
                      <th className="py-2.5 px-3 text-right">Debit (₹)</th>
                      <th className="py-2.5 px-3 text-right">Credit (₹)</th>
                      <th className="py-2.5 px-3">Statutory BRS Head</th>
                      <th className="py-2.5 px-3">Audit Observation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {filterList(reconResult.unmatchedInBank).map((u, idx) => (
                      <tr key={idx} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                          {u.date || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-white max-w-sm truncate" title={u.label || u.narration}>
                          {u.label || u.narration}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">
                          {u.refNo || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-400 tabular-nums">
                          {u.debit > 0 ? `₹${u.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-400 tabular-nums">
                          {u.credit > 0 ? `₹${u.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="badge-variance text-[10px] font-mono">
                            {u.suggestedCategory === 'CHEQUE_ISSUED_NOT_PRESENTED' ? 'UNPRESENTED CHEQUE' : 'DEPOSIT IN TRANSIT'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          {u.statutoryNote}
                        </td>
                      </tr>
                    ))}
                    {filterList(reconResult.unmatchedInBank).length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                          Zero outstanding book items. All cheques and remittances have cleared!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 4: Statutory BRS Statement Format */}
            {activeTab === 'brs_statement' && (
              <div className="p-6 flex flex-col gap-4 max-w-3xl mx-auto">
                <div className="text-center pb-4 border-b border-slate-800">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                    Bank Reconciliation Statement
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    As of Statement Closing Date • {bankData?.bankName || 'Bank'} A/c {bankData?.accountNumber || ''}
                  </p>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  {/* Line 1: Balance as per Books */}
                  <div className="flex items-center justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-200 font-semibold">Balance as per Books (Cash / Bank Book)</span>
                    <span className="text-white font-bold tabular-nums">
                      ₹{(reconResult.summary.bookBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Additions */}
                  <div className="pl-4 space-y-2 text-slate-300">
                    <div className="text-[11px] text-emerald-400 font-sans font-semibold">ADD:</div>
                    <div className="flex items-center justify-between">
                      <span>• Cheques issued to suppliers but not yet presented for payment (Unpresented Cheques)</span>
                      <span className="text-emerald-400 tabular-nums">
                        +₹{(reconResult.summary.totals?.unmatchedInBankCredit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>• Direct customer remittances & interest credited by bank not yet in Cash Book</span>
                      <span className="text-emerald-400 tabular-nums">
                        +₹{(reconResult.summary.totals?.unmatchedInBooksCredit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Deductions */}
                  <div className="pl-4 space-y-2 text-slate-300 pt-2">
                    <div className="text-[11px] text-rose-400 font-sans font-semibold">LESS:</div>
                    <div className="flex items-center justify-between">
                      <span>• Cheques deposited into bank but not yet credited / cleared (Deposits in Transit)</span>
                      <span className="text-rose-400 tabular-nums">
                        -₹{(reconResult.summary.totals?.unmatchedInBankDebit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>• Bank charges, taxes, and auto-debits not yet booked in Cash Book</span>
                      <span className="text-rose-400 tabular-nums">
                        -₹{(reconResult.summary.totals?.unmatchedInBooksDebit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Line Reconciled Balance */}
                  <div className="flex items-center justify-between py-2 border-t border-slate-800 text-slate-200">
                    <span className="font-semibold">Reconciled Balance as per Bank Statement</span>
                    <span className="text-blue-400 font-bold tabular-nums">
                      ₹{(reconResult.summary.reconciledBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Line Final: Balance as per Bank Statement */}
                  <div className="flex items-center justify-between py-3 border-t-2 border-b-2 border-slate-700 bg-slate-900/60 px-3 rounded mt-2">
                    <span className="text-white font-bold">Balance as per Bank Statement (Passbook)</span>
                    <span className="text-emerald-400 font-bold text-sm tabular-nums">
                      ₹{(reconResult.summary.bankBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Variance Row */}
                  <div className="flex items-center justify-between px-3 py-1.5 text-[11px]">
                    <span className="text-slate-400">Net Unreconciled Variance:</span>
                    <span className={`font-bold tabular-nums ${(reconResult.summary.netVariance || 0) <= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ₹{(reconResult.summary.netVariance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      {(reconResult.summary.netVariance || 0) <= 1 && ' (Zero-Variance Reconciled ✓)'}
                    </span>
                  </div>
                </div>

                <div className="text-center pt-2 text-[11px] text-slate-500">
                  Zero-Variance Statutory BRS verified using paise-based integer math under ICAI standards.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tally Bank Ledger Picker Modal */}
      {showLedgerPicker && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="surface-card max-w-md w-full p-5 border border-slate-750 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Select Tally Bank Ledger</h3>
              </div>
              <button onClick={() => setShowLedgerPicker(false)} className="text-slate-400 hover:text-white text-xs">✕</button>
            </div>

            <p className="text-xs text-slate-400">
              Choose which bank ledger from Tally to reconcile against your uploaded bank statement:
            </p>

            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {tallyBankLedgers.map((l) => (
                <button
                  key={l.name}
                  type="button"
                  onClick={() => setSelectedLedgerName(l.name)}
                  className={`p-3 rounded-lg border text-left flex items-center justify-between transition-all ${
                    selectedLedgerName === l.name
                      ? 'bg-cyan-950/40 border-cyan-500 text-cyan-200'
                      : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold">{l.name}</div>
                    <div className="text-[10px] text-slate-400">Tally Group: {l.parent}</div>
                  </div>
                  <div className="text-right font-mono text-xs text-slate-200">
                    ₹{Math.abs(l.closingBalance || 0).toLocaleString('en-IN')} {(l.closingBalance || 0) >= 0 ? 'Dr' : 'Cr'}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
              <span className="text-[10px] text-slate-500 font-mono">
                Source: {tallyConnectionInfo?.online ? '🟢 TallyPrime Live' : '🔵 Simulation Mode'}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowLedgerPicker(false)} className="btn-secondary text-xs py-1.5 px-3">
                  Cancel
                </button>
                <button
                  onClick={() => handleExecuteTallyBankSync(selectedLedgerName)}
                  disabled={isSyncingTally || !selectedLedgerName}
                  className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                >
                  {isSyncingTally ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Sync Selected Ledger
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
