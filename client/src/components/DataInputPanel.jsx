import React, { useState, useRef } from 'react';
import { FileText, Upload, FileCheck, Loader2, AlertCircle, Files, X, PlusCircle, Trash2, Server, RefreshCw } from 'lucide-react';
import TallySyncModal from './TallySyncModal';

export default function DataInputPanel({ rawText, setRawText }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [uploadedFilesList, setUploadedFilesList] = useState([]);
  const [isTallyModalOpen, setIsTallyModalOpen] = useState(false);
  const fileInputRef = useRef(null);

  const handleFilesUpload = async (files) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setIsUploading(true);
    setUploadStatus(null);

    // Create local previews for any images uploaded
    const imgPreviews = fileArray
      .filter(f => f.type.startsWith('image/'))
      .map(f => ({ name: f.name, url: URL.createObjectURL(f) }));
    if (imgPreviews.length > 0) {
      setImagePreviews(prev => [...prev, ...imgPreviews]);
    }

    const formData = new FormData();
    fileArray.forEach(f => {
      formData.append('files', f);
    });

    try {
      const response = await fetch('/api/upload-document', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to parse file(s).');
      }

      // Auto-append if text already exists, or set if empty
      setRawText(prev => {
        const newContent = data.extractedText || '';
        if (!prev || !prev.trim()) return newContent;
        return `${prev.trim()}\n\n${newContent}`;
      });

      setUploadedFilesList(prev => {
        const newFiles = data.files || [{ name: data.filename, type: data.fileType }];
        return [...prev, ...newFiles];
      });

      setUploadStatus({
        type: 'success',
        filename: data.filename,
        fileCount: data.fileCount || fileArray.length,
        fileType: data.fileType,
        summary: data.summary
      });
    } catch (err) {
      console.error('File upload error:', err);
      setUploadStatus({
        type: 'error',
        message: err.message
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  const handleClearAll = () => {
    setRawText('');
    setUploadedFilesList([]);
    setImagePreviews([]);
    setUploadStatus(null);
  };

  return (
    <div className="surface-card p-4 flex flex-col gap-3">
      {/* Header & Primary Actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Financial Data Input</h2>
        </div>
        <div className="flex items-center gap-2">
          {rawText.length > 0 && (
            <button
              onClick={handleClearAll}
              className="btn-ghost text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1.5"
              title="Clear all text and documents"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          )}

          {/* Tally Live Sync Button */}
          <button
            type="button"
            onClick={() => setIsTallyModalOpen(true)}
            className="btn-secondary text-xs flex items-center gap-1.5"
            title="Sync live Trial Balance directly from TallyPrime"
          >
            <Server className="w-3.5 h-3.5 text-slate-400" /> Sync with Tally
          </button>

          {/* Upload Document Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> Parsing...
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" /> Upload File
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.txt,.xml,.png,.jpg,.jpeg,.webp,.bmp"
            onChange={(e) => handleFilesUpload(e.target.files)}
            disabled={isUploading}
            className="hidden"
          />
        </div>
      </div>

      {/* Tally Sync Modal */}
      <TallySyncModal
        isOpen={isTallyModalOpen}
        onClose={() => setIsTallyModalOpen(false)}
        onSyncComplete={(syncData) => {
          if (syncData && syncData.extractedText) {
            setRawText(prev => {
              if (!prev || !prev.trim()) return syncData.extractedText;
              return `${prev.trim()}\n\n${syncData.extractedText}`;
            });
            setUploadedFilesList(prev => [
              ...prev,
              { name: `Tally: ${syncData.companyName || 'Active Company'}`, type: 'TALLY_SYNC' }
            ]);
            setUploadStatus({
              type: 'success',
              filename: syncData.companyName || 'Tally Sync',
              fileCount: 1,
              fileType: 'TALLY_SYNC',
              summary: syncData.summary || `Imported ${syncData.itemCount} ledger accounts from TallyPrime.`
            });
          }
        }}
      />

      {/* File Upload Status Banner */}
      {uploadStatus && (
        <div
          className={`text-xs p-3 rounded-lg flex items-center justify-between border ${
            uploadStatus.type === 'success'
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {uploadStatus.type === 'success' ? (
              <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <div>
              <span className="font-semibold">{uploadStatus.filename || 'Upload Status'}: </span>
              <span>{uploadStatus.summary || uploadStatus.message}</span>
            </div>
          </div>
          <button
            onClick={() => setUploadStatus(null)}
            className="text-slate-400 hover:text-white text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Uploaded Documents Badges if multiple files */}
      {uploadedFilesList.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap p-2 bg-slate-950/60 rounded-lg border border-slate-800 text-xs">
          <span className="text-slate-400 font-medium flex items-center gap-1">
            <Files className="w-3.5 h-3.5 text-blue-400" /> {uploadedFilesList.length} Merged Files:
          </span>
          {uploadedFilesList.map((f, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded bg-slate-850 text-slate-300 border border-slate-750 text-[11px] font-mono flex items-center gap-1"
            >
              <FileText className="w-3 h-3 text-slate-400" /> {f.name}
            </span>
          ))}
        </div>
      )}

      {/* Image Thumbnail Previews if images were uploaded */}
      {imagePreviews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {imagePreviews.map((img, idx) => (
            <div key={idx} className="relative rounded-lg border border-slate-750 bg-slate-900 p-2 flex items-center gap-2.5">
              <img
                src={img.url}
                alt={img.name}
                className="w-10 h-10 object-cover rounded border border-slate-700"
              />
              <div className="pr-3">
                <span className="text-xs font-medium text-slate-200 block truncate max-w-[130px]">{img.name}</span>
                <span className="text-[10px] text-slate-400">OCR & Vision Active</span>
              </div>
              <button
                onClick={() => setImagePreviews(prev => prev.filter((_, i) => i !== idx))}
                className="text-slate-500 hover:text-slate-300 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Textarea with Drag & Drop */}
      <div
        className="relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste trial balance, financial notes, or drag & drop files (PDF, Excel, CSV, Images) here..."
          className={`w-full h-64 bg-slate-950 border ${
            isDragOver ? 'border-blue-500 bg-blue-950/20' : 'border-slate-800'
          } rounded-lg p-3 text-xs text-slate-200 mono focus:outline-none focus:border-blue-500 transition-colors resize-none leading-relaxed`}
        />
        <div className="absolute bottom-2.5 right-3 text-[10px] text-slate-500 mono flex items-center gap-2 pointer-events-none">
          {isDragOver && <span className="text-blue-400 font-medium">Drop files to parse</span>}
          <span>{rawText.length.toLocaleString()} chars</span>
        </div>
      </div>
    </div>
  );
}
