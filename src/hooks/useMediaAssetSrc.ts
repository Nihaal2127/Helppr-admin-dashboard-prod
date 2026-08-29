import { useEffect, useMemo, useState } from "react";
import { resolveMediaAssetSrcCandidates } from "../services/documentUploadService";

/** Resolve storage/CDN media URL with host fallbacks; advances on media `onError`. */
export function useMediaAssetSrc(fileUrl?: string | null) {
  const candidates = useMemo(
    () => resolveMediaAssetSrcCandidates(fileUrl),
    [fileUrl]
  );
  const [srcIndex, setSrcIndex] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setSrcIndex(0);
    setLoadFailed(false);
  }, [fileUrl]);

  const src = candidates[srcIndex] ?? "";
  const hasMoreCandidates = srcIndex < candidates.length - 1;

  const onError = () => {
    setSrcIndex((prev) => {
      if (prev < candidates.length - 1) {
        return prev + 1;
      }
      setLoadFailed(true);
      return prev;
    });
  };

  return { src, loadFailed, onError, hasMoreCandidates };
}
