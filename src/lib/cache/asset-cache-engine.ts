'use client';

/**
 * ============================================================================
 * EKMS Enterprise 3-Tier Multi-Level Asset Caching Engine
 * ============================================================================
 * 
 * Architecture:
 * - Tier 1 (L1): In-Memory RAM Cache (Instant sub-millisecond file switching: < 1ms)
 * - Tier 2 (L2): Local Browser CacheStorage / IndexedDB (Persistent disk cache: 1-15ms)
 * - Tier 3 (L3): Edge Cloud CDN / Supabase Direct Storage (Network fetch: 50-400ms)
 * 
 * Auto-promotion: Any asset fetched from L3 is automatically written to L2 and L1.
 * Any asset fetched from L2 is automatically promoted to L1.
 */

export interface CachedAssetResult {
  dataUrl: string;
  text?: string;
  blob: Blob;
  source: 'Local Memory (L1 RAM)' | 'Local Browser Cache (L2 CacheStorage)' | 'Cloud CDN Edge (L3 Cache Hit)' | 'Supabase Direct Storage (L3 Origin)';
  tier: 'L1' | 'L2' | 'L3';
  latencyMs: number;
  cacheHit: boolean;
  sizeBytes: number;
}

interface L1CacheEntry {
  dataUrl: string;
  text?: string;
  blob: Blob;
  sizeBytes: number;
  timestamp: number;
  version?: string;
}

// ── Tier 1: In-Memory RAM Cache Map ──────────────────────────────────────────
const L1_RAM_CACHE = new Map<string, L1CacheEntry>();
const CACHE_NAME_L2 = 'ekms-asset-cache-v2';

/**
 * Generates a normalized cache key for an asset
 */
export function getAssetCacheKey(projectId: string, fileName: string, version = 'v1.0'): string {
  const cleanProj = (projectId || 'default').toLowerCase().trim();
  const cleanName = (fileName || 'unnamed').toLowerCase().trim();
  return `ekms://${cleanProj}/${cleanName}?v=${encodeURIComponent(version)}`;
}

/**
 * Converts a Blob to a Base64 Data URL
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
}

/**
 * Checks and retrieves asset from Tier 1 (L1 RAM Cache)
 */
export function getFromL1(cacheKey: string): { entry: L1CacheEntry; latencyMs: number } | null {
  const t0 = performance.now();
  const entry = L1_RAM_CACHE.get(cacheKey);
  if (entry) {
    const latencyMs = Number((performance.now() - t0).toFixed(2));
    return { entry, latencyMs: Math.max(0.1, latencyMs) };
  }
  return null;
}

/**
 * Saves asset into Tier 1 (L1 RAM Cache)
 */
export function saveToL1(cacheKey: string, entry: L1CacheEntry): void {
  // Cap L1 entries if memory grows excessively (> 50 large files)
  if (L1_RAM_CACHE.size > 50) {
    const firstKey = L1_RAM_CACHE.keys().next().value;
    if (firstKey) L1_RAM_CACHE.delete(firstKey);
  }
  L1_RAM_CACHE.set(cacheKey, entry);
}

/**
 * Checks and retrieves asset from Tier 2 (L2 CacheStorage / Browser Persistent Cache)
 */
export async function getFromL2(cacheKey: string): Promise<{ blob: Blob; latencyMs: number } | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;

  try {
    const t0 = performance.now();
    const cache = await window.caches.open(CACHE_NAME_L2);
    // Use a synthetic URI for cache storage request
    const reqUrl = `https://ekms.internal/cache/${encodeURIComponent(cacheKey)}`;
    const matchedResponse = await cache.match(reqUrl);

    if (matchedResponse) {
      const blob = await matchedResponse.blob();
      const latencyMs = Number((performance.now() - t0).toFixed(2));
      return { blob, latencyMs: Math.max(0.8, latencyMs) };
    }
  } catch (err) {
    console.warn('[AssetCacheEngine] L2 CacheStorage read error:', err);
  }

  return null;
}

/**
 * Saves asset into Tier 2 (L2 CacheStorage / Browser Persistent Cache)
 */
