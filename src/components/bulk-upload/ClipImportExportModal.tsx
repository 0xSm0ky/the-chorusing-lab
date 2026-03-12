'use client';

import { useState, useRef } from 'react';
import { Download, Upload, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import type { AudioClip } from '@/types/audio';

interface ClipImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clips?: AudioClip[];
  selectedClipIds?: string[];
  onImportSuccess?: (clips: AudioClip[]) => void;
}

export function ClipImportExportModal({
  isOpen,
  onClose,
  clips = [],
  selectedClipIds = [],
  onImportSuccess,
}: ClipImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [exportFormat, setExportFormat] = useState<'zip' | 'json'>('zip');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clipsToExport = selectedClipIds.length > 0
    ? clips.filter(c => selectedClipIds.includes(c.id))
    : clips;

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setMessage(null);

    try {
      const clipIds = clipsToExport.map(c => c.id);

      // Build query string with multiple clipIds values
      const params = new URLSearchParams();
      params.append('format', exportFormat);
      clipIds.forEach(id => params.append('clipIds', id));

      const response = await fetch(`/api/clips/import-export?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Export failed');
      }

      // Get the filename from Content-Disposition header or create default
      const contentDisposition = response.headers.get('content-disposition');
      const filename = contentDisposition
        ? contentDisposition.split('filename="')[1]?.split('"')[0] || `clips-export-${Date.now()}.${exportFormat}`
        : `clips-export-${Date.now()}.${exportFormat}`;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage(
        `✅ Exported ${clipsToExport.length} clip${clipsToExport.length !== 1 ? 's' : ''} as ${exportFormat.toUpperCase()}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/clips/import-export', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Import failed');
      }

      setMessage(
        `✅ Successfully imported ${result.importedCount} clip${result.importedCount !== 1 ? 's' : ''}${
          result.errors && result.errors.length > 0
            ? ` (${result.errors.length} error${result.errors.length !== 1 ? 's' : ''})`
            : ''
        }`
      );

      if (result.errors && result.errors.length > 0) {
        console.warn('Import errors:', result.errors);
      }

      onImportSuccess?.([]);

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Import/Export Clips
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => {
              setActiveTab('export');
              setError(null);
              setMessage(null);
            }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'export'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Export
          </button>
          <button
            onClick={() => {
              setActiveTab('import');
              setError(null);
              setMessage(null);
            }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'import'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Import
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {activeTab === 'export' ? (
            <>
              <p className="text-sm text-gray-600">
                Download your clips for backup or sharing with audio files included.
              </p>

              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="format"
                    value="zip"
                    checked={exportFormat === 'zip'}
                    onChange={() => setExportFormat('zip')}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <div>
                    <p className="font-medium text-gray-900">ZIP (with audio)</p>
                    <p className="text-xs text-gray-500">Includes all audio files</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="format"
                    value="json"
                    checked={exportFormat === 'json'}
                    onChange={() => setExportFormat('json')}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <div>
                    <p className="font-medium text-gray-900">JSON (metadata only)</p>
                    <p className="text-xs text-gray-500">Metadata only, no audio files</p>
                  </div>
                </label>
              </div>

              <button
                onClick={handleExport}
                disabled={exporting || clipsToExport.length === 0}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
              >
                {exporting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export {clipsToExport.length} Clip{clipsToExport.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Upload a previously exported clips file (.zip or .json) to restore your clips.
              </p>

              <label className="block">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.json"
                  onChange={handleImport}
                  disabled={importing}
                  className="hidden"
                />
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-400 transition-colors">
                  <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-700">
                    {importing ? 'Importing...' : 'Click to upload or drag file'}
                  </p>
                  <p className="text-xs text-gray-500">
                    ZIP or JSON files only
                  </p>
                </div>
              </label>
            </>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {message && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md flex items-start gap-2 text-green-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="text-sm">{message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
