import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { AppConstant } from "../lib/global/AppConstant";
import { showLog } from "../helper/utility";

/** Browser-ready URL for API/storage paths (relative key, CDN URL, blob, or data URI). */
export function resolveMediaAssetSrc(url?: string | null): string {
  const u = String(url ?? "").trim();
  if (!u) return "";
  if (u.startsWith("data:") || u.startsWith("blob:")) return u;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return `https:${u}`;
  const base = AppConstant.IMAGE_BASE_URL.replace(/\/?$/, "/");
  return `${base}${u.replace(/^\//, "")}`;
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
  const base = AppConstant.IMAGE_BASE_URL.replace(/\/?$/, "/");
  if (u.startsWith(base)) {
    return u.slice(base.length).replace(/^\//, "");
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
  } = params;

  if (files.length === 0) {
    return { ok: true, paths: [], usedReplace: false };
  }

  const formData = new FormData();
  formData.append("type", String(uploadType));
  files.forEach((file) => formData.append("files", file));

  const replacePaths = isEditMode
    ? normalizeReplaceStoragePaths(
        replaceUrls.length > 0 ? replaceUrls : existingStoragePaths
      )
    : [];
  const usedReplace = replacePaths.length > 0;
  if (usedReplace) {
    formData.append("update_file_urls", JSON.stringify(replacePaths));
  }

  const { response, fileList } = await createOrUpdateDocument(
    formData,
    usedReplace,
    { replaceFallbackPaths: replacePaths }
  );

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
  options?: { replaceFallbackPaths?: string[] }
): Promise<{ fileList: string[]; response: boolean }> => {
  const path = isEditable
    ? ApiPaths.UPDATE_DOCUMENT_UPLOAD
    : ApiPaths.DOCUMENT_UPLOAD;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, data, true);
  if (response.success) {
    let fileList = extractUploadedFilePaths(response.data);
    // PUT replace often returns `records: []` — file is overwritten in place at the same key.
    if (
      fileList.length === 0 &&
      isEditable &&
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