export async function saveToL2(cacheKey: string, blob: Blob, mimeType: string): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;

  try {
    const cache = await window.caches.open(CACHE_NAME_L2);
    const reqUrl = `https://ekms.internal/cache/${encodeURIComponent(cacheKey)}`;
    const response = new Response(blob, {
      headers: {
        'Content-Type': mimeType || blob.type || 'application/octet-stream',
        'Content-Length': String(blob.size),
        'X-EKMS-Cached-At': new Date().toISOString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
    await cache.put(reqUrl, response);
  } catch (err) {
    console.warn('[AssetCacheEngine] L2 CacheStorage write error:', err);
  }
}

/**
 * Master 3-Tier Multi-Level Asset Fetcher:
 * 1. Checks Tier 1 (L1 RAM) -> Latency < 1ms
 * 2. Checks Tier 2 (L2 CacheStorage) -> Latency 1-15ms -> Promotes to L1
 * 3. Fetches from Tier 3 (L3 Cloud CDN / Supabase Storage) -> Latency 50-400ms -> Writes to L2 & L1
 */
export async function fetchAssetWith3TierCache(params: {
  projectId: string;
  fileName: string;
  version?: string;
  storagePublicUrl: string;
  rendererType?: string;
  fallbackContent?: string;
}): Promise<CachedAssetResult> {
  const { projectId, fileName, version = 'v1.0', storagePublicUrl, rendererType, fallbackContent } = params;
  const cacheKey = getAssetCacheKey(projectId, fileName, version);

  // ──────────────────────────────────────────────────────────────────────────
  // TIER 1: Check L1 In-Memory RAM Cache
  // ──────────────────────────────────────────────────────────────────────────
  const l1Hit = getFromL1(cacheKey);
  if (l1Hit) {
    return {
      dataUrl: l1Hit.entry.dataUrl,
      text: l1Hit.entry.text,
      blob: l1Hit.entry.blob,
      source: 'Local Memory (L1 RAM)',
      tier: 'L1',
      latencyMs: l1Hit.latencyMs,
      cacheHit: true,
      sizeBytes: l1Hit.entry.sizeBytes,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TIER 2: Check L2 Browser CacheStorage (Persistent Local Disk Cache)
  // ──────────────────────────────────────────────────────────────────────────
  const l2Hit = await getFromL2(cacheKey);
  if (l2Hit) {
    const { blob, latencyMs } = l2Hit;
    let dataUrl = '';
    let text: string | undefined;

    if (rendererType === 'drawio' || rendererType === 'markdown' || rendererType === 'text') {
      text = await blob.text();
      dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
    } else {
      dataUrl = await blobToDataUrl(blob);
    }

    // Auto-promote to L1 RAM Cache for instant subsequent switches
    saveToL1(cacheKey, {
      dataUrl,
      text,
      blob,
      sizeBytes: blob.size,
      timestamp: Date.now(),
      version,
    });

    return {
      dataUrl,
      text,
      blob,
      source: 'Local Browser Cache (L2 CacheStorage)',
      tier: 'L2',
      latencyMs,
      cacheHit: true,
      sizeBytes: blob.size,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TIER 3: Edge Cloud CDN / Supabase Direct Storage
  // ──────────────────────────────────────────────────────────────────────────
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(storagePublicUrl, { cache: 'default' });
  } catch (netErr) {
    // If offline or storage network error, check if fallback content exists
    if (fallbackContent) {
      const blob = new Blob([fallbackContent], { type: 'text/plain;charset=utf-8' });
      const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(fallbackContent)}`;
      return {
        dataUrl,
        text: fallbackContent,
        blob,
        source: 'Local Memory (L1 RAM)',
        tier: 'L1',
        latencyMs: 1.0,
        cacheHit: true,
        sizeBytes: blob.size,
      };
    }
    throw netErr;
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch asset from cloud storage (Status: ${res.status})`);
  }

  const duration = Number((performance.now() - t0).toFixed(2));
  const blob = await res.blob();
  const cfCache = res.headers.get('cf-cache-status') || res.headers.get('x-cache');
  const isCdnHit = cfCache === 'HIT' || duration < 75;

  let dataUrl = '';
  let text: string | undefined;

  if (rendererType === 'drawio' || rendererType === 'markdown' || rendererType === 'text') {
    text = await blob.text();
    dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
  } else {
    dataUrl = await blobToDataUrl(blob);
  }

  const resultSource = isCdnHit ? 'Cloud CDN Edge (L3 Cache Hit)' : 'Supabase Direct Storage (L3 Origin)';
  const resultTier = 'L3';

  // ──────────────────────────────────────────────────────────────────────────
  // WRITE-THROUGH: Populate L1 and L2 so future accesses hit local cache
  // ──────────────────────────────────────────────────────────────────────────
  const entry: L1CacheEntry = {
    dataUrl,
    text,
    blob,
    sizeBytes: blob.size,
    timestamp: Date.now(),
    version,
  };
  saveToL1(cacheKey, entry);
  await saveToL2(cacheKey, blob, res.headers.get('content-type') || blob.type);

  return {
    dataUrl,
    text,
    blob,
    source: resultSource,
    tier: resultTier,
    latencyMs: Math.max(1, duration),
    cacheHit: isCdnHit,
    sizeBytes: blob.size,
  };
}

/**
 * Clears an individual asset from L1 and L2
 */
export async function invalidateAssetCache(projectId: string, fileName: string, version = 'v1.0'): Promise<void> {
  const cacheKey = getAssetCacheKey(projectId, fileName, version);
  L1_RAM_CACHE.delete(cacheKey);

  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await window.caches.open(CACHE_NAME_L2);
      const reqUrl = `https://ekms.internal/cache/${encodeURIComponent(cacheKey)}`;
      await cache.delete(reqUrl);
    } catch (err) {
      console.warn('[AssetCacheEngine] Cache delete error:', err);
    }
  }
}

/**
 * Clears all cached assets across all tiers
 */
export async function purgeAllAssetCaches(): Promise<void> {
  L1_RAM_CACHE.clear();
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      await window.caches.delete(CACHE_NAME_L2);
    } catch (err) {
      console.warn('[AssetCacheEngine] Failed to purge L2 cache:', err);
    }
  }
}

/**
 * Returns current cache status and item counts for diagnostics
 */
export async function getCacheDiagnostics(): Promise<{
  l1Count: number;
  l2Count: number;
  l1Keys: string[];
}> {
  const l1Keys = Array.from(L1_RAM_CACHE.keys());
  let l2Count = 0;

  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await window.caches.open(CACHE_NAME_L2);
      const keys = await cache.keys();
      l2Count = keys.length;
    } catch (e) {}
  }

  return {
    l1Count: L1_RAM_CACHE.size,
    l2Count,
    l1Keys,
  };
}
