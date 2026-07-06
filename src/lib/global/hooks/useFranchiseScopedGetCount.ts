import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";
import type { CountModel } from "../../models/CountModel";
import { getCount } from "../../../services/getCountService";
import { resolveGetCountTypeFromPathname } from "../getCountRouteType";
import {
  HEADER_FRANCHISE_CHANGED_EVENT,
  franchiseHeaderFormDefaults,
  franchiseIdForUserGetAll,
  readHeaderFranchisePreference,
} from "../../franchise/headerFranchisePreference";

export const FRANCHISE_HEADER_FIELD = "franchise_id" as const;
export const FRANCHISE_HEADER_ALL = "all" as const;

export type FranchiseHeaderFormValues = {
  franchise_id: string;
};

/** Form wiring for `CustomHeader` franchise dropdown on list pages. */
export function useFranchiseHeaderForm(): {
  register: UseFormRegister<FranchiseHeaderFormValues>;
  setValue: UseFormSetValue<FranchiseHeaderFormValues>;
  franchiseId: string;
} {
  const { register, setValue, watch } = useForm<FranchiseHeaderFormValues>({
    defaultValues: franchiseHeaderFormDefaults(),
  });
  const franchiseId = String(
    watch(FRANCHISE_HEADER_FIELD) ?? FRANCHISE_HEADER_ALL
  );

  useEffect(() => {
    const sync = () => {
      const next = readHeaderFranchisePreference();
      setValue(FRANCHISE_HEADER_FIELD, next, { shouldValidate: false });
    };
    window.addEventListener(
      HEADER_FRANCHISE_CHANGED_EVENT,
      sync as EventListener
    );
    return () =>
      window.removeEventListener(
        HEADER_FRANCHISE_CHANGED_EVENT,
        sync as EventListener
      );
  }, [setValue]);

  return { register, setValue, franchiseId };
}

/**
 * Loads `POST /getCount` for the current page, optionally scoped by header franchise.
 * Pass `type` explicitly, or omit to resolve from the current pathname.
 */
export function useFranchiseScopedGetCount(args: {
  type?: number | string;
  franchiseId?: string;
}): {
  countModel: CountModel | null;
  refresh: () => Promise<void>;
} {
  const location = useLocation();
  const resolvedType = useMemo(() => {
    if (args.type != null && String(args.type).trim() !== "") return args.type;
    return resolveGetCountTypeFromPathname(location.pathname)?.type ?? null;
  }, [args.type, location.pathname]);

  const [countModel, setCountModel] = useState<CountModel | null>(null);

  const refresh = useCallback(async () => {
    if (resolvedType == null) {
      setCountModel(null);
      return;
    }
    const fid = franchiseIdForUserGetAll(args.franchiseId);
    const extra = fid ? { franchise_id: fid } : undefined;
    const { countModel: next, responseCount } = await getCount(
      resolvedType,
      extra
    );
    if (responseCount) setCountModel(next);
  }, [resolvedType, args.franchiseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { countModel, refresh };
}
