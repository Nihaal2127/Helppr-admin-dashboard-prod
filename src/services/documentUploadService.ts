import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { AppConstant } from "../lib/global/AppConstant";
import { showLog } from "../helper/utility";

const LEGACY_IMAGE_CDN_BASE = "https://d2d4noj5f8gqer.cloudfront.net/";
const LIVE_IMAGE_CDN_BASE = "https://d20g1bd5nfpo8h.cloudfront.net/";

export function getMediaAssetBaseUrl(): string {
  const fromEnv = process.env.REACT_APP_IMAGE_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/?$/, "/");
  const fromConstant = AppConstant.IMAGE_BASE_URL.trim();
  if (fromConstant) return fromConstant.replace(/\/?$/, "/");
  // Help Pr Live: API often returns storage keys like `user_profile/...`.
  return LIVE_IMAGE_CDN_BASE;
}

/** Known CDN bases for media fallbacks (order = try order for relative keys). */
export function getMediaAssetCdnBases(): string[] {
  const bases: string[] = [];
  const add = (raw: string) => {
    const base = String(raw ?? "").trim().replace(/\/?$/, "/");
    if (base && /^https?:\/\//i.test(base) && !bases.includes(base)) {
      bases.push(base);
    }
  };
  add(process.env.REACT_APP_IMAGE_BASE_URL ?? "");
  add(AppConstant.IMAGE_BASE_URL);
  // Production partner/chat assets often live on this distribution.
  add(AppConstant.CHAT_AVATAR_IMAGE_BASE_URL);
  add(getMediaAssetBaseUrl());
  add(LIVE_IMAGE_CDN_BASE);
  add(LEGACY_IMAGE_CDN_BASE);
  return bases;
}

function pushUniqueUrl(urls: string[], value: string) {
  const v = String(value ?? "").trim();
  if (v && !urls.includes(v)) urls.push(v);
}

/**
 * Candidate browser URLs for an API/storage path.
 * Tries multiple CloudFront bases when the first host 404s (same pattern as chat media).
 */
