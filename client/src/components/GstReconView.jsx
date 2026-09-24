import React, { useState, useRef } from 'react';
import { 
  FileCheck, FileSpreadsheet, UploadCloud, Download, CheckCircle2, 
  AlertTriangle, ArrowRight, Loader2, Sparkles, Search, Copy, 
  ShieldAlert, ShieldCheck, Scale, Building2, Sliders, Check,
  MessageSquare, Mail, Clock, FileText, CheckCircle, Server, X, Plus, Percent
} from 'lucide-react';

export default function GstReconView() {
  const [reconType, setReconType] = useState('INWARD'); // 'INWARD' (Purchase vs GSTR-2B) or 'OUTWARD' (Sales vs GSTR-1)
  const [prFiles, setPrFiles] = useState([]);
  const [gstr2bFiles, setGstr2bFiles] = useState([]);
  const [prData, setPrData] = useState(null);
  const [gstr2bData, setGstr2bData] = useState(null);
  const [isUploadingPr, setIsUploadingPr] = useState(false);
  const [isUploading2B, setIsUploading2B] = useState(false);
  const [isPrDragOver, setIsPrDragOver] = useState(false);
  const [is2bDragOver, setIs2bDragOver] = useState(false);
  const [isSyncingTally, setIsSyncingTally] = useState(false);

  const [tolerance, setTolerance] = useState(1.00);
  const [tolerancePreset, setTolerancePreset] = useState('1.00'); // '0.00' | '1.00' | '2.00' | '5.00' | '10.00' | 'CUSTOM'
  const [selectedBranch, setSelectedBranch] = useState('AUTO');
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconResult, setReconResult] = useState(null);
  const [activeTab, setActiveTab] = useState('exact');
  const [probableSubFilter, setProbableSubFilter] = useState('ALL'); // 'ALL' | 'RATES' | 'OTHER'
  const [rateSlabFilter, setRateSlabFilter] = useState('ALL'); // Filter for Rate-Wise Recon tab
  const [varianceOnlyFilter, setVarianceOnlyFilter] = useState(false); // Quick toggle to isolate differences >= tolerance
  const [searchQuery, setSearchQuery] = useState('');
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [excelGeneratingType, setExcelGeneratingType] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const prInputRef = useRef(null);
  const gstr2bInputRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const calculateCumulativeTotals = (items = []) => {
    return {
      taxableValue: Math.round(items.reduce((acc, it) => acc + (it.taxableValue || 0), 0) * 100) / 100,
      igst: Math.round(items.reduce((acc, it) => acc + (it.igst || 0), 0) * 100) / 100,
      cgst: Math.round(items.reduce((acc, it) => acc + (it.cgst || 0), 0) * 100) / 100,
      sgst: Math.round(items.reduce((acc, it) => acc + (it.sgst || 0), 0) * 100) / 100,
      cess: Math.round(items.reduce((acc, it) => acc + (it.cess || 0), 0) * 100) / 100,
      totalTax: Math.round(items.reduce((acc, it) => acc + (it.totalTax || 0), 0) * 100) / 100,
      totalInvoiceValue: Math.round(items.reduce((acc, it) => acc + (it.totalInvoiceValue || 0), 0) * 100) / 100
    };
  };

  const handleUploadPrFiles = async (filesList, isAppend = false) => {
    if (!filesList || filesList.length === 0) return;
    let fileArray = Array.from(filesList);

    if (isAppend && prFiles.length > 0) {
      const existingNames = new Set(prFiles.map(f => f.filename));
      fileArray = fileArray.filter(f => !existingNames.has(f.name));
      if (fileArray.length === 0) {
        showToast('Selected register file(s) are already uploaded.');
        if (prInputRef.current) prInputRef.current.value = '';
        return;
      }
    }

    setIsUploadingPr(true);

    const formData = new FormData();
    fileArray.forEach(f => formData.append('files', f));
    formData.append('documentType', reconType === 'OUTWARD' ? 'SALES_REGISTER' : 'PURCHASE_REGISTER');

    try {
      const res = await fetch('/api/gst/ingest-file', {
        method: 'POST',
        body: formData
      });
      const contentType = res.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned unexpected response (${res.status}): ${text.slice(0, 150)}`);
      }

      if (data.success) {
        const newFilesMeta = data.files || fileArray.map(f => ({
          filename: f.name,
          size: f.size,
          rowCount: data.items.length
        }));

        const taggedNewItems = (data.items || []).map(itm => ({
          ...itm,
          _originFile: itm._originFile || (newFilesMeta[0]?.filename || fileArray[0]?.name)
        }));

        if (isAppend && prData?.items?.length) {
          const combinedItems = [...prData.items, ...taggedNewItems];
          const combinedFiles = [...prFiles, ...newFilesMeta];
          const newTotals = calculateCumulativeTotals(combinedItems);

          setPrFiles(combinedFiles);
          setPrData({
            ...data,
            items: combinedItems,
            files: combinedFiles,
            summary: {
              ...data.summary,
              totalRecords: combinedItems.length,
              totals: newTotals
            }
          });
          showToast(`Added ${fileArray.length} file(s). Total: ${combinedItems.length} records.`);
        } else {
          setPrFiles(newFilesMeta);
          setPrData({
            ...data,
            items: taggedNewItems,
            files: newFilesMeta
          });
          showToast(`Loaded ${newFilesMeta.length} file(s) with ${taggedNewItems.length} records.`);
        }
      } else {
        alert('Error parsing Purchase Register: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setIsUploadingPr(false);
      if (prInputRef.current) prInputRef.current.value = '';
    }
  };

  const handleRemovePrFile = (filenameToRemove) => {
    const remainingFiles = prFiles.filter(f => f.filename !== filenameToRemove);
    if (remainingFiles.length === 0) {
      setPrFiles([]);
      setPrData(null);
      showToast(`Cleared Purchase Register.`);
      return;
    }
    const remainingItems = (prData?.items || []).filter(itm => itm._originFile !== filenameToRemove);
    const newTotals = calculateCumulativeTotals(remainingItems);

    setPrFiles(remainingFiles);
    setPrData({
      ...prData,
      items: remainingItems,
      files: remainingFiles,
      summary: {
        ...prData.summary,
        totalRecords: remainingItems.length,
        totals: newTotals
      }
    });
    showToast(`Removed ${filenameToRemove}. Remaining: ${remainingItems.length} records.`);
  };

  const handleSyncFromTally = async () => {
    setIsSyncingTally(true);
    try {
      const res = await fetch('/api/tally/sync-purchase-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        const tallyFileName = `Tally Purchase Register (${data.online ? 'Live Port 9000' : 'Simulated'})`;
        const taggedItems = (data.items || []).map(itm => ({
          ...itm,
          _originFile: tallyFileName
        }));
        setPrFiles([{ filename: tallyFileName, rowCount: data.count }]);
        setPrData({
          filename: tallyFileName,
          items: taggedItems,
          files: [{ filename: tallyFileName, rowCount: data.count }],
          summary: data.summary,
          source: data.source
        });
        showToast(`Synced ${data.count} purchase vouchers from Tally (${data.online ? 'Live' : 'Simulated'})!`);
      } else {
        alert('Tally PR Sync failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Tally PR Sync failed: ' + err.message);
    } finally {
      setIsSyncingTally(false);
    }
  };

  const handleUpload2BFiles = async (filesList, isAppend = false) => {
    if (!filesList || filesList.length === 0) return;
    let fileArray = Array.from(filesList);

    if (isAppend && gstr2bFiles.length > 0) {
      const existingNames = new Set(gstr2bFiles.map(f => f.filename));
      fileArray = fileArray.filter(f => !existingNames.has(f.name));
      if (fileArray.length === 0) {
        showToast('Selected portal file(s) are already uploaded.');
        if (gstr2bInputRef.current) gstr2bInputRef.current.value = '';
        return;
      }
    }

    setIsUploading2B(true);

    const formData = new FormData();
    fileArray.forEach(f => formData.append('files', f));
    formData.append('documentType', reconType === 'OUTWARD' ? 'GSTR1' : 'GSTR2B');

    try {
      const res = await fetch('/api/gst/ingest-file', {
        method: 'POST',
        body: formData
      });
      const contentType = res.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned unexpected response (${res.status}): ${text.slice(0, 150)}`);
      }

      if (data.success) {
        const newFilesMeta = data.files || fileArray.map(f => ({
          filename: f.name,
          size: f.size,
          rowCount: data.items.length
        }));

        const taggedNewItems = (data.items || []).map(itm => ({
          ...itm,
          _originFile: itm._originFile || (newFilesMeta[0]?.filename || fileArray[0]?.name)
        }));

        if (isAppend && gstr2bData?.items?.length) {
          const combinedItems = [...gstr2bData.items, ...taggedNewItems];
          const combinedFiles = [...gstr2bFiles, ...newFilesMeta];
          const newTotals = calculateCumulativeTotals(combinedItems);

          setGstr2bFiles(combinedFiles);
          setGstr2bData({
            ...data,
            items: combinedItems,
            files: combinedFiles,
            summary: {
              ...data.summary,
              totalRecords: combinedItems.length,
              totals: newTotals
            }
          });
          showToast(`Added ${fileArray.length} file(s). Total: ${combinedItems.length} invoices.`);
        } else {
          setGstr2bFiles(newFilesMeta);
          setGstr2bData({
            ...data,
            items: taggedNewItems,
            files: newFilesMeta
          });
          showToast(`Loaded ${newFilesMeta.length} file(s) with ${taggedNewItems.length} invoices.`);
        }
      } else {
        alert('Error parsing GSTR-2B: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setIsUploading2B(false);
      if (gstr2bInputRef.current) gstr2bInputRef.current.value = '';
    }
  };

  const handleRemove2BFile = (filenameToRemove) => {
    const remainingFiles = gstr2bFiles.filter(f => f.filename !== filenameToRemove);
    if (remainingFiles.length === 0) {
      setGstr2bFiles([]);
      setGstr2bData(null);
      showToast(`Cleared GSTR-2B.`);
      return;
    }
    const remainingItems = (gstr2bData?.items || []).filter(itm => itm._originFile !== filenameToRemove);
    const newTotals = calculateCumulativeTotals(remainingItems);

    setGstr2bFiles(remainingFiles);
    setGstr2bData({
      ...gstr2bData,
      items: remainingItems,
      files: remainingFiles,
      summary: {
        ...gstr2bData.summary,
        totalRecords: remainingItems.length,
        totals: newTotals
      }
    });
    showToast(`Removed ${filenameToRemove}. Remaining: ${remainingItems.length} invoices.`);
  };

  const handleExecuteReconciliation = async (branchOverride) => {
    if (!prData?.items?.length || !gstr2bData?.items?.length) {
      alert(
        reconType === 'OUTWARD'
          ? 'Please upload both Sales Register (Books) and GSTR-1 (Portal) before reconciling.'
          : 'Please upload both Purchase Register (Books) and GSTR-2B (Portal) before reconciling.'
      );
      return;
    }

    const branchToUse = (typeof branchOverride === 'string' && branchOverride)
      ? branchOverride
      : (typeof selectedBranch === 'string' && selectedBranch ? selectedBranch : 'AUTO');

    setIsReconciling(true);
    try {
      const res = await fetch('/api/gst/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseRegisterItems: prData.items,
          gstr2bItems: gstr2bData.items,
          toleranceAmount: tolerance,
          reconType,
          branchFilter: branchToUse
        })
      });

      const data = await res.json();
      if (data.success) {
        setReconResult(data);
        if (data.summary?.activeBranch) {
          setSelectedBranch(data.summary.activeBranch);
        }
        showToast(`Reconciliation complete! Match rate: ${data.summary.matchRatePercentage}%`);
      } else {
        alert('Reconciliation error: ' + (data.error || 'Failed to reconcile'));
      }
    } catch (err) {
      alert('Reconciliation error: ' + err.message);
    } finally {
      setIsReconciling(false);
    }
  };

  const handleDownloadExcel = async (reportType = 'combined') => {
    if (!reconResult) return;
    setIsGeneratingExcel(true);
    setExcelGeneratingType(reportType);

    try {
      const res = await fetch('/api/gst/generate-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reconResult, reportType })
      });

      const data = await res.json();
      if (data.success && data.downloadUrl) {
        window.location.href = data.downloadUrl;
        showToast(
          reportType === 'rate-wise'
            ? 'GST Rate-Wise Reconciliation Workbook downloaded!'
            : '9-Sheet GST Master Combined Audit Workbook downloaded!'
        );
      } else {
        alert('Excel generation failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Excel generation failed: ' + err.message);
    } finally {
      setIsGeneratingExcel(false);
      setExcelGeneratingType('');
    }
  };

  const handleCopyNotice = (text, type = 'WhatsApp') => {
    navigator.clipboard.writeText(text);
    showToast(`Copied ${type} notice to clipboard!`);
  };

  const handleLoadSampleData = async () => {
    try {
      const res = await fetch(`/api/gst/sample-data?reconType=${reconType}`);
      const data = await res.json();
      if (data.success) {
        const prFilename = data.purchaseRegister.filename;
        const gstrFilename = data.gstr2b.filename;
        setPrFiles([{ filename: prFilename, size: 0, rowCount: data.purchaseRegister.items?.length || 0 }]);
        setPrData(data.purchaseRegister);
        setGstr2bFiles([{ filename: gstrFilename, size: 0, rowCount: data.gstr2b.items?.length || 0 }]);
        setGstr2bData(data.gstr2b);
        showToast(
          reconType === 'OUTWARD'
            ? `Loaded ${data.purchaseRegister.items?.length || 0} Sales Records & ${data.gstr2b.items?.length || 0} GSTR-1 Invoices for Demo!`
            : `Loaded ${data.purchaseRegister.items?.length || 0} Purchase Records & ${data.gstr2b.items?.length || 0} GSTR-2B Invoices for Demo!`
        );
      } else {
        alert('Failed to load sample data: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error loading sample data: ' + err.message);
    }
  };

  const filterList = (list = []) => {
    let result = list;
    if (varianceOnlyFilter) {
      const th = Number(tolerance) || 1.00;
      result = result.filter(m => 
        Math.abs(m.varianceTaxable || 0) >= th || 
        Math.abs(m.varianceTax || 0) >= th || 
        m.hasRateMismatch
      );
    }
    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(m => {
      const pr = m.prItem || m;
      const g2b = m.gstr2bItem || {};
      return (
        (pr.supplierGstin || '').toLowerCase().includes(q) ||
        (pr.supplierName || '').toLowerCase().includes(q) ||
        (pr.invoiceNumber || pr.voucherNumber || '').toLowerCase().includes(q) ||
        (g2b.supplierGstin || '').toLowerCase().includes(q) ||
        (g2b.supplierName || '').toLowerCase().includes(q) ||
        (g2b.invoiceNumber || '').toLowerCase().includes(q)
      );
    });
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-700 text-slate-100 px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2.5 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="surface-card p-4 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-col gap-1.5">
            {/* Mode Switcher Toggle */}
            <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => {
                  if (reconType !== 'INWARD') {
                    setReconType('INWARD');
                    setPrFiles([]);
                    setGstr2bFiles([]);
                    setPrData(null);
                    setGstr2bData(null);
                    setReconResult(null);
                  }
                }}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  reconType === 'INWARD'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>Inward ITC (Purchase vs GSTR-2B)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (reconType !== 'OUTWARD') {
                    setReconType('OUTWARD');
                    setPrFiles([]);
                    setGstr2bFiles([]);
                    setPrData(null);
                    setGstr2bData(null);
                    setReconResult(null);
                  }
                }}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  reconType === 'OUTWARD'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Outward Sales (Sales vs GSTR-1)</span>
              </button>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap mt-1">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                {reconType === 'OUTWARD' ? (
                  <>
                    <Scale className="w-4 h-4 text-emerald-400 shrink-0" />
                    GST Outward / Sales Reconciliation Engine
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4 text-blue-400 shrink-0" />
                    GST Input Tax Credit (ITC) Reconciliation Engine
                  </>
                )}
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                {reconType === 'OUTWARD' ? 'Rule 88C (DRC-01B) & Sec 16(2)(aa)' : 'Rule 36(4) & Sec 16(2)(aa)'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {reconType === 'OUTWARD'
                ? 'Automated multi-pass matching of Books Sales Registers against Government GSTR-1 portal returns with Form DRC-01B excess liability protection.'
                : 'Automated multi-pass matching of Purchase Registers against GSTR-2B with Rule 88D notice risk assessment.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleLoadSampleData}
              className="btn-secondary text-xs flex items-center gap-1.5"
              title="Load built-in realistic Indian GST sample dataset"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Load Sample Datasets</span>
            </button>

            {reconType === 'INWARD' && (
              <button
                onClick={handleSyncFromTally}
                disabled={isSyncingTally}
                className="btn-secondary text-xs flex items-center gap-1.5 text-cyan-400 border-cyan-800/40 hover:bg-cyan-950/30"
                title="Sync Purchase Register directly from TallyPrime on Port 9000"
              >
                {isSyncingTally ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Syncing Tally...
                  </>
                ) : (
                  <>
                    <Server className="w-3.5 h-3.5 mr-1" /> Sync PR from Tally
                  </>
                )}
              </button>
            )}

            {reconResult && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadExcel('combined')}
                  disabled={isGeneratingExcel}
                  className="btn-primary text-xs flex items-center gap-1.5"
                  title="Download 9-Sheet Master Combined Audit Workbook (.xlsx)"
                >
                  {isGeneratingExcel && excelGeneratingType === 'combined' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Generating...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 mr-1" /> Combined Excel
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleDownloadExcel('rate-wise')}
                  disabled={isGeneratingExcel}
                  className="px-3 py-2 rounded-lg bg-purple-950/80 hover:bg-purple-900/80 text-purple-200 border border-purple-700/60 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Download Standalone GST Rate-Wise Reconciliation Workbook (.xlsx)"
                >
                  {isGeneratingExcel && excelGeneratingType === 'rate-wise' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 text-purple-400" /> Generating...
                    </>
                  ) : (
                    <>
                      <Percent className="w-3.5 h-3.5 mr-1 text-purple-400" /> Rate-Wise Excel
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ingestion Dropzones & Match Controller */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Purchase / Sales Register */}
        <div className="lg:col-span-5 surface-card p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" />
                <span>{reconType === 'OUTWARD' ? 'Books: Sales Register / Ledgers' : 'Books: Purchase Register'}</span>
              </h3>
              <div className="flex items-center gap-2">
                {reconType === 'INWARD' && (
                  <button
                    type="button"
                    onClick={handleSyncFromTally}
                    disabled={isSyncingTally}
                    className="text-[11px] px-2.5 py-1 rounded bg-cyan-950/40 border border-cyan-850 text-cyan-300 hover:bg-cyan-900/50 flex items-center gap-1.5 transition-colors font-medium"
                    title="Direct XML sync from TallyPrime on Port 9000"
                  >
                    <Server className="w-3 h-3 text-cyan-400" />
                    <span>Sync Tally</span>
                  </button>
                )}
                {prData && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 font-mono">
                    {prData.items.length} records
                  </span>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {reconType === 'OUTWARD'
                ? 'Supports Tally Columnar Sales Registers (CGST 9%, IGST 18%, Credit Notes, Multi-file upload).'
                : 'Supports Excel (.xlsx, .xls) and CSV registers exported from Tally, SAP, or Zoho Books.'}
            </p>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsPrDragOver(true); }}
              onDragLeave={() => setIsPrDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsPrDragOver(false);
                if (e.dataTransfer.files?.length) {
                  handleUploadPrFiles(e.dataTransfer.files, prFiles.length > 0);
                }
              }}
              onClick={() => prInputRef.current?.click()}
              className={`mt-3 p-3.5 rounded-lg border border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center group ${
                isPrDragOver 
                  ? 'border-blue-400 bg-blue-950/30' 
                  : 'border-slate-700/80 hover:border-blue-500 bg-slate-950/60 hover:bg-slate-950'
              }`}
            >
              <input
                ref={prInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleUploadPrFiles(e.target.files, prFiles.length > 0);
                  }
                }}
                className="hidden"
              />
              {isUploadingPr ? (
                <div className="flex items-center gap-2 text-blue-400 py-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-xs font-medium">Parsing registers...</span>
                </div>
              ) : (
                <>
                  <UploadCloud className="w-5 h-5 text-slate-400 group-hover:text-blue-400 mb-1 transition-colors" />
                  <span className="text-xs font-medium text-slate-200">
                    {prFiles.length > 0 
                      ? '+ Click or Drop to Add More Files' 
                      : (reconType === 'OUTWARD' ? 'Click to Browse or Drag Multiple Sales Registers' : 'Click to Browse or Drag Multiple Register Files')}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 font-mono">
                    {reconType === 'OUTWARD' 
                      ? 'Select multiple .xlsx, .xls, .csv (e.g. CGST 9%, CGST 14%, IGST 18%, Credit Notes)' 
                      : 'Select multiple .xlsx, .xls, .csv (e.g. 2.5%, 5%, 12%, 18% or monthly)'}
                  </span>
                </>
              )}
            </div>

            {/* Multi-File Chip List */}
            {prFiles.length > 0 && (
              <div className="mt-2.5 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
                  <span>Uploaded Files ({prFiles.length})</span>
                  <button 
                    type="button" 
                    onClick={(e) => { e.stopPropagation(); setPrFiles([]); setPrData(null); }}
                    className="text-slate-400 hover:text-red-400 transition-colors font-medium"
                  >
                    Clear All
                  </button>
                </div>
                {prFiles.map((f, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-md px-2.5 py-1 text-xs text-slate-300"
                  >
                    <div className="flex items-center gap-2 truncate mr-2">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate font-medium text-[11px]" title={f.filename}>{f.filename}</span>
                      {f.rowCount !== undefined && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950/60 text-blue-400 border border-blue-800/40 font-mono shrink-0">
                          {f.rowCount} rows
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemovePrFile(f.filename); }}
                      className="text-slate-400 hover:text-red-400 p-0.5 rounded hover:bg-red-950/40 transition-colors shrink-0"
                      title="Remove file"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {prData?.summary?.totals && (
                  <div className="text-[10px] text-slate-300 bg-slate-950/70 rounded p-1.5 border border-slate-800/60 font-mono flex items-center justify-between">
                    <span>Cumulative Total:</span>
                    <span className="text-emerald-400 font-semibold">
                      ₹{prData.summary.totals.taxableValue?.toLocaleString('en-IN')} (Tax: ₹{prData.summary.totals.totalTax?.toLocaleString('en-IN')})
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center: Match Controller & Variance Selector */}
        <div className="lg:col-span-2 surface-card p-3.5 flex flex-col items-center justify-center gap-2.5 text-center">
          <div className="w-full text-left space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                <Scale className="w-3 h-3 text-blue-400" />
                <span>Variance Threshold</span>
              </label>
              <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-950/70 border border-blue-800/40 px-1.5 py-0.2 rounded">
                ± ₹{Number(tolerance).toFixed(2)}
              </span>
            </div>

            {/* Quick Preset Pills */}
            <div className="grid grid-cols-3 gap-1">
              {[
                { label: '₹0 Strict', val: 0.00 },
                { label: '₹1 Stat.', val: 1.00 },
                { label: '₹2.00', val: 2.00 },
                { label: '₹5.00', val: 5.00 },
                { label: '₹10.00', val: 10.00 },
                { label: 'Custom', val: 'CUSTOM' }
              ].map(p => {
                const isSelected = p.val === 'CUSTOM'
                  ? ![0, 1, 2, 5, 10].includes(tolerance)
                  : tolerance === p.val;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      if (p.val !== 'CUSTOM') {
                        setTolerance(p.val);
                        setTolerancePreset(String(p.val));
                      } else {
                        setTolerancePreset('CUSTOM');
                      }
                    }}
                    className={`text-[10px] py-1 px-1.5 rounded font-mono transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white font-bold shadow-sm'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Numeric Custom Input */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs focus-within:border-blue-500">
              <span className="text-slate-400 font-mono text-[11px] mr-1">₹</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={tolerance}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setTolerance(isNaN(v) || v < 0 ? 0 : v);
                  setTolerancePreset('CUSTOM');
                }}
                className="w-full bg-transparent text-slate-100 font-mono text-xs focus:outline-none"
                placeholder="Tolerance amount..."
              />
            </div>

            <p className="text-[9px] text-slate-400 leading-tight text-left">
              Invoices with diff <strong className="text-amber-400">≥ ₹{Number(tolerance).toFixed(2)}</strong> will be picked out as variance discrepancies.
            </p>
          </div>

          <button
            onClick={() => handleExecuteReconciliation()}
            disabled={isReconciling || !prData || !gstr2bData}
            className="btn-primary w-full py-2 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 shadow-lg shadow-blue-500/10 cursor-pointer"
          >
            {isReconciling ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Matching...
              </>
            ) : (
              <>
                Run Reconciliation <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {/* Right: GSTR-2B / GSTR-1 Statement */}
        <div className="lg:col-span-5 surface-card p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>{reconType === 'OUTWARD' ? 'Portal: GSTR-1 Statement' : 'Portal: GSTR-2B Statement'}</span>
              </h3>
              {gstr2bData && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 font-mono">
                  {gstr2bData.items.length} invoices
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {reconType === 'OUTWARD'
                ? 'Upload official GSTR-1 Excel (.xlsx with B2B, CDNR, B2CL) or GSTR-1 JSON from the GST Portal.'
                : 'Upload official GSTR-2B JSON or Excel downloaded directly from the GST Portal.'}
            </p>

            <div
              onDragOver={(e) => { e.preventDefault(); setIs2bDragOver(true); }}
              onDragLeave={() => setIs2bDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIs2bDragOver(false);
                if (e.dataTransfer.files?.length) {
                  handleUpload2BFiles(e.dataTransfer.files, gstr2bFiles.length > 0);
                }
              }}
              onClick={() => gstr2bInputRef.current?.click()}
              className={`mt-3 p-3.5 rounded-lg border border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center group ${
                is2bDragOver 
                  ? 'border-blue-400 bg-blue-950/30' 
                  : 'border-slate-700/80 hover:border-blue-500 bg-slate-950/60 hover:bg-slate-950'
              }`}
            >
              <input
                ref={gstr2bInputRef}
                type="file"
                multiple
                accept=".json,.xlsx,.xls"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleUpload2BFiles(e.target.files, gstr2bFiles.length > 0);
                  }
                }}
                className="hidden"
              />
              {isUploading2B ? (
                <div className="flex items-center gap-2 text-blue-400 py-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-xs font-medium">
                    {reconType === 'OUTWARD' ? 'Parsing GSTR-1 statement...' : 'Parsing GSTR-2B statements...'}
                  </span>
                </div>
              ) : (
                <>
                  <UploadCloud className="w-6 h-6 text-slate-400 group-hover:text-blue-400 mb-1 transition-colors" />
                  <span className="text-xs font-medium text-slate-200">
                    {gstr2bFiles.length > 0 
                      ? '+ Click or Drop to Add More Files' 
                      : (reconType === 'OUTWARD' ? 'Click to Browse or Drag GSTR-1 Statement File(s)' : 'Click to Browse or Drag Multiple GSTR-2B Files')}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 font-mono">
                    {reconType === 'OUTWARD'
                      ? 'Select official GSTR-1 Excel (.xlsx) or JSON'
                      : 'Select multiple monthly GSTR-2B files (.json or .xlsx)'}
                  </span>
                </>
              )}
            </div>

            {/* Multi-File Chip List */}
            {gstr2bFiles.length > 0 && (
              <div className="mt-2.5 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
                  <span>Uploaded Files ({gstr2bFiles.length})</span>
                  <button 
                    type="button" 
                    onClick={(e) => { e.stopPropagation(); setGstr2bFiles([]); setGstr2bData(null); }}
                    className="text-slate-400 hover:text-red-400 transition-colors font-medium"
                  >
                    Clear All
                  </button>
                </div>
                {gstr2bFiles.map((f, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-md px-2.5 py-1 text-xs text-slate-300"
                  >
                    <div className="flex items-center gap-2 truncate mr-2">
                      <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate font-medium text-[11px]" title={f.filename}>{f.filename}</span>
                      {f.rowCount !== undefined && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950/60 text-blue-400 border border-blue-800/40 font-mono shrink-0">
                          {f.rowCount} invs
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemove2BFile(f.filename); }}
                      className="text-slate-400 hover:text-red-400 p-0.5 rounded hover:bg-red-950/40 transition-colors shrink-0"
                      title="Remove file"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {gstr2bData?.summary?.totals && (
                  <div className="text-[10px] text-slate-300 bg-slate-950/70 rounded p-1.5 border border-slate-800/60 font-mono flex items-center justify-between">
                    <span>Cumulative Eligible Tax:</span>
                    <span className="text-emerald-400 font-semibold">
                      ₹{gstr2bData.summary.totals.totalTax?.toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Branch Selector Bar (for Multi-Branch GSTR-1) */}
      {reconResult && reconType === 'OUTWARD' && reconResult.summary?.availableBranches?.length > 1 && (
        <div className="surface-card p-3.5 flex flex-wrap items-center justify-between gap-3 border border-blue-800/40 bg-gradient-to-r from-blue-950/40 via-slate-900/60 to-slate-900/40">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <span className="text-xs font-semibold text-slate-200">Branch Series Filter:</span>
              <span className="text-[11px] text-slate-400 ml-2">GSTR-1 includes multi-location turnover. Showing portal series matching your books:</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {reconResult.summary.availableBranches.map((br) => {
              const isActive = (reconResult.summary.activeBranch === br.id);
              return (
                <button
                  key={br.id}
                  type="button"
                  disabled={isReconciling}
                  onClick={() => {
                    setSelectedBranch(br.id);
                    handleExecuteReconciliation(br.id);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-1 ring-blue-400 font-semibold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-750 hover:text-white border border-slate-700/60'
                  }`}
                >
                  <span>{br.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-blue-700 text-blue-100' : 'bg-slate-900 text-slate-400'
                  }`}>
                    {br.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Entity / Period Mismatch Guard Alert Banner */}
      {reconResult && reconResult.summary?.periodMismatchWarning?.hasMismatch && (
        <div className="p-4 rounded-xl bg-rose-950/60 border-2 border-rose-600/80 text-rose-200 text-xs flex flex-col gap-2 shadow-2xl">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-rose-100 uppercase tracking-wide">
                File Period / Entity Mismatch Detected (0% Match Guard)
              </h4>
              <p className="text-xs text-rose-200 leading-relaxed">
                {reconResult.summary.periodMismatchWarning.message}
              </p>
              <div className="flex items-center gap-4 text-[11px] font-mono mt-2 bg-rose-950/80 p-2 rounded border border-rose-800/60">
                <span>Books FY: <strong className="text-white">{reconResult.summary.periodMismatchWarning.booksYears?.join(', ') || 'N/A'}</strong></span>
                <span>•</span>
                <span>Portal FY: <strong className="text-white">{reconResult.summary.periodMismatchWarning.portalYears?.join(', ') || 'N/A'}</strong></span>
                <span>•</span>
                <span>Common GSTINs: <strong className="text-white">{reconResult.summary.periodMismatchWarning.commonGstinsCount}</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Accounting Discrepancy Banner */}
      {reconResult && reconResult.buckets?.ledgerDiscrepancies?.length > 0 && (
        <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-amber-100">Accounting Ledger Discrepancy Isolated: </span>
              <span>
                Found {reconResult.buckets.ledgerDiscrepancies.length} non-sales entry (Purchase voucher totaling 
                ₹{(reconResult.summary.ledgerDiscrepanciesTax || 0).toLocaleString('en-IN')} tax) entered in Sales Register 
                ({reconResult.buckets.ledgerDiscrepancies[0]?.supplierName || 'PARIKH POWER PVT LTD'}). 
                It has been isolated so it does not falsely count as omitted sales in GSTR-1.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('discrepancies')}
            className="px-3 py-1.5 rounded bg-amber-900/60 hover:bg-amber-800/80 text-amber-100 border border-amber-700/60 text-xs font-semibold shrink-0 transition-colors cursor-pointer"
          >
            Review Discrepancy ({reconResult.buckets.ledgerDiscrepancies.length})
          </button>
        </div>
      )}

      {/* Tax Rate Variance Alert Banner */}
      {reconResult && (reconResult.summary?.rateVarianceCount > 0) && (
        <div className="p-3.5 rounded-lg bg-purple-950/40 border border-purple-800/60 text-purple-200 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2.5">
            <Sliders className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-purple-100">Tax Rate Slab Variance Detected: </span>
              <span>
                Found {reconResult.summary.rateVarianceCount} invoice(s) where tax was calculated at different GST rates 
                (Total tax variance: ₹{(reconResult.summary.rateVarianceTaxDiff || 0).toLocaleString('en-IN')}). 
                {reconType === 'OUTWARD'
                  ? ' Triggers Rule 88C (DRC-01B) short output liability notice risk. Review and file GSTR-1A amendment.'
                  : ' Triggers Rule 88D (DRC-01C) excess ITC claim notice risk. Review supplier tax invoices.'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('probable');
              setProbableSubFilter('RATES');
            }}
            className="px-3 py-1.5 rounded bg-purple-900/60 hover:bg-purple-800/80 text-purple-100 border border-purple-700/60 text-xs font-semibold shrink-0 transition-colors cursor-pointer"
          >
            Review Rate Variances ({reconResult.summary.rateVarianceCount})
          </button>
        </div>
      )}

      {/* Summary KPI Dashboard */}
      {reconResult && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
          <div className="surface-card p-3 flex flex-col justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Match Rate</span>
            <span className="text-lg font-bold text-slate-100 mt-1 font-mono tabular-nums">
              {reconResult.summary.matchRatePercentage}%
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 font-mono truncate">
              {reconResult.summary.matchedCount} / {reconResult.summary.totalRecordsPR} matched
            </span>
          </div>

          <div className="surface-card p-3 flex flex-col justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">100% Exact</span>
            <span className="text-lg font-bold text-emerald-400 mt-1 font-mono tabular-nums">
              ₹{((reconResult.summary.financialTotals.exactMatchTax !== undefined ? reconResult.summary.financialTotals.exactMatchTax : reconResult.summary.financialTotals.matchedTax) || 0).toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-emerald-400/80 mt-0.5 font-mono">
              {reconResult.summary.exactMatchCount} Invoices
            </span>
          </div>

          <div className="surface-card p-3 flex flex-col justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Probable / Typo</span>
            <span className="text-lg font-bold text-amber-400 mt-1 font-mono tabular-nums">
              ₹{((reconResult.summary.financialTotals.probableMatchTax !== undefined ? reconResult.summary.financialTotals.probableMatchTax : 0) || 0).toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-amber-400/80 mt-0.5 font-mono">
              {reconResult.summary.probableMatchCount} Invoices
            </span>
          </div>

          <div 
            onClick={() => setActiveTab('variance')}
            className="surface-card p-3 flex flex-col justify-between cursor-pointer hover:border-amber-600/60 transition-colors group"
            title="Click to view all matched invoices having difference ≥ tolerance"
          >
            <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider flex items-center justify-between">
              <span>Diff ≥ ₹{Number(tolerance).toFixed(0)}</span>
              <Scale className="w-3 h-3 text-amber-400 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-lg font-bold text-amber-400 mt-1 font-mono tabular-nums">
              ₹{(reconResult.summary?.varianceDiscrepanciesTaxDiff || 0).toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-amber-300/80 mt-0.5 font-mono">
              {reconResult.summary?.varianceDiscrepanciesCount || 0} Picked Invoices
            </span>
          </div>

          <div 
            onClick={() => setActiveTab('rateWise')}
            className="surface-card p-3 flex flex-col justify-between cursor-pointer hover:border-purple-600/60 transition-colors group"
            title="Click to view statutory GST Rate Slab reconciliation"
          >
            <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wider flex items-center justify-between">
              <span>Rate Recon</span>
              <Percent className="w-3 h-3 text-purple-400 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-lg font-bold text-purple-300 mt-1 font-mono tabular-nums">
              {reconResult.rateWiseReconciliation?.slabs?.length || 0} Slabs
            </span>
            <span className="text-[10px] text-purple-300/80 mt-0.5 font-mono">
              {reconResult.rateWiseReconciliation?.summary?.riskSlabsCount || 0} Discrepant Slabs
            </span>
          </div>

          <div className="surface-card p-3 flex flex-col justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {reconType === 'OUTWARD' ? 'Omitted in GSTR-1' : 'Missing in 2B'}
            </span>
            <span className="text-lg font-bold text-rose-400 mt-1 font-mono tabular-nums">
              ₹{reconResult.summary.financialTotals.missingInPortalTaxRisk.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-rose-400/80 mt-0.5 font-mono truncate">
              {reconResult.summary.missingInPortalCount} {reconType === 'OUTWARD' ? 'Unreported' : 'Unfiled'}
            </span>
          </div>

          <div className="surface-card p-3 flex flex-col justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {reconType === 'OUTWARD' ? 'Not in Books' : 'Missing in Books'}
            </span>
            <span className="text-lg font-bold text-blue-400 mt-1 font-mono tabular-nums">
              ₹{reconResult.summary.financialTotals.missingInBooksTaxOpportunity.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-blue-400/80 mt-0.5 font-mono truncate">
              {reconResult.summary.missingInBooksCount} Invoices
            </span>
          </div>

          <div className="surface-card p-3 flex flex-col justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {reconType === 'OUTWARD' ? 'Rule 88C DRC-01B' : 'Sec 17(5) Blocked'}
            </span>
            <span className={`text-lg font-bold mt-1 font-mono tabular-nums ${
              reconType === 'OUTWARD'
                ? (reconResult.statutoryGuards?.rule88C_DRC01B?.triggersNotice ? 'text-rose-400' : 'text-emerald-400')
                : 'text-purple-400'
            }`}>
              {reconType === 'OUTWARD'
                ? (reconResult.statutoryGuards?.rule88C_DRC01B?.triggersNotice ? 'CRITICAL' : 'COMPLIANT')
                : `₹${reconResult.summary.financialTotals.blocked17_5TaxAmount.toLocaleString('en-IN')}`
              }
            </span>
            <span className={`text-[10px] mt-0.5 font-mono truncate ${
              reconType === 'OUTWARD'
                ? (reconResult.statutoryGuards?.rule88C_DRC01B?.triggersNotice ? 'text-rose-400/80' : 'text-emerald-400/80')
                : 'text-purple-400/80'
            }`}>
              {reconType === 'OUTWARD'
                ? `Diff: ₹${Math.abs(reconResult.summary?.taxDifference ?? reconResult.statutoryGuards?.rule88C_DRC01B?.excessPortalTax ?? 0).toLocaleString('en-IN')}`
                : `${reconResult.summary.ineligible17_5Count} Mandatory Reversals`
              }
            </span>
          </div>
        </div>
      )}

      {/* Main Reconciliation Navigation & Table */}
      {reconResult && (
        <div className="surface-card p-5 flex flex-col gap-5">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 pb-4 border-b border-slate-800/80">
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveTab('exact')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'exact' 
                    ? 'bg-slate-800 text-emerald-300 border border-slate-700 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Exact Matches</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-900 text-slate-300">
                  {reconResult.summary.exactMatchCount}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('probable')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'probable' 
                    ? 'bg-slate-800 text-amber-300 border border-slate-700 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Probable & Rates</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-900 text-slate-300">
                  {reconResult.summary.probableMatchCount}
                </span>
                {(reconResult.summary?.rateVarianceCount > 0) && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-purple-950/90 text-purple-300 border border-purple-700/60 font-semibold" title={`${reconResult.summary.rateVarianceCount} Tax Rate Variances`}>
                    {reconResult.summary.rateVarianceCount} Rates
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('variance')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'variance' 
                    ? 'bg-slate-800 text-amber-300 border border-amber-600/60 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Scale className="w-3.5 h-3.5 text-amber-400" />
                <span>Variance (≥ ₹{Number(tolerance).toFixed(0)})</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-950/80 text-amber-300 border border-amber-800/50 font-semibold">
                  {reconResult.summary?.varianceDiscrepanciesCount || reconResult.buckets?.varianceDiscrepancies?.length || 0}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('rateWise')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'rateWise' 
                    ? 'bg-slate-800 text-purple-300 border border-purple-600/60 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Percent className="w-3.5 h-3.5 text-purple-400" />
                <span>Rate-Wise Recon</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-purple-950/80 text-purple-300 border border-purple-800/50 font-semibold">
                  {reconResult.rateWiseReconciliation?.slabs?.length || 0} Slabs
                </span>
              </button>

              <button
                onClick={() => setActiveTab('missing2b')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'missing2b' 
                    ? 'bg-slate-800 text-rose-300 border border-slate-700 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>{reconType === 'OUTWARD' ? 'Unreported in GSTR-1' : 'Missing in 2B'}</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-900 text-slate-300">
                  {reconResult.summary.missingInPortalCount}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('missingBooks')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'missingBooks' 
                    ? 'bg-slate-800 text-blue-300 border border-slate-700 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <FileCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>{reconType === 'OUTWARD' ? 'Unrecorded in Books' : 'Missing in Books'}</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-900 text-slate-300">
                  {reconResult.summary.missingInBooksCount}
                </span>
              </button>

              {reconType === 'INWARD' && (
                <button
                  onClick={() => setActiveTab('blocked17_5')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'blocked17_5' 
                      ? 'bg-slate-800 text-purple-300 border border-slate-700 shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <Scale className="w-3.5 h-3.5 text-purple-400" />
                  <span>Blocked Sec 17(5)</span>
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-900 text-slate-300">
                    {reconResult.summary.ineligible17_5Count}
                  </span>
                </button>
              )}

              <button
                onClick={() => setActiveTab('vendors')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'vendors' 
                    ? 'bg-slate-800 text-teal-300 border border-slate-700 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-teal-400" />
                <span>{reconType === 'OUTWARD' ? 'Customer Action Center' : 'Vendor Action Center'}</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-900 text-slate-300">
                  {reconResult.vendorCompliance.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('guards')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'guards' 
                    ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-slate-300" />
                <span>{reconType === 'OUTWARD' ? 'Rule 88C Notice Shield' : 'Notice Radar'}</span>
              </button>

              {reconType === 'OUTWARD' && (reconResult.summary?.b2cCount > 0 || reconResult.buckets?.b2cInvoices?.length > 0) && (
                <button
                  onClick={() => setActiveTab('b2c')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'b2c' 
                      ? 'bg-slate-800 text-sky-300 border border-slate-700 shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>B2C Cash Sales</span>
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-900 text-slate-300">
                    {reconResult.summary?.b2cCount || reconResult.buckets?.b2cInvoices?.length || 0}
                  </span>
                </button>
              )}

              {reconResult.buckets?.ledgerDiscrepancies?.length > 0 && (
                <button
                  onClick={() => setActiveTab('discrepancies')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'discrepancies' 
                      ? 'bg-slate-800 text-amber-300 border border-slate-700 shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ledger Discrepancies</span>
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-950/80 text-amber-300 border border-amber-800/50">
                    {reconResult.buckets.ledgerDiscrepancies.length}
                  </span>
                </button>
              )}
            </div>

            {/* Quick Action Toolbar: Filter Diff Toggle + Excel Downloads + Search */}
            <div className="flex items-center gap-2 w-full lg:w-auto flex-wrap">
              <button
                type="button"
                onClick={() => setVarianceOnlyFilter(!varianceOnlyFilter)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  varianceOnlyFilter 
                    ? 'bg-amber-950/80 text-amber-300 border-amber-500 shadow-sm font-semibold'
                    : 'bg-slate-900/80 text-slate-400 border-slate-750 hover:text-slate-200'
                }`}
                title={`Filter current view to only show records with difference ≥ ₹${tolerance}`}
              >
                <Scale className="w-3.5 h-3.5 text-amber-400" />
                <span>Diff ≥ ₹{Number(tolerance).toFixed(0)}</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadExcel('combined')}
                disabled={isGeneratingExcel}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                title="Download 9-Sheet Master Combined Audit Excel"
              >
                {isGeneratingExcel && excelGeneratingType === 'combined' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>Combined Excel</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadExcel('rate-wise')}
                disabled={isGeneratingExcel}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 border border-purple-800/60 font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                title="Download Standalone GST Rate-Wise Reconciliation Excel"
              >
                {isGeneratingExcel && excelGeneratingType === 'rate-wise' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                ) : (
                  <Percent className="w-3.5 h-3.5 text-purple-400" />
                )}
                <span>Rate Excel</span>
              </button>

              <div className="relative w-full lg:w-56">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={reconType === 'OUTWARD' ? 'Search GSTIN, Buyer, Inv #...' : 'Search GSTIN, Vendor, Inv #...'}
                  className="w-full text-xs bg-slate-900/90 border border-slate-750 rounded-lg pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                />
              </div>
            </div>
          </div>

          {/* TAB 1: EXACT MATCHES */}
          {activeTab === 'exact' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 border-collapse">
                <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'Buyer GSTIN' : 'Supplier GSTIN'}</th>
                    <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'Buyer Name' : 'Supplier Name'}</th>
                    <th className="py-2.5 px-3">Invoice No</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
                    <th className="py-2.5 px-3 text-right">CGST (₹)</th>
                    <th className="py-2.5 px-3 text-right">SGST (₹)</th>
                    <th className="py-2.5 px-3 text-right">IGST (₹)</th>
                    <th className="py-2.5 px-3 text-right">Total Tax (₹)</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filterList(reconResult.buckets.exactMatches).map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 px-3 font-mono text-[11px] text-blue-300">{m.prItem.supplierGstin}</td>
                      <td className="py-2 px-3 font-medium text-slate-200">{m.prItem.supplierName}</td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-300">{m.prItem.invoiceNumber}</td>
                      <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{m.prItem.invoiceDate}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">₹{m.prItem.taxableValue.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400">₹{m.prItem.cgst.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400">₹{m.prItem.sgst.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400">₹{m.prItem.igst.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-emerald-400">₹{m.prItem.totalTax.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-center">
                        <span className="badge-matched">
                          100% MATCH
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filterList(reconResult.buckets.exactMatches).length === 0 && (
                    <tr>
                      <td colSpan="10" className="py-8 text-center text-slate-500">
                        No exact matches found matching your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: PROBABLE & MISMATCHED */}
          {activeTab === 'probable' && (
            <div className="flex flex-col gap-3">
              {/* Sub-Filter Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">Filter Discrepancies:</span>
                  <div className="inline-flex p-0.5 bg-slate-950 border border-slate-800 rounded-md">
                    <button
                      type="button"
                      onClick={() => setProbableSubFilter('ALL')}
                      className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                        probableSubFilter === 'ALL'
                          ? 'bg-slate-800 text-slate-100 font-medium shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All Discrepancies ({reconResult.buckets.probableMatches?.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setProbableSubFilter('RATES')}
                      className={`px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                        probableSubFilter === 'RATES'
                          ? 'bg-purple-900/80 text-purple-200 font-semibold border border-purple-700/60 shadow-sm'
                          : 'text-purple-400 hover:text-purple-300'
                      }`}
                    >
                      <Sliders className="w-3 h-3 text-purple-400" />
                      <span>Rate Variances</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950 text-purple-300 font-mono border border-purple-800/60 font-semibold">
                        {reconResult.summary.rateVarianceCount || 0}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProbableSubFilter('OTHER')}
                      className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                        probableSubFilter === 'OTHER'
                          ? 'bg-slate-800 text-slate-100 font-medium shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Typos & Rounding ({Math.max(0, (reconResult.buckets.probableMatches?.length || 0) - (reconResult.summary.rateVarianceCount || 0))})
                    </button>
                  </div>
                </div>
                {(reconResult.summary.rateVarianceCount > 0) && (
                  <div className="text-[11px] text-purple-300 font-mono bg-purple-950/60 px-2.5 py-1 rounded border border-purple-800/40">
                    Rate Variance Tax Exposure: <strong className="text-purple-200">₹{(reconResult.summary.rateVarianceTaxDiff || 0).toLocaleString('en-IN')}</strong>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 border-collapse">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'Customer' : 'Vendor'}</th>
                      <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'Sales Inv No' : 'Books Inv No'}</th>
                      <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'GSTR-1 Inv No' : '2B Inv No'}</th>
                      <th className="py-2.5 px-3 text-right">{reconType === 'OUTWARD' ? 'Sales Taxable' : 'Books Taxable'}</th>
                      <th className="py-2.5 px-3 text-right">{reconType === 'OUTWARD' ? 'GSTR-1 Taxable' : '2B Taxable'}</th>
                      <th className="py-2.5 px-3 text-center">Tax Rates (Books vs Portal)</th>
                      <th className="py-2.5 px-3 text-right">Tax Diff</th>
                      <th className="py-2.5 px-3 text-center">Score / Status</th>
                      <th className="py-2.5 px-3">Discrepancy Details & Statutory Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filterList(
                      (reconResult.buckets.probableMatches || []).filter(m => {
                        if (probableSubFilter === 'RATES') return m.hasRateMismatch;
                        if (probableSubFilter === 'OTHER') return !m.hasRateMismatch;
                        return true;
                      })
                    ).map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3">
                          <div className="font-medium text-slate-200">{m.prItem.supplierName}</div>
                          <div className="text-[10px] font-mono text-slate-400">{m.prItem.supplierGstin}</div>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-300">{m.prItem.invoiceNumber}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-amber-300">{m.gstr2bItem.invoiceNumber}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">₹{m.prItem.taxableValue.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">₹{m.gstr2bItem.taxableValue.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3 text-center">
                          {m.hasRateMismatch ? (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-950/90 border border-purple-700/60 font-mono text-[10px] shadow-sm">
                              <span className="text-purple-300 font-bold">{m.booksRate}%</span>
                              <span className="text-slate-500">→</span>
                              <span className="text-amber-300 font-bold">{m.portalRate}%</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">
                              {m.booksRate !== undefined ? `${m.booksRate}%` : '—'}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-amber-400">
                          ₹{m.varianceTax.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="badge-variance">
                              {m.matchScore}%
                            </span>
                            {m.hasRateMismatch ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold tracking-wider uppercase bg-purple-900/70 text-purple-200 border border-purple-700/60">
                                RATE VARIANCE
                              </span>
                            ) : (
                              <span className="text-[9px] text-slate-500 font-mono">
                                {m.statusBadge || 'TYPO / FUZZY'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-xs">
                          <div className="text-slate-300 leading-relaxed">{m.remarks}</div>
                          {m.hasRateMismatch && m.varianceTax > 0 && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-rose-400 font-medium">
                              <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                              <span>
                                {reconType === 'OUTWARD' 
                                  ? 'Rule 88C (Form DRC-01B) Notice Risk: Short outward liability declared in GSTR-1.'
                                  : 'Rule 88D (Form DRC-01C) Notice Risk: Excess ITC claimed in Books over GSTR-2B.'}
                              </span>
                            </div>
                          )}
                          {m.hasRateMismatch && m.varianceTax < 0 && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                              <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>
                                {reconType === 'OUTWARD'
                                  ? 'Higher tax declared on Portal than Books. Verify for customer credit note.'
                                  : 'Under-claimed ITC in Books. Verify tax invoice to claim eligible credit.'}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filterList(
                      (reconResult.buckets.probableMatches || []).filter(m => {
                        if (probableSubFilter === 'RATES') return m.hasRateMismatch;
                        if (probableSubFilter === 'OTHER') return !m.hasRateMismatch;
                        return true;
                      })
                    ).length === 0 && (
                      <tr>
                        <td colSpan="9" className="py-8 text-center text-slate-500">
                          {probableSubFilter === 'RATES' 
                            ? 'No tax rate variances found in this dataset.' 
                            : 'No probable matches found matching your filters.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: VARIANCE DISCREPANCIES (>= tolerance) */}
          {activeTab === 'variance' && (
            <div className="flex flex-col gap-4">
              <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-800/40 text-amber-200 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Scale className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-amber-100 flex items-center gap-2">
                      <span>Configured Tolerance Discrepancies (Difference ≥ ₹{Number(tolerance).toFixed(2)})</span>
                      <span className="px-2 py-0.5 rounded bg-amber-900/60 border border-amber-700/60 text-[10px] font-mono text-amber-300">
                        {reconResult.summary?.varianceDiscrepanciesCount || 0} Invoices Isolated
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-200/80 mt-0.5">
                      Matched invoices where Taxable Value or Total Tax difference is equal to or exceeds your tolerance of ₹{Number(tolerance).toFixed(2)}. These invoices highlight potential rounding leakages, tax rate shifts, or entry errors that require manual verification.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                  <span className="px-2.5 py-1 rounded bg-amber-900/50 border border-amber-700/50 text-amber-300">
                    Total Tax Diff: ₹{(reconResult.summary?.varianceDiscrepanciesTaxDiff || 0).toLocaleString('en-IN')}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300">
                    Taxable Diff: ₹{(reconResult.summary?.varianceDiscrepanciesTaxableDiff || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 border-collapse">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'Buyer / GSTIN' : 'Supplier / GSTIN'}</th>
                      <th className="py-2.5 px-3">Invoice No & Date</th>
                      <th className="py-2.5 px-3 text-right">Books Taxable (₹)</th>
                      <th className="py-2.5 px-3 text-right">Portal Taxable (₹)</th>
                      <th className="py-2.5 px-3 text-right">Books Tax (₹)</th>
                      <th className="py-2.5 px-3 text-right">Portal Tax (₹)</th>
                      <th className="py-2.5 px-3 text-right">Tax Diff (₹)</th>
                      <th className="py-2.5 px-3 text-center">Rates (B vs P)</th>
                      <th className="py-2.5 px-3">Audit Finding & Remediation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filterList(reconResult.buckets?.varianceDiscrepancies || []).map((m, idx) => {
                      const pr = m.prItem || {};
                      const g2b = m.gstr2bItem || {};
                      const vTax = Number(m.varianceTax || 0);
                      const isHighRisk = Math.abs(vTax) >= 100 || m.hasRateMismatch;
                      return (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2 px-3">
                            <div className="font-medium text-slate-200">{pr.supplierName || g2b.supplierName || 'Unknown Party'}</div>
                            <div className="font-mono text-[11px] text-blue-300">{pr.supplierGstin || g2b.supplierGstin || '-'}</div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-mono text-[11px] text-slate-200">{pr.invoiceNumber || g2b.invoiceNumber || '-'}</div>
                            <div className="font-mono text-[10px] text-slate-400">{pr.invoiceDate || g2b.invoiceDate || '-'}</div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            ₹{(pr.taxableValue !== undefined ? pr.taxableValue : 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            ₹{(g2b.taxableValue !== undefined ? g2b.taxableValue : 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">
                            ₹{(pr.totalTax !== undefined ? pr.totalTax : 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">
                            ₹{(g2b.totalTax !== undefined ? g2b.totalTax : 0).toFixed(2)}
                          </td>
                          <td className={`py-2 px-3 text-right font-mono tabular-nums font-bold ${
                            vTax > 0 ? 'text-rose-400' : vTax < 0 ? 'text-amber-400' : 'text-slate-300'
                          }`}>
                            {vTax > 0 ? `+₹${vTax.toFixed(2)}` : vTax < 0 ? `-₹${Math.abs(vTax).toFixed(2)}` : '₹0.00'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {m.hasRateMismatch ? (
                              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-950/80 border border-purple-700/60 font-mono text-[10px]">
                                <span className="text-purple-300 font-bold">{m.booksRate}%</span>
                                <span className="text-slate-500">→</span>
                                <span className="text-amber-300 font-bold">{m.portalRate}%</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-mono text-[11px]">
                                {m.booksRate !== undefined ? `${m.booksRate}%` : '—'}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-xs">
                            <div className="text-slate-300 leading-snug">{m.remarks || 'Variance exceeds configured tolerance threshold.'}</div>
                            {isHighRisk && (
                              <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-300">
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>{reconType === 'OUTWARD' ? 'Rule 88C Notice Risk: Verify outward liability.' : 'Rule 88D Notice Risk: Verify eligible ITC claim.'}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filterList(reconResult.buckets?.varianceDiscrepancies || []).length === 0 && (
                      <tr>
                        <td colSpan="9" className="py-8 text-center text-slate-500">
                          No invoices found with variance ≥ ₹{Number(tolerance).toFixed(2)}. All matches are within your configured tolerance!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: GST RATE-WISE RECONCILIATION */}
          {activeTab === 'rateWise' && (
            <div className="flex flex-col gap-5">
              {/* Rate Recon Header & Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="surface-card p-3 flex flex-col justify-between border-l-2 border-l-blue-500">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Books Turnover</span>
                  <span className="text-lg font-bold text-slate-100 mt-1 font-mono tabular-nums">
                    ₹{(reconResult.rateWiseReconciliation?.summary?.totalBooksTaxable || 0).toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-blue-400 mt-0.5 font-mono">
                    Tax: ₹{(reconResult.rateWiseReconciliation?.summary?.totalBooksTax || 0).toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="surface-card p-3 flex flex-col justify-between border-l-2 border-l-purple-500">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Portal Turnover</span>
                  <span className="text-lg font-bold text-slate-100 mt-1 font-mono tabular-nums">
                    ₹{(reconResult.rateWiseReconciliation?.summary?.totalPortalTaxable || 0).toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-purple-400 mt-0.5 font-mono">
                    Tax: ₹{(reconResult.rateWiseReconciliation?.summary?.totalPortalTax || 0).toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="surface-card p-3 flex flex-col justify-between border-l-2 border-l-amber-500">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Turnover Variance</span>
                  <span className={`text-lg font-bold mt-1 font-mono tabular-nums ${
                    Math.abs(reconResult.rateWiseReconciliation?.summary?.diffTaxable || 0) > 1 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    ₹{Math.abs(reconResult.rateWiseReconciliation?.summary?.diffTaxable || 0).toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 font-mono">
                    {(reconResult.rateWiseReconciliation?.summary?.diffTaxable || 0) >= 0 ? 'Books Higher' : 'Portal Higher'}
                  </span>
                </div>

                <div className="surface-card p-3 flex flex-col justify-between border-l-2 border-l-rose-500">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Net Tax Variance</span>
                  <span className={`text-lg font-bold mt-1 font-mono tabular-nums ${
                    Math.abs(reconResult.rateWiseReconciliation?.summary?.diffTax || 0) > 1 ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    ₹{Math.abs(reconResult.rateWiseReconciliation?.summary?.diffTax || 0).toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 font-mono">
                    {(reconResult.rateWiseReconciliation?.summary?.diffTax || 0) >= 0 ? 'Books > Portal' : 'Portal > Books'}
                  </span>
                </div>

                <div className="surface-card p-3 flex flex-col justify-between border-l-2 border-l-emerald-500">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Slabs Analyzed</span>
                  <span className="text-lg font-bold text-emerald-400 mt-1 font-mono tabular-nums">
                    {reconResult.rateWiseReconciliation?.slabs?.length || 0} Slabs
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 font-mono">
                    0%, 5%, 12%, 18%, 28%
                  </span>
                </div>

                <div className="surface-card p-3 flex flex-col justify-between border-l-2 border-l-purple-500">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Download Report</span>
                  <button
                    onClick={() => handleDownloadExcel('rate-wise')}
                    disabled={isGeneratingExcel}
                    className="mt-1 text-xs py-1.5 px-2 rounded bg-purple-900/60 hover:bg-purple-800/80 text-purple-200 border border-purple-700/60 font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {isGeneratingExcel && excelGeneratingType === 'rate-wise' ? (
                      <Loader2 className="w-3 h-3 animate-spin text-purple-300" />
                    ) : (
                      <Percent className="w-3 h-3 text-purple-300" />
                    )}
                    <span>Export Rate Excel</span>
                  </button>
                  <span className="text-[9px] text-purple-300/80 mt-0.5 text-center font-mono">
                    Dedicated Rate-Wise .xlsx
                  </span>
                </div>
              </div>

              {/* Statutory Slabs Matrix Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 border-collapse">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">GST Slab</th>
                      <th className="py-2.5 px-3 text-right">Books Taxable (₹)</th>
                      <th className="py-2.5 px-3 text-right">Books CGST (₹)</th>
                      <th className="py-2.5 px-3 text-right">Books SGST (₹)</th>
                      <th className="py-2.5 px-3 text-right">Books IGST (₹)</th>
                      <th className="py-2.5 px-3 text-right">Books Total Tax (₹)</th>
                      <th className="py-2.5 px-3 text-right">Portal Taxable (₹)</th>
                      <th className="py-2.5 px-3 text-right">Portal CGST (₹)</th>
                      <th className="py-2.5 px-3 text-right">Portal SGST (₹)</th>
                      <th className="py-2.5 px-3 text-right">Portal IGST (₹)</th>
                      <th className="py-2.5 px-3 text-right">Portal Total Tax (₹)</th>
                      <th className="py-2.5 px-3 text-right">Taxable Diff (₹)</th>
                      <th className="py-2.5 px-3 text-right">Tax Diff (₹)</th>
                      <th className="py-2.5 px-3 text-center">Statutory Audit Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {(reconResult.rateWiseReconciliation?.slabs || []).map((slab, idx) => {
                      const hasDiff = Math.abs(slab.diffTaxable) > 1 || Math.abs(slab.diffTax) > 1;
                      return (
                        <tr key={idx} className={`transition-colors ${hasDiff ? 'bg-amber-950/20 hover:bg-amber-950/30' : 'hover:bg-slate-800/40'}`}>
                          <td className="py-2 px-3 font-bold text-slate-200 font-sans">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                              {slab.slabLabel}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-300">₹{slab.booksTaxable.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-400">₹{slab.booksCgst.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-400">₹{slab.booksSgst.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-400">₹{slab.booksIgst.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold text-blue-300">₹{slab.booksTax.toLocaleString('en-IN')}</td>

                          <td className="py-2 px-3 text-right tabular-nums text-slate-300">₹{slab.portalTaxable.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-400">₹{slab.portalCgst.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-400">₹{slab.portalSgst.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-400">₹{slab.portalIgst.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold text-purple-300">₹{slab.portalTax.toLocaleString('en-IN')}</td>

                          <td className={`py-2 px-3 text-right tabular-nums font-bold ${
                            Math.abs(slab.diffTaxable) > 1 ? 'text-amber-400' : 'text-slate-500'
                          }`}>
                            {slab.diffTaxable > 0 ? `+₹${slab.diffTaxable.toLocaleString('en-IN')}` : slab.diffTaxable < 0 ? `-₹${Math.abs(slab.diffTaxable).toLocaleString('en-IN')}` : '₹0'}
                          </td>
                          <td className={`py-2 px-3 text-right tabular-nums font-bold ${
                            Math.abs(slab.diffTax) > 1 ? (slab.diffTax > 0 ? 'text-rose-400' : 'text-amber-400') : 'text-emerald-400'
                          }`}>
                            {slab.diffTax > 0 ? `+₹${slab.diffTax.toLocaleString('en-IN')}` : slab.diffTax < 0 ? `-₹${Math.abs(slab.diffTax).toLocaleString('en-IN')}` : '₹0'}
                          </td>
                          <td className="py-2 px-3 text-center font-sans">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                              slab.riskColor === 'rose'
                                ? 'bg-rose-950/70 text-rose-300 border border-rose-800/60'
                                : slab.riskColor === 'amber'
                                ? 'bg-amber-950/70 text-amber-300 border border-amber-800/60'
                                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                            }`}>
                              {slab.statutoryRisk}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Totals Row */}
                  <tfoot className="bg-slate-900/90 text-slate-200 font-bold border-t-2 border-slate-700 font-mono text-[11px]">
                    <tr>
                      <td className="py-2.5 px-3 uppercase font-sans">TOTAL</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        ₹{(reconResult.rateWiseReconciliation?.summary?.totalBooksTaxable || 0).toLocaleString('en-IN')}
                      </td>
                      <td colSpan="3"></td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-blue-300">
                        ₹{(reconResult.rateWiseReconciliation?.summary?.totalBooksTax || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        ₹{(reconResult.rateWiseReconciliation?.summary?.totalPortalTaxable || 0).toLocaleString('en-IN')}
                      </td>
                      <td colSpan="3"></td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-purple-300">
                        ₹{(reconResult.rateWiseReconciliation?.summary?.totalPortalTax || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-amber-400">
                        ₹{Math.abs(reconResult.rateWiseReconciliation?.summary?.diffTaxable || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-rose-400">
                        ₹{Math.abs(reconResult.rateWiseReconciliation?.summary?.diffTax || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        <span className="text-[10px] text-slate-400 font-normal">
                          {reconResult.rateWiseReconciliation?.summary?.riskSlabsCount || 0} Risk Slabs
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Itemized Rate Drilldown Sub-Section */}
              <div className="flex flex-col gap-3 mt-2 pt-4 border-t border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-semibold text-slate-200">Rate Slab Drilldown:</span>
                    <div className="inline-flex flex-wrap gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
                      {['ALL', 'MISMATCHES', '0%', '5%', '12%', '18%', '28%', 'OTHER'].map(tab => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setRateSlabFilter(tab)}
                          className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer font-mono ${
                            rateSlabFilter === tab
                              ? 'bg-purple-900/80 text-purple-100 font-bold shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Showing itemized transactions for slab verification
                  </span>
                </div>

                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-xs text-slate-300 border-collapse">
                    <thead className="bg-slate-900 sticky top-0 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800 z-10">
                      <tr>
                        <th className="py-2 px-3">{reconType === 'OUTWARD' ? 'Buyer / GSTIN' : 'Supplier / GSTIN'}</th>
                        <th className="py-2 px-3">Invoice No & Date</th>
                        <th className="py-2 px-3 text-right">Books Taxable (₹)</th>
                        <th className="py-2 px-3 text-right">Portal Taxable (₹)</th>
                        <th className="py-2 px-3 text-center">Books Rate</th>
                        <th className="py-2 px-3 text-center">Portal Rate</th>
                        <th className="py-2 px-3 text-right">Tax Diff (₹)</th>
                        <th className="py-2 px-3">Statutory Finding / Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {filterList(
                        (reconResult.rateWiseReconciliation?.invoices || []).filter(item => {
                          if (rateSlabFilter === 'ALL') return true;
                          if (rateSlabFilter === 'MISMATCHES') return item.hasRateMismatch;
                          if (rateSlabFilter === '0%') return item.booksRate === 0 || item.portalRate === 0;
                          if (rateSlabFilter === '5%') return item.booksRate === 5 || item.portalRate === 5;
                          if (rateSlabFilter === '12%') return item.booksRate === 12 || item.portalRate === 12;
                          if (rateSlabFilter === '18%') return item.booksRate === 18 || item.portalRate === 18;
                          if (rateSlabFilter === '28%') return item.booksRate === 28 || item.portalRate === 28;
                          if (rateSlabFilter === 'OTHER') return ![0, 5, 12, 18, 28].includes(item.booksRate) && ![0, 5, 12, 18, 28].includes(item.portalRate);
                          return true;
                        })
                      ).slice(0, 100).map((inv, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2 px-3 font-sans">
                            <div className="font-medium text-slate-200">{inv.partyName}</div>
                            <div className="font-mono text-[10px] text-blue-300">{inv.partyGstin || '-'}</div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="text-slate-200">{inv.invoiceNumber}</div>
                            <div className="text-slate-400 text-[10px]">{inv.invoiceDate}</div>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">₹{inv.booksTaxable.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right tabular-nums">₹{inv.portalTaxable.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                              {inv.booksRate !== null ? `${inv.booksRate}%` : '—'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                              {inv.portalRate !== null ? `${inv.portalRate}%` : '—'}
                            </span>
                          </td>
                          <td className={`py-2 px-3 text-right tabular-nums font-bold ${
                            Math.abs(inv.diffTax) > 0.5 ? (inv.diffTax > 0 ? 'text-rose-400' : 'text-amber-400') : 'text-slate-400'
                          }`}>
                            {inv.diffTax > 0 ? `+₹${inv.diffTax.toFixed(2)}` : inv.diffTax < 0 ? `-₹${Math.abs(inv.diffTax).toFixed(2)}` : '₹0.00'}
                          </td>
                          <td className="py-2 px-3 font-sans text-xs">
                            <div className="text-slate-300 leading-snug">{inv.actionNote}</div>
                          </td>
                        </tr>
                      ))}
                      {filterList(
                        (reconResult.rateWiseReconciliation?.invoices || []).filter(item => {
                          if (rateSlabFilter === 'ALL') return true;
                          if (rateSlabFilter === 'MISMATCHES') return item.hasRateMismatch;
                          if (rateSlabFilter === '0%') return item.booksRate === 0 || item.portalRate === 0;
                          if (rateSlabFilter === '5%') return item.booksRate === 5 || item.portalRate === 5;
                          if (rateSlabFilter === '12%') return item.booksRate === 12 || item.portalRate === 12;
                          if (rateSlabFilter === '18%') return item.booksRate === 18 || item.portalRate === 18;
                          if (rateSlabFilter === '28%') return item.booksRate === 28 || item.portalRate === 28;
                          if (rateSlabFilter === 'OTHER') return ![0, 5, 12, 18, 28].includes(item.booksRate) && ![0, 5, 12, 18, 28].includes(item.portalRate);
                          return true;
                        })
                      ).length === 0 && (
                        <tr>
                          <td colSpan="8" className="py-6 text-center text-slate-500 font-sans">
                            No invoices found matching rate filter "{rateSlabFilter}".
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MISSING IN PORTAL / UNREPORTED IN GSTR-1 */}
          {activeTab === 'missing2b' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 border-collapse">
                <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'Buyer GSTIN' : 'Supplier GSTIN'}</th>
                    <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'Buyer Name' : 'Supplier Name'}</th>
                    <th className="py-2.5 px-3">Invoice No</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
                    <th className="py-2.5 px-3 text-right">{reconType === 'OUTWARD' ? 'Unreported Tax (₹)' : 'Unfiled Tax (₹)'}</th>
                    <th className="py-2.5 px-3 text-center">Statutory Status</th>
                    <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'Buyer Impact (Sec 16(2)(aa))' : 'Statutory Risk'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filterList(reconResult.buckets.missingInPortal).map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 px-3 font-mono text-[11px] text-rose-300">{m.prItem.supplierGstin}</td>
                      <td className="py-2 px-3 font-medium text-slate-200">{m.prItem.supplierName}</td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-300">{m.prItem.invoiceNumber}</td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-400">{m.prItem.invoiceDate}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">₹{m.prItem.taxableValue.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-rose-400">₹{m.prItem.totalTax.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-center">
                        <span className="badge-blocked">
                          {reconType === 'OUTWARD' ? 'OMITTED IN GSTR-1' : 'UNFILED BY VENDOR'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs text-rose-300/90">{m.remarks}</td>
                    </tr>
                  ))}
                  {filterList(reconResult.buckets.missingInPortal).length === 0 && (
                    <tr>
                      <td colSpan="8" className="py-8 text-center text-slate-500">
                        {reconType === 'OUTWARD'
                          ? 'Zero unreported invoices! All outward sales accounted in GSTR-1.'
                          : 'Zero unfiled vendor invoices! 100% compliant.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: MISSING IN BOOKS / UNRECORDED IN BOOKS */}
          {activeTab === 'missingBooks' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 border-collapse">
                <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'Buyer GSTIN' : 'Supplier GSTIN'}</th>
                    <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'Buyer Name' : 'Supplier Name'}</th>
                    <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'GSTR-1 Invoice No' : '2B Invoice No'}</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
                    <th className="py-2.5 px-3 text-right">{reconType === 'OUTWARD' ? 'Excess Tax (₹)' : 'Unclaimed Tax (₹)'}</th>
                    <th className="py-2.5 px-3 text-center">{reconType === 'OUTWARD' ? 'Audit Status' : 'Opportunity'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filterList(reconResult.buckets.missingInBooks).map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 px-3 font-mono text-[11px] text-blue-300">{m.gstr2bItem.supplierGstin}</td>
                      <td className="py-2 px-3 font-medium text-slate-200">{m.gstr2bItem.supplierName}</td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-300">{m.gstr2bItem.invoiceNumber}</td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-400">{m.gstr2bItem.invoiceDate}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">₹{m.gstr2bItem.taxableValue.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-blue-400">₹{m.gstr2bItem.totalTax.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-center">
                        <span className="badge-neutral border-blue-800/50 text-blue-300 bg-blue-950/40">
                          {reconType === 'OUTWARD' ? 'UNRECORDED IN BOOKS' : 'UNCLAIMED ITC'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filterList(reconResult.buckets.missingInBooks).length === 0 && (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-500">
                        {reconType === 'OUTWARD'
                          ? 'No unrecorded portal invoices found.'
                          : 'No unclaimed 2B invoices found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 5: SECTION 17(5) BLOCKED */}
          {activeTab === 'blocked17_5' && (
            <div className="flex flex-col gap-4">
              <div className="p-3.5 rounded-lg bg-purple-950/30 border border-purple-800/40 text-purple-200 text-xs flex items-start gap-3">
                <Scale className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                <div className="leading-relaxed">
                  <span className="font-semibold text-purple-100">Section 17(5) Statutory Exceptions Notice:</span> Items below are provisionally flagged based on HSN/SAC classifications. Motor vehicles used for passenger transportation for hire (taxis/cabs), driving schools, or vehicle resale (Sec 17(5)(a) Proviso), and catering/food procured for outward catering supply or mandatory under the Factories Act (Sec 17(5)(b)(i) Proviso) remain <strong className="text-purple-100">fully eligible</strong> for ITC.
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 border-collapse">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Supplier GSTIN</th>
                      <th className="py-2.5 px-3">Supplier Name</th>
                      <th className="py-2.5 px-3">Invoice No</th>
                      <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
                      <th className="py-2.5 px-3 text-right">Provisional Blocked Tax (₹)</th>
                      <th className="py-2.5 px-3">Statutory Clause</th>
                      <th className="py-2.5 px-3">Status & Exceptions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filterList(reconResult.buckets.ineligibleSection17_5).map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3 font-mono text-[11px] text-purple-300">{m.prItem.supplierGstin}</td>
                        <td className="py-2 px-3 font-medium text-slate-200">{m.prItem.supplierName}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-300">{m.prItem.invoiceNumber}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">₹{m.prItem.taxableValue.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-purple-400">₹{m.prItem.totalTax.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3 font-semibold text-purple-300">
                          <div>{m.prItem.blocked17_5Clause || 'Sec 17(5)'}</div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-200 border border-purple-700/50">PROVISIONALLY FLAGGED</span>
                        </td>
                        <td className="py-2 px-3 text-slate-300 text-[11px]">
                          <div>{m.prItem.blocked17_5Reason}</div>
                          <div className="text-[10px] text-purple-300/80 mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>Verify business use / statutory exceptions before final GSTR-3B exclusion</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filterList(reconResult.buckets.ineligibleSection17_5).length === 0 && (
                      <tr>
                        <td colSpan="7" className="py-8 text-center text-slate-500">
                          No Section 17(5) blocked credits detected.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: VENDOR / CUSTOMER ACTION CENTER */}
          {activeTab === 'vendors' && (
            <div className="flex flex-col gap-5">
              <div className="p-3.5 rounded-lg bg-teal-950/30 border border-teal-800/40 text-teal-200 text-xs flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-teal-400 shrink-0" />
                <span>
                  {reconType === 'OUTWARD' ? (
                    <>
                      <strong className="text-teal-100">Customer Compliance Index (CCI):</strong> Buyers & clients are evaluated on reconciliation matching and GSTR-1 reporting. 1-click notice dispatch allows direct outward advisory communication to protect client ITC under Sec 16(2)(aa).
                    </>
                  ) : (
                    <>
                      <strong className="text-teal-100">Vendor Reliability Index (VRI):</strong> Supplying vendors are evaluated on GSTR-1 filing discipline. 1-click notice dispatch allows immediate communication.
                    </>
                  )}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 border-collapse">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'Customer Name' : 'Vendor Name'}</th>
                      <th className="py-2.5 px-3">{reconType === 'OUTWARD' ? 'Buyer GSTIN' : 'GSTIN'}</th>
                      <th className="py-2.5 px-3 text-center">{reconType === 'OUTWARD' ? 'Match Score' : 'VRI Score'}</th>
                      <th className="py-2.5 px-3 text-center">Grade</th>
                      <th className="py-2.5 px-3 text-right">Invoices</th>
                      <th className="py-2.5 px-3 text-right">{reconType === 'OUTWARD' ? 'Unreported Tax (₹)' : 'Unfiled Tax (₹)'}</th>
                      <th className="py-2.5 px-3 text-right">{reconType === 'OUTWARD' ? 'Sec 16(2)(aa) Impact (₹)' : 'Recommended Hold (₹)'}</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {reconResult.vendorCompliance.map((v, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3 font-medium text-slate-200">{v.vendorName}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-blue-300">{v.gstin}</td>
                        <td className="py-2 px-3 text-center font-bold font-mono tabular-nums text-slate-100">{v.vriScore}%</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            v.grade === 'A' ? 'badge-matched' :
                            v.grade === 'B' ? 'badge-variance' :
                            'badge-blocked'
                          }`}>
                            Grade {v.grade}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">
                          {v.matchedInvoices} / {v.totalInvoices}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-rose-400">
                          ₹{v.unfiledTaxAmount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-amber-400">
                          ₹{v.recommendedPaymentHold.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex justify-center items-center gap-1.5">
                            <button
                              onClick={() => handleCopyNotice(v.whatsappNotice, 'WhatsApp')}
                              className="btn-secondary text-emerald-400 hover:text-emerald-300 hover:border-emerald-700/60 text-[11px] px-2 py-1 flex items-center gap-1 cursor-pointer"
                              title="Copy formatted WhatsApp notice"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>WhatsApp</span>
                            </button>
                            <button
                              onClick={() => handleCopyNotice(v.emailNotice, 'Email')}
                              className="btn-secondary text-blue-400 hover:text-blue-300 hover:border-blue-700/60 text-[11px] px-2 py-1 flex items-center gap-1 cursor-pointer"
                              title="Copy formatted formal Email notice"
                            >
                              <Mail className="w-3 h-3" />
                              <span>Email</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: STATUTORY GUARDS - OUTWARD (Rule 88C DRC-01B Shield) */}
          {activeTab === 'guards' && reconType === 'OUTWARD' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Rule 88C DRC-01B Risk Gauge */}
              <div className="surface-card p-4 flex flex-col justify-between border-l-4 border-l-rose-500">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-rose-400" />
                      <span>Rule 88C (Form DRC-01B)</span>
                    </h4>
                    <span className={
                      reconResult.statutoryGuards?.rule88C_DRC01B?.triggersNotice 
                        ? 'badge-blocked' 
                        : (reconResult.statutoryGuards?.rule88C_DRC01B?.excessPortalTax > 0 ? 'badge-variance' : 'badge-matched')
                    }>
                      {reconResult.statutoryGuards?.rule88C_DRC01B?.riskLevel || 'COMPLIANT'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Automated notices trigger if GSTR-1 liability exceeds books / 3B by &gt; 20% and ₹25,000.
                  </p>
                  <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block">Books Output Tax:</span>
                        <span className="text-sm font-semibold text-slate-200 font-mono tabular-nums">
                          ₹{(reconResult.statutoryGuards?.rule88C_DRC01B?.booksOutputTax || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block">GSTR-1 Output Tax:</span>
                        <span className="text-sm font-semibold text-slate-200 font-mono tabular-nums">
                          ₹{(reconResult.statutoryGuards?.rule88C_DRC01B?.portalOutputTax || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 mt-2.5 block">Excess Portal Tax (Notice Base):</span>
                    <span className="text-lg font-bold text-rose-400 font-mono tabular-nums mt-0.5 block">
                      ₹{(reconResult.statutoryGuards?.rule88C_DRC01B?.excessPortalTax || 0).toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 mt-2 block">Variance Percentage:</span>
                    <span className="text-sm font-bold text-amber-400 font-mono tabular-nums">
                      {reconResult.statutoryGuards?.rule88C_DRC01B?.excessPercentage || 0}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Omitted Turnover & Sec 16(2)(aa) Impact */}
              <div className="surface-card p-4 flex flex-col justify-between border-l-4 border-l-amber-500">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      <span>Sec 16(2)(aa) Buyer ITC & Sec 50</span>
                    </h4>
                    <span className="badge-variance">
                      {reconResult.statutoryGuards?.omittedTurnoverRisk?.omittedInvoiceCount || 0} Invoices Omitted
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Under Sec 16(2)(aa), buyers cannot claim ITC for unfiled invoices. Upload required in next GSTR-1.
                  </p>
                  <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">Omitted Turnover Tax:</span>
                    <span className="text-lg font-bold text-rose-400 font-mono tabular-nums mt-0.5 block">
                      ₹{(reconResult.statutoryGuards?.omittedTurnoverRisk?.omittedTaxAmount || 0).toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 mt-2.5 block">Est. Monthly Interest (18% p.a.):</span>
                    <span className="text-base font-bold text-amber-400 font-mono tabular-nums">
                      ₹{(reconResult.statutoryGuards?.omittedTurnoverRisk?.estimatedMonthlyInterest || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Unrecorded Portal Turnover */}
              <div className="surface-card p-4 flex flex-col justify-between border-l-4 border-l-blue-500">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <span>Unrecorded Portal Turnover</span>
                    </h4>
                    <span className="badge-neutral border-blue-800/50 text-blue-300 bg-blue-950/40">
                      {reconResult.statutoryGuards?.unrecordedPortalTurnover?.unrecordedInvoiceCount || 0} Invoices
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Invoices declared in GSTR-1 but missing in Sales Register. Reconcile ERP to prevent phantom liability.
                  </p>
                  <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">Unrecorded Tax in Books:</span>
                    <span className="text-lg font-bold text-slate-100 font-mono tabular-nums mt-0.5 block">
                      ₹{(reconResult.statutoryGuards?.unrecordedPortalTurnover?.unrecordedTaxAmount || 0).toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 mt-2.5 block">Action Required:</span>
                    <span className="text-xs font-medium text-slate-300 block mt-0.5">
                      Verify if sales vouchers were entered under different GSTIN or omitted from books.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: STATUTORY GUARDS - INWARD (Notice Radar) */}
          {activeTab === 'guards' && reconType === 'INWARD' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Section 16(4) Radar */}
              <div className="surface-card p-4 flex flex-col justify-between border-l-4 border-l-amber-500">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>Section 16(4) Cutoff Radar</span>
                    </h4>
                    <span className="badge-variance">
                      {reconResult.statutoryGuards.section16_4.daysUntilCutoff} Days to Nov 30
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Input Tax Credit for previous Financial Year lapses permanently on 30th November.
                  </p>
                  <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">Expiring Invoices:</span>
                    <span className="text-lg font-bold text-amber-300 font-mono tabular-nums mt-0.5 block">
                      {reconResult.statutoryGuards.section16_4.expiringInvoicesCount} Invoices
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 mt-2.5 block">Tax at Risk of Lapsing:</span>
                    <span className="text-base font-bold text-rose-400 font-mono tabular-nums">
                      ₹{reconResult.statutoryGuards.section16_4.expiringTaxRisk.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Rule 37 180-Day Payables */}
              <div className="surface-card p-4 flex flex-col justify-between border-l-4 border-l-rose-500">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      <span>Rule 37 (180-Day Payables)</span>
                    </h4>
                    <span className="badge-blocked">
                      {reconResult.statutoryGuards.rule37_180Day.mandatoryReversalCount} Overdue
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    If supplier is not paid within 180 days, ITC must be reversed with 18% p.a. interest.
                  </p>
                  <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">Mandatory Reversal Tax:</span>
                    <span className="text-lg font-bold text-rose-400 font-mono tabular-nums mt-0.5 block">
                      ₹{reconResult.statutoryGuards.rule37_180Day.totalTaxAtRisk.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 mt-2.5 block">Estimated Interest (18% p.a.):</span>
                    <span className="text-base font-bold text-amber-400 font-mono tabular-nums">
                      ₹{reconResult.statutoryGuards.rule37_180Day.totalEstimatedInterest.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Rule 88D (DRC-01C) Notice Gauge */}
              <div className="surface-card p-4 flex flex-col justify-between border-l-4 border-l-blue-500">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-blue-400" />
                      <span>Rule 88D (Form DRC-01C)</span>
                    </h4>
                    <span className={
                      reconResult.statutoryGuards.rule88D_DRC01C.triggersNotice 
                        ? 'badge-blocked' 
                        : 'badge-matched'
                    }>
                      {reconResult.statutoryGuards.rule88D_DRC01C.riskLevel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Automated notices trigger if GSTR-3B ITC exceeds GSTR-2B by &gt; 10% or ₹25 Lakhs.
                  </p>
                  <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">Excess Claimed:</span>
                    <span className="text-lg font-bold text-slate-100 font-mono tabular-nums mt-0.5 block">
                      ₹{reconResult.statutoryGuards.rule88D_DRC01C.excessClaimed.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 mt-2.5 block">Variance Percentage:</span>
                    <span className="text-base font-bold text-blue-400 font-mono tabular-nums">
                      {reconResult.statutoryGuards.rule88D_DRC01C.excessPercentage}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: B2C CASH / RETAIL SALES */}
          {activeTab === 'b2c' && (
            <div className="flex flex-col gap-4">
              <div className="p-3.5 rounded-lg bg-sky-950/30 border border-sky-850/40 text-sky-200 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>
                    <strong className="text-sky-100">B2C Retail & Cash Sales Segregation:</strong> Cash and unregistered consumer sales are declared collectively in GSTR-1 Table 7 (B2CS - Small) rather than individual invoice-level Table 4 (B2B). Segregating them ensures pure 1-to-1 B2B matching and prevents false Sec 16(2)(aa) alerts.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                  <span className="px-2.5 py-1 rounded bg-sky-900/40 border border-sky-700/50 text-sky-300">
                    B2C Output Tax: ₹{(reconResult.summary?.b2cTax || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 border-collapse">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Customer / Particulars</th>
                      <th className="py-2.5 px-3">Voucher / Inv No</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
                      <th className="py-2.5 px-3 text-right">CGST (₹)</th>
                      <th className="py-2.5 px-3 text-right">SGST (₹)</th>
                      <th className="py-2.5 px-3 text-right">IGST (₹)</th>
                      <th className="py-2.5 px-3 text-right">Total Tax (₹)</th>
                      <th className="py-2.5 px-3 text-center">GSTR-1 Reporting</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filterList(reconResult.buckets?.b2cInvoices || []).map((m, idx) => {
                      const item = m.prItem || m;
                      return (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2 px-3 font-medium text-slate-200">
                            {item.supplierName || 'Retail Cash Sale'}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-300">{item.invoiceNumber || item.voucherNumber || '-'}</td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-400">{item.invoiceDate || '-'}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">₹{(item.taxableValue || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400">₹{(item.cgst || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400">₹{(item.sgst || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400">₹{(item.igst || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-sky-400">₹{(item.totalTax || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-center">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-800/40 font-mono">
                              Table 7 (B2CS)
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {filterList(reconResult.buckets?.b2cInvoices || []).length === 0 && (
                      <tr>
                        <td colSpan="9" className="py-8 text-center text-slate-500">
                          No B2C cash sales found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 9: ACCOUNTING LEDGER DISCREPANCIES */}
          {activeTab === 'discrepancies' && (
            <div className="flex flex-col gap-4">
              <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-200 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong className="text-amber-100">Accounting Ledger Discrepancy Isolation: </strong>
                    Non-sales vouchers (such as Purchase vouchers entered into the Output CGST / SGST Sales register) have been detected. These are quarantined from Outward turnover to avoid distorting GSTR-1 sales reconciliation.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                  <span className="px-2.5 py-1 rounded bg-amber-900/50 border border-amber-700/50 text-amber-300">
                    Isolated Tax: ₹{(reconResult.summary?.ledgerDiscrepanciesTax || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 border-collapse">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Party Name</th>
                      <th className="py-2.5 px-3">Party GSTIN</th>
                      <th className="py-2.5 px-3">Voucher Type</th>
                      <th className="py-2.5 px-3">Voucher / Inv No</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
                      <th className="py-2.5 px-3 text-right">Tax Amount (₹)</th>
                      <th className="py-2.5 px-3">Audit Finding & Remediation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filterList(reconResult.buckets?.ledgerDiscrepancies || []).map((m, idx) => {
                      const item = m.prItem || m;
                      return (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2 px-3 font-semibold text-slate-200">
                            {item.supplierName || 'Unknown Party'}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-amber-300">{item.supplierGstin || '-'}</td>
                          <td className="py-2 px-3">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/40 font-mono font-semibold">
                              {item.voucherType || 'PURCHASE'}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-300">{item.invoiceNumber || item.voucherNumber || '-'}</td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-400">{item.invoiceDate || '-'}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">₹{(item.taxableValue || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-amber-400">₹{(item.totalTax || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-xs text-amber-200/90">
                            {item.remarks || 'Voucher recorded in Sales ledger; verify journal posting in Tally / ERP.'}
                          </td>
                        </tr>
                      );
                    })}
                    {filterList(reconResult.buckets?.ledgerDiscrepancies || []).length === 0 && (
                      <tr>
                        <td colSpan="8" className="py-8 text-center text-slate-500">
                          No ledger discrepancies detected.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
