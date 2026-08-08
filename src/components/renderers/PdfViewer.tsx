'use client';

import React, { useState, useRef, useEffect } from 'react';

interface PdfViewerProps {
  fileName: string;
  /** If provided, uses this data URL / blob URL / storage URL directly */
  fileDataUrl?: string;
  onDownload: () => void;
}

/**
 * Universal High-Fidelity PDF Viewer for Chrome, Edge, Safari, Firefox, and WebKit.
 * 
 * Chromium (Chrome & Edge) blocks embedding `data:` URIs inside <iframe>/<embed>/<object>.
 * Safari WebKit natively allows it, which caused PDFs to show blank in Chrome/Edge while working in Safari.
 * 
 * Solution:
 * 1. Automatically converts any `data:application/pdf;base64,...` into a genuine `blob:http...` URL
 *    with explicit MIME type `application/pdf`.
 * 2. Uses `<object data={blobUrl} type="application/pdf">` with `<iframe src={blobUrl}>` fallback.
 * 3. Appends `#toolbar=1&view=FitH` parameter to activate native zoom/page controls.
 * 4. Cleans up object URLs on unmount to prevent memory leaks.
 */
export function PdfViewer({ fileName, fileDataUrl, onDownload }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfSrc, setPdfSrc] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const activeBlobUrlRef = useRef<string | null>(null);

  // Helper to convert Base64 data URI or raw string to a clean PDF Blob URL
  const createPdfBlobUrlFromDataUri = (dataUri: string): string => {
    try {
      const base64Data = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.warn('[PdfViewer] Error creating blob URL from base64 data URI:', e);
      return dataUri;
    }
  };

  // ── Determine and prepare PDF Source URL ─────────────────────────────────
  useEffect(() => {
    let isCancelled = false;

    // Clean up previous blob URL
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }

    setLoading(true);
    setError('');

    // Case 1: fileDataUrl provided directly (Base64 data URI or remote storage URL)
    if (fileDataUrl) {
      if (fileDataUrl.startsWith('data:')) {
        const blobUrl = createPdfBlobUrlFromDataUri(fileDataUrl);
        if (!isCancelled) {
          activeBlobUrlRef.current = blobUrl;
          setPdfSrc(blobUrl);
          setLoading(false);
          setError('');
        }
        return;
      }

      if (fileDataUrl.startsWith('blob:')) {
        if (!isCancelled) {
          setPdfSrc(fileDataUrl);
          setLoading(false);
          setError('');
        }
        return;
      }

      // If it's a remote HTTP/HTTPS URL (e.g. Supabase Storage), fetch as blob to bypass cross-origin iframe PDF blocks
      if (fileDataUrl.startsWith('http://') || fileDataUrl.startsWith('https://')) {
        fetch(fileDataUrl)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.blob();
          })
          .then((blob) => {
            if (isCancelled) return;
            const pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
            const blobUrl = URL.createObjectURL(pdfBlob);
            activeBlobUrlRef.current = blobUrl;
            setPdfSrc(blobUrl);
            setLoading(false);
          })
          .catch((err) => {
            if (isCancelled) return;
            console.warn('[PdfViewer] Direct fetch as blob failed, falling back to direct URL:', err);
            setPdfSrc(fileDataUrl);
            setLoading(false);
          });
        return;
      }

      if (!isCancelled) {
        setPdfSrc(fileDataUrl);
        setLoading(false);
      }
      return;
    }

    // Case 2: Hardcoded project file fallback via /api/pdf?file={fileName}
    const apiUrl = `/api/pdf?file=${encodeURIComponent(fileName)}`;

    fetch(apiUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`File not found: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (isCancelled) return;
        const pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(pdfBlob);
        activeBlobUrlRef.current = blobUrl;
        setPdfSrc(blobUrl);
        setLoading(false);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.warn('[PdfViewer] Local /api/pdf fetch error:', err);
        // Wait briefly in case remote caching engine is populating fileDataUrl
        const timer = setTimeout(() => {
          if (!isCancelled && !fileDataUrl) {
            setError(`Unable to render PDF schematic "${fileName}". You can download it directly below.`);
            setLoading(false);
          }
        }, 3000);
        return () => clearTimeout(timer);
      });

    return () => {
      isCancelled = true;
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
      }
    };
  }, [fileName, fileDataUrl]);

  // Formatted source with embedded toolbar parameters
  const embeddedSrc = pdfSrc ? (pdfSrc.includes('#') ? pdfSrc : `${pdfSrc}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`) : '';

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
              Universal PDF Viewer • Chrome • Edge • Safari • Firefox
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Open in new tab for full browser PDF experience */}
          {pdfSrc && (
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
        className="flex-1 bg-[#525659] rounded-lg overflow-hidden relative min-h-[620px] flex flex-col"
      >
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-[#525659]">
            <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-white">Rendering PDF Engine...</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#525659]">
            <span className="material-symbols-outlined text-[32px] text-red-400">error</span>
            <span className="text-sm font-bold text-red-300 text-center max-w-md px-4">{error}</span>
            <button
              onClick={onDownload}
              className="mt-2 px-4 py-1.5 bg-[#005FB7] text-white rounded text-xs font-bold hover:bg-[#05162e] transition-colors"
            >
              Download PDF Instead
            </button>
          </div>
        )}

        {!loading && !error && embeddedSrc && (
          <object
            data={embeddedSrc}
            type="application/pdf"
            className="w-full h-full min-h-[620px] border-0 flex-1 block"
            title={`PDF Viewer - ${fileName}`}
            style={{ background: '#525659' }}
          >
            <iframe
              src={embeddedSrc}
              className="w-full h-full min-h-[620px] border-0 flex-1 block"
              title={`PDF Viewer - ${fileName}`}
              style={{ background: '#525659' }}
            >
              <div className="p-8 text-center text-white flex flex-col items-center justify-center h-full">
                <p className="text-sm font-semibold mb-3">Your browser does not support embedded PDF viewing.</p>
                <button
                  onClick={onDownload}
                  className="px-4 py-2 bg-[#005FB7] text-white rounded font-bold hover:bg-[#05162e] transition-colors"
                >
                  Download {fileName}
                </button>
              </div>
            </iframe>
          </object>
        )}
      </div>
    </div>
  );
}
