import { useEffect, useMemo, useState } from "react";
import { resolveChatMediaUrlCandidates } from "./chatDisplayHelpers";

/** Resolve chat attachment URL with CDN fallbacks; advances on <img onError>. */
export function useChatMediaSrc(fileUrl?: string | null) {
  const candidates = useMemo(
    () => resolveChatMediaUrlCandidates(fileUrl),
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
