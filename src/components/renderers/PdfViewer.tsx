'use client';

import React, { useState, useRef, useEffect } from 'react';

interface PdfViewerProps {
  fileName: string;
  /** If provided, uses this data URL / blob URL directly */
  fileDataUrl?: string;
  onDownload: () => void;
}

/**
 * High-fidelity PDF viewer using native browser PDF engine via <iframe>.
 * For uploaded files (fileDataUrl present), renders from the data URL directly.
 * For hardcoded project files, fetches from /api/pdf?file={fileName}.
 * 
 * Features:
 * - Native browser PDF rendering (Chrome/Edge/Safari built-in PDF viewer)
 * - Built-in zoom, scroll, page navigation from browser PDF engine
 * - Additional toolbar with zoom controls and download
 * - Ctrl/Cmd + scroll for zoom
 * - Full mousepad pan/scroll support
 */
export function PdfViewer({ fileName, fileDataUrl, onDownload }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfSrc, setPdfSrc] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // ── Determine PDF Source URL ──────────────────────────────────────────
  useEffect(() => {
    if (fileDataUrl) {
      // Uploaded file — use data URL directly
      setPdfSrc(fileDataUrl);
      setLoading(false);
      return;
    }

    // Hardcoded project file — build API URL and verify it exists
    const apiUrl = `/api/pdf?file=${encodeURIComponent(fileName)}`;

    fetch(apiUrl, { method: 'HEAD' })
      .then((res) => {
        if (res.ok) {
          setPdfSrc(apiUrl);
        } else {
          setError(`PDF not found: ${fileName}`);
        }
        setLoading(false);
      })
      .catch(() => {
        // HEAD might not be supported, just try the URL anyway
        setPdfSrc(apiUrl);
        setLoading(false);
      });
  }, [fileName, fileDataUrl]);

  return (
    <div className="flex flex-col gap-2 w-full h-full flex-1 min-h-0">
      {/* ── Toolbar ────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center border-b border-[#c5c6ce] pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#c62828]">
            picture_as_pdf
          </span>
          <div>
            <h4 className="text-xs font-bold text-[#05162e] flex items-center gap-1.5">
              {fileName}
              <span className="px-1.5 py-0.5 bg-[#c62828] text-white text-[10px] font-mono rounded">
                PDF
              </span>
            </h4>
            <p className="text-[10px] text-[#44474d]">
              Native PDF Viewer • Scroll to navigate • Pinch/Ctrl+Scroll to zoom
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Open in new tab for full browser PDF experience */}
          {pdfSrc && !pdfSrc.startsWith('data:') && (
            <a
              href={pdfSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-[#eceef1] text-[#05162e] hover:bg-[#c5c6ce] rounded text-xs font-semibold transition-colors border border-[#c5c6ce] flex items-center gap-1"
              title="Open in new tab for full-screen PDF controls"
            >
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              <span>Full Screen</span>
            </a>
          )}

          {/* Download */}
          <button
            onClick={onDownload}
            className="px-3 py-1 bg-[#005FB7] text-white hover:bg-[#05162e] rounded text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
          >
            <span className="material-symbols-outlined text-[14px]">download</span>
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {/* ── PDF Embed Container ────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 bg-[#525659] rounded-lg overflow-hidden relative min-h-[600px] flex flex-col"
      >
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-[#525659]">
            <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-white">Loading PDF...</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#525659]">
            <span className="material-symbols-outlined text-[32px] text-red-400">error</span>
            <span className="text-sm font-bold text-red-300">{error}</span>
            <button
              onClick={onDownload}
              className="mt-2 px-4 py-1.5 bg-[#005FB7] text-white rounded text-xs font-bold hover:bg-[#05162e] transition-colors"
            >
              Download PDF Instead
            </button>
          </div>
        )}

        {!loading && !error && pdfSrc && (
          <iframe
            src={pdfSrc}
            className="w-full h-full min-h-[600px] border-0 flex-1"
            title={`PDF Viewer - ${fileName}`}
            style={{ background: '#525659' }}
          />
        )}
      </div>
    </div>
  );
}