export function resolveMediaAssetSrcCandidates(url?: string | null): string[] {
  const raw = String(url ?? "").trim();
  if (!raw) return [];
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return [raw];
  if (raw.startsWith("//")) return [`https:${raw}`];

  const urls: string[] = [];
  const bases = getMediaAssetCdnBases();

  if (/^https?:\/\//i.test(raw)) {
    pushUniqueUrl(urls, raw);
    try {
      const parsed = new URL(raw);
      const path = parsed.pathname.replace(/^\//, "");
      if (path) {
        for (const base of bases) {
          pushUniqueUrl(urls, `${base}${path}`);
        }
      }
    } catch {
      /* keep original only */
    }
    return urls;
  }

  const key = raw.replace(/^\//, "");
  for (const base of bases) {
    pushUniqueUrl(urls, `${base}${key}`);
  }
  return urls;
}

/** Browser-ready URL for API/storage paths (relative key, CDN URL, blob, or data URI). */
export function resolveMediaAssetSrc(url?: string | null): string {
  return resolveMediaAssetSrcCandidates(url)[0] ?? "";
}

/** Not a server storage key — preview-only (must not go in `update_file_urls`). */
export function isNonStorageImageUrl(url: string | null | undefined): boolean {
  const u = String(url ?? "").trim().toLowerCase();
  return u.startsWith("data:") || u.startsWith("blob:");
}

/** Normalize API / stored image paths for `update_file_urls` (relative storage key). */
export function toStorageRelativePath(url: string | null | undefined): string {
  const u = String(url ?? "").trim();
  if (!u || isNonStorageImageUrl(u)) return "";
  const bases = getMediaAssetCdnBases();
  for (const base of bases) {
    if (u.startsWith(base)) {
      return u.slice(base.length).replace(/^\//, "");
    }
  }
  if (u.startsWith("http://") || u.startsWith("https://")) {
    try {
      return new URL(u).pathname.replace(/^\//, "");
    } catch {
      return u.replace(/^\//, "");
    }
  }
  return u.replace(/^\//, "");
}

/** Paths safe for `update_file_urls` (never base64 / blob previews). */
export function normalizeReplaceStoragePaths(
  urls: (string | null | undefined)[]
): string[] {
  return urls.map((u) => toStorageRelativePath(u)).filter(Boolean);
}

function pathFromUploadRecord(record: unknown): string {
  if (typeof record === "string") return record.trim();
  if (record && typeof record === "object") {
    const row = record as Record<string, unknown>;
    return String(
      row.url ?? row.path ?? row.file_url ?? row.image_url ?? row.key ?? ""
    ).trim();
  }
  return String(record ?? "").trim();
}

/** `POST/PUT /document_upload/*` — supports flat or nested `data.records`. */
export function extractUploadedFilePaths(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const inner =
    root.data != null && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null;
  const recordsRaw = inner?.records ?? root.records ?? [];
  if (!Array.isArray(recordsRaw)) return [];
  return recordsRaw.map(pathFromUploadRecord).filter(Boolean);
}

export type UploadDocumentImagesParams = {
  /** Document upload `type` (e.g. `"2"` category/service, `"4"` profile). */
  uploadType: string | number;
  files: File[];
  isEditMode: boolean;
  replaceUrls?: string[];
  /** Fallback storage keys when replacing (e.g. existing `profile_url` / `image_url`). */
  existingStoragePaths?: (string | null | undefined)[];
  /**
   * When true (default on edit): `POST` new file only — never `PUT` replace.
   * PUT `/document_upload/update_files` is unreliable (502); upload a new key and update the entity URL instead.
   * Pass `alwaysPostNewFile: false` only if you must use in-place replace.
   */
  alwaysPostNewFile?: boolean;
};

export type UploadDocumentImagesResult = {
  ok: boolean;
  paths: string[];
  usedReplace: boolean;
};

/** Shared upload/replace flow (User Information, Category, Service, etc.). */
export async function uploadDocumentImages(
  params: UploadDocumentImagesParams
): Promise<UploadDocumentImagesResult> {
  const {
    uploadType,
    files,
    isEditMode,
    replaceUrls = [],
    existingStoragePaths = [],
    alwaysPostNewFile: alwaysPostNewFileParam,
  } = params;

  /** On edit, default to POST (new storage key) — PUT replace often 502s or returns empty `records`. */
  const forceNewUpload =
    isEditMode && alwaysPostNewFileParam !== false;

  if (files.length === 0) {
    return { ok: true, paths: [], usedReplace: false };
  }

  const formData = new FormData();
  formData.append("type", String(uploadType));
  files.forEach((file) => formData.append("files", file));

  const replacePaths =
    isEditMode && !forceNewUpload
      ? normalizeReplaceStoragePaths(
          replaceUrls.length > 0 ? replaceUrls : existingStoragePaths
        )
      : [];
  const usedReplace = replacePaths.length > 0;
  if (usedReplace) {
    formData.append("update_file_urls", JSON.stringify(replacePaths));
  }

  const { response, fileList: rawFileList } = await createOrUpdateDocument(
    formData,
    usedReplace,
    {
      replaceFallbackPaths: replacePaths,
      allowReplaceFallback: !forceNewUpload,
    }
  );

  const fileList = rawFileList
    .map((p) => toStorageRelativePath(p) || p)
    .filter(Boolean);

  if (!response || fileList.length === 0) {
    return { ok: false, paths: [], usedReplace };
  }

  return { ok: true, paths: fileList, usedReplace };
}

export function documentUploadFailureMessage(usedReplace: boolean): string {
  return usedReplace
    ? "Image replace failed. Please try again."
    : "Image upload did not return a file path. Please try again.";
}

export const createOrUpdateDocument = async (
  data: FormData,
  isEditable: boolean,
  options?: { replaceFallbackPaths?: string[]; allowReplaceFallback?: boolean }
): Promise<{ fileList: string[]; response: boolean }> => {
  const path = isEditable
    ? ApiPaths.UPDATE_DOCUMENT_UPLOAD
    : ApiPaths.DOCUMENT_UPLOAD;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, data, true);
  if (response.success) {
    let fileList = extractUploadedFilePaths(response.data);
    const allowReplaceFallback = options?.allowReplaceFallback !== false;
    // PUT replace often returns `records: []` — only reuse old path for profile-style replace.
    if (
      fileList.length === 0 &&
      isEditable &&
      allowReplaceFallback &&
      (options?.replaceFallbackPaths?.length ?? 0) > 0
    ) {
      fileList = options!.replaceFallbackPaths!
        .map((p) => toStorageRelativePath(p))
        .filter(Boolean);
    }
    return {
      fileList,
      response: true,
    };
  }
  showLog("Document fail:", response.message || "Unknown error");
  return {
    fileList: [],
    response: false,
  };
};
