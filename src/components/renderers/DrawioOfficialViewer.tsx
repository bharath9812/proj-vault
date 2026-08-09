'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface DrawioOfficialViewerProps {
  fileName: string;
  xmlDataUrl?: string;
  xmlRawContent?: string;
  onDownload: () => void;
}

/**
 * Draw.io Official Viewer — two rendering modes:
 *
 * 1. **Static Viewer (default)** — loads `viewer-static.min.js` from diagrams.net,
 *    creates a `<div class="mxgraph">` with `data-mxgraph` JSON containing the raw XML,
 *    and calls `GraphViewer.processElements()`. This works reliably for any file size
 *    and gives native page navigation, zoom, and fit controls.
 *
 * 2. **Embed iFrame** — loads `https://embed.diagrams.net` with `?proto=json&embed=1`.
 *    Listens for the `{ event: 'init' }` postMessage handshake from the iframe,
 *    then responds with `{ action: 'load', xml: '...' }`. This requires the iframe
 *    origin to accept cross-origin messages, which can be flaky on localhost.
 */
export function DrawioOfficialViewer({
  fileName,
  xmlDataUrl,
  xmlRawContent,
  onDownload,
}: DrawioOfficialViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [xml, setXml] = useState<string>('');
  const [mode, setMode] = useState<'static' | 'iframe'>('iframe'); // Default to embed iFrame
  const [loading, setLoading] = useState<boolean>(true);
  const [scriptLoaded, setScriptLoaded] = useState<boolean>(false);
  const initHandledRef = useRef<boolean>(false);

  // Helper to decode various XML input formats (Data URIs, Base64, raw XML)
  const decodeXmlPayload = (payload: string): string => {
    if (!payload) return '';
    if (payload.trim().startsWith('<')) return payload;

    if (payload.startsWith('data:')) {
      const parts = payload.split(',');
      if (parts.length > 1) {
        const header = parts[0];
        const body = parts.slice(1).join(',');
        if (header.includes(';base64')) {
          try {
            const binString = window.atob(body);
            const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
            return new TextDecoder().decode(bytes);
          } catch {
            try {
              return decodeURIComponent(escape(window.atob(body)));
            } catch {
              return window.atob(body);
            }
          }
        } else {
          try {
            return decodeURIComponent(body);
          } catch {
            return body;
          }
        }
      }
    }
    return payload;
  };

  // ── 1. Fetch / Decode XML ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    // Case A: Raw XML string directly passed
    if (xmlRawContent && xmlRawContent.length > 20) {
      const decoded = decodeXmlPayload(xmlRawContent);
      setXml(decoded);
      setLoading(false);
      return;
    }

    // Case B: Data URL or Supabase storage URL passed
    if (xmlDataUrl) {
      if (xmlDataUrl.startsWith('data:') || xmlDataUrl.trim().startsWith('<')) {
        const decoded = decodeXmlPayload(xmlDataUrl);
        setXml(decoded);
        setLoading(false);
        return;
      }

      if (xmlDataUrl.startsWith('http://') || xmlDataUrl.startsWith('https://')) {
        fetch(xmlDataUrl)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.text();
          })
          .then((text) => {
            if (!cancelled) {
              setXml(text);
              setLoading(false);
            }
          })
          .catch((err) => {
            console.warn('[DrawioViewer] Remote fetch error, falling back to local api:', err);
            if (!cancelled) fetchLocalFallback();
          });
        return;
      }
    }

    // Case C: Fallback to local /api/drawio route
    const fetchLocalFallback = () => {
      fetch('/api/drawio')
        .then((res) => res.text())
        .then((text) => {
          if (!cancelled && text.startsWith('<mxfile')) {
            setXml(text);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error('Failed to fetch drawio XML:', err);
          if (!cancelled) setLoading(false);
        });
    };

    fetchLocalFallback();

    return () => {
      cancelled = true;
    };
  }, [xmlRawContent, xmlDataUrl]);

  // ── 2. Static Viewer (viewer-static.min.js) ───────────────────────────
  useEffect(() => {
    if (!xml || mode !== 'static' || !containerRef.current) return;

    if (scriptLoaded && (window as any).GraphViewer) {
      renderStaticViewer();
      return;
    }

    if ((window as any).GraphViewer) {
      setScriptLoaded(true);
      renderStaticViewer();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://viewer.diagrams.net/js/viewer-static.min.js';
    script.async = true;

    script.onload = () => {
      setScriptLoaded(true);
      renderStaticViewer();
    };

    script.onerror = () => {
      console.error('Failed to load viewer-static.min.js');
    };

    document.head.appendChild(script);
  }, [xml, mode, scriptLoaded]);

  const renderStaticViewer = useCallback(() => {
    if (!containerRef.current || !xml) return;

    containerRef.current.innerHTML = '';

    const mxDiv = document.createElement('div');
    mxDiv.className = 'mxgraph';
    mxDiv.style.width = '100%';
    mxDiv.style.minHeight = '580px';
    mxDiv.setAttribute(
      'data-mxgraph',
      JSON.stringify({
        xml: xml,
        lightbox: false,
        highlight: '#005FB7',
        resize: true,
        toolbar: 'pages zoom layers',
        page: 0,
        'toolbar-nohide': true,
      })
    );
    containerRef.current.appendChild(mxDiv);

    if ((window as any).GraphViewer) {
      (window as any).GraphViewer.processElements();
    }
  }, [xml]);

  // ── 3. Embed iFrame postMessage handshake with automatic fallback ──────
  useEffect(() => {
    if (!xml || mode !== 'iframe') return;

    initHandledRef.current = false;

    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.includes('diagrams.net') && !event.origin.includes('draw.io')) {
        return;
      }

      let msg: any;
      try {
        msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }

      if (msg?.event === 'init' && !initHandledRef.current) {
        initHandledRef.current = true;
        const iframe = iframeRef.current;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage(
            JSON.stringify({
              action: 'load',
              xml: xml,
              autosave: 0,
            }),
            '*'
          );
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Timeout safety: If browser privacy protections block cross-origin postMessage,
    // switch to static viewer mode automatically after 4.5 seconds
    const timeoutTimer = setTimeout(() => {
      if (!initHandledRef.current && mode === 'iframe') {
        console.info('[DrawioViewer] postMessage handshake delayed or blocked by browser; switching to static viewer.');
        setMode('static');
      }
    }, 4500);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timeoutTimer);
    };
  }, [xml, mode]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 w-full h-full flex-1 min-h-0">
      {/* Header Toolbar */}
      <div className="flex justify-between items-center border-b border-[#c5c6ce] pb-2 shrink-0">
        <div>
          <h4 className="text-xs font-bold text-[#05162e] flex items-center gap-1.5">
            {fileName}
            <span className="px-1.5 py-0.5 bg-[#005FB7] text-white text-[10px] font-mono rounded">
              {mode === 'static' ? 'Draw.io Static Viewer' : 'Draw.io Embed iFrame'}
            </span>
          </h4>
          <p className="text-[10px] text-[#44474d]">
            {mode === 'static'
              ? 'Official Draw.io viewer-static.min.js • Multi-Page • Zoom • Layers'
              : 'Official Draw.io embed.diagrams.net • Interactive Editor Mode'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              initHandledRef.current = false;
              setMode(mode === 'static' ? 'iframe' : 'static');
            }}
            className="px-2.5 py-1 bg-[#eceef1] text-[#05162e] hover:bg-[#c5c6ce] rounded text-xs font-semibold transition-colors border border-[#c5c6ce]"
            title="Toggle between Static Viewer and Embed iFrame"
          >
            {mode === 'static' ? 'Switch to Embed iFrame' : 'Switch to Static Viewer'}
          </button>
          <button
            onClick={onDownload}
            className="px-3 py-1 bg-[#005FB7] text-white hover:bg-[#05162e] rounded text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
          >
            <span className="material-symbols-outlined text-[14px]">download</span>
            <span>Download Original .drawio</span>
          </button>
        </div>
      </div>

      {/* Main Renderer Container */}
      <div className="flex-1 bg-white border border-[#c5c6ce] rounded-lg shadow-sm overflow-hidden relative min-h-[600px] flex flex-col">
        {loading ? (
          <div className="absolute inset-0 bg-white z-20 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 border-3 border-[#005FB7] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-[#05162e]">Loading Draw.io XML...</span>
          </div>
        ) : mode === 'static' ? (
          <div
            ref={containerRef}
            className="w-full h-full min-h-[600px] flex-1 overflow-auto"
          />
        ) : (
          <iframe
            ref={iframeRef}
            src="https://embed.diagrams.net/?embed=1&proto=json&spin=1&modified=0&nav=1"
            className="w-full h-full min-h-[600px] border-0 flex-1"
            title={`Draw.io Embed - ${fileName}`}
            allow="fullscreen"
          />
        )}
      </div>
    </div>
  );
}
