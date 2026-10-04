import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ocrEngine } from '../ocr/engine';
import { extractTransaction } from '../ocr/parse';
import type { QueueItem, TransactionRow } from '../types';

export interface QueueStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  isBusy: boolean;
}

/**
 * Runs OCR one image at a time and appends rows as each finishes.
 *
 * Recognition is CPU bound, so a single worker already saturates the machine;
 * running several in parallel only adds memory pressure and thrashing. The
 * image File is handed straight to the OCR engine and dropped from the queue
 * once processed, so no decoded bitmap is ever retained.
 */
export function useOcrQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [skipDuplicates, setSkipDuplicatesState] = useState(true);

  const queueRef = useRef<QueueItem[]>([]);
  const pumpingRef = useRef(false);
  const seenKeysRef = useRef(new Set<string>());
  const skipDuplicatesRef = useRef(true);

  const sync = useCallback(() => {
    setItems(queueRef.current.map((item) => ({ ...item })));
  }, []);

  const patchItem = useCallback(
    (id: string, patch: Partial<QueueItem>) => {
      const index = queueRef.current.findIndex((item) => item.id === id);
      if (index === -1) return;
      queueRef.current[index] = { ...queueRef.current[index]!, ...patch };
      sync();
    },
    [sync],
  );

  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;

    try {
      for (;;) {
        const next = queueRef.current.find(
          (item) => item.status === 'queued' && item.file !== null,
        );
        if (!next?.file) break;

        patchItem(next.id, { status: 'processing', progress: 0 });

        try {
          const ocr = await ocrEngine.recognize(next.file, {
            onProgress: (progress) => patchItem(next.id, { progress }),
          });

          const row = extractTransaction(ocr, next.name, next.id);
          const key = dedupeKey(row);

          if (key) {
            if (skipDuplicatesRef.current && seenKeysRef.current.has(key)) {
              patchItem(next.id, { status: 'done', progress: 1, error: 'Skipped as duplicate' });
              continue;
            }
            seenKeysRef.current.add(key);
          }

          setRows((previous) => [...previous, row]);
          patchItem(next.id, { status: 'done', progress: 1 });
        } catch (error) {
          patchItem(next.id, {
            status: 'error',
            progress: 1,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        } finally {
          releaseImage(next.id);
        }
      }
    } finally {
      pumpingRef.current = false;
      sync();
    }

    function releaseImage(id: string) {
      queueRef.current = queueRef.current.map((item) =>
        item.id === id ? { ...item, file: null } : item,
      );
    }
  }, [patchItem, sync]);

  const addFiles = useCallback(
    (files: File[]) => {
      const accepted = files.filter((file) => file.type.startsWith('image/'));
      if (accepted.length === 0) return;

      queueRef.current = [
        ...queueRef.current,
        ...accepted.map((file) => ({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          status: 'queued' as const,
          progress: 0,
        })),
      ];
      sync();
      void pump();
    },
    [pump, sync],
  );

  const removeItem = useCallback(
    (id: string) => {
      if (pumpingRef.current) return;
      queueRef.current = queueRef.current.filter((item) => item.id !== id);
      setRows((previous) => previous.filter((row) => row.id !== id));
      sync();
    },
    [sync],
  );

  const clear = useCallback(() => {
    if (pumpingRef.current) return;
    queueRef.current = [];
    seenKeysRef.current.clear();
    setRows([]);
    sync();
  }, [sync]);

  const clearFinished = useCallback(() => {
    if (pumpingRef.current) return;
    queueRef.current = queueRef.current.filter(
      (item) => item.status === 'queued' || item.status === 'processing',
    );
    sync();
  }, [sync]);

  const setSkipDuplicates = useCallback((value: boolean) => {
    skipDuplicatesRef.current = value;
    setSkipDuplicatesState(value);
  }, []);

  useEffect(() => () => void ocrEngine.dispose(), []);

  const stats = useMemo<QueueStats>(() => {
    let completed = 0;
    let failed = 0;
    let pending = 0;

    for (const item of items) {
      if (item.status === 'error') failed++;
      else if (item.status === 'queued' || item.status === 'processing') pending++;
      else completed++;
    }

    return { total: items.length, completed, failed, pending, isBusy: pending > 0 };
  }, [items]);

  return {
    items,
    rows,
    stats,
    skipDuplicates,
    addFiles,
    removeItem,
    clear,
    clearFinished,
    setSkipDuplicates,
  };
}

function dedupeKey(row: TransactionRow): string | null {
  const id = row.values.transactionId;
  const ref = row.values.upiRefNo;
  if (id) return `t:${id}`;
  if (ref) return `r:${ref}`;
  return null;
}
