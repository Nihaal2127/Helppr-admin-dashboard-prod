import { useEffect, useState } from "react";
import { fetchOrderById } from "../services/orderService";
import { resolveServiceImageUrl } from "../lib/chat/chatDisplayHelpers";

const cache = new Map<string, string | null>();

export function useOrderServiceImage(orderId?: string | null): {
  imageUrl: string | null;
  uniqueId: string | null;
  loading: boolean;
} {
  const id = String(orderId ?? "").trim();
  const [imageUrl, setImageUrl] = useState<string | null>(() =>
    id ? cache.get(id) ?? null : null
  );
  const [uniqueId, setUniqueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(id) && !cache.has(id));

  useEffect(() => {
    if (!id) {
      setImageUrl(null);
      setUniqueId(null);
      setLoading(false);
      return;
    }

    if (cache.has(id)) {
      setImageUrl(cache.get(id) ?? null);
      setLoading(false);
    } else {
      setLoading(true);
    }

    let cancelled = false;
    void fetchOrderById(id, { skipLoader: true }).then((res) => {
      if (cancelled) return;
      const order = res.order;
      const uid = String(order?.unique_id ?? "").trim() || null;
      const img =
        resolveServiceImageUrl(order?.service_items?.[0]?.service_info?.image_url) ??
        null;
      cache.set(id, img);
      setImageUrl(img);
      setUniqueId(uid);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        cache.set(id, null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { imageUrl, uniqueId, loading };
}
