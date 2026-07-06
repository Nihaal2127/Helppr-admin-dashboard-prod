import { showSuccessAlert, showErrorAlert } from "../alertHelper";
import { showLoader, hideLoader } from "../../../components/CustomLoader";
import { ROUTES } from "../../../routes/Routes";
import { AppConstant } from "../AppConstant";
import { clearLocalStorage } from "../localStorageHelper";
import { isMockAuthSession } from "../authSessionHelper";
import { ApiPaths } from "./apiPaths";
import { getNavigate } from "../../../helper/navigation";
import { closeAllModals } from "../DialogManager";

/** Path without query string — used so `/getCount?franchise_id=…` is treated like `/getCount`. */
function endpointPathOnly(endpoint: string): string {
  const q = endpoint.indexOf("?");
  return q >= 0 ? endpoint.slice(0, q) : endpoint;
}

export const apiRequest = async (
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  payload?: any,
  isMultipart: boolean = false,
  skipLoader: boolean = false,
  suppressErrorAlert: boolean = false,
  /** When true, non-GET success responses do not show the global “Operation successful” toast. */
  suppressSuccessAlert: boolean = false,
  /** When aborted, the promise resolves with `{ success: false, aborted: true }` (no error toast). */
  signal?: AbortSignal
) => {
  try {
    if (!skipLoader) showLoader();

    const headers: HeadersInit = {
      Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      ...(isMultipart ? {} : { "Content-Type": "application/json" }),
    };
    /** Query string is part of `endpoint` for GET (e.g. `/category/getAll/:id?page=1`). */

    const requestUrl = `${AppConstant.BASE_URL}${endpoint}`;

    const response = await fetch(requestUrl, {
      method,
      headers,
      ...(signal ? { signal } : {}),
      ...(method !== "GET" && payload !== undefined
        ? { body: isMultipart ? payload : JSON.stringify(payload) }
        : {}),
    });

    if (!skipLoader) hideLoader();

    const responseText = await response.text();
    let data: any = {};

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { message: responseText || "Invalid server response" };
    }

    if (response.ok) {
      if (method !== "GET" && !suppressSuccessAlert) {
        const path = endpointPathOnly(endpoint);
        if (
          path !== ApiPaths.LOGOUT() &&
          path !== ApiPaths.LOGIN() &&
          path !== ApiPaths.DOCUMENT_UPLOAD &&
          path !== ApiPaths.UPDATE_DOCUMENT_UPLOAD &&
          path !== ApiPaths.GET_COUNT
        ) {
          const successMessage = data.message || "Operation successful!";
          showSuccessAlert(successMessage);
        }
      }
      return { success: true, data };
    } else {
      const navigate = getNavigate();

      if (response.status === 500) {
        closeAllModals();
      } else if (response.status === 401) {
        if (endpoint !== ApiPaths.LOGIN() && !isMockAuthSession()) {
          clearLocalStorage();
          navigate?.(ROUTES.LOGIN.path);
        }
      }

      if (
        !(response.status === 401 && isMockAuthSession()) &&
        !suppressErrorAlert
      ) {
        showErrorAlert(data.message || "Request failed");
      }
      return {
        success: false,
        status: response.status,
        message: data.message || "Request failed",
      };
    }
  } catch (error: any) {
    if (!skipLoader) hideLoader();

    if (error?.name === "AbortError") {
      return { success: false, aborted: true as const, error: "aborted" };
    }

    const errorMessage =
      error?.message === "Failed to fetch"
        ? "Request failed. Please check API access."
        : error?.message || "Network error";

    if (!suppressErrorAlert) {
      showErrorAlert(errorMessage);
    }

    return { success: false, error: errorMessage };
  }
};

export const apiRequestBlob = async (endpoint: string, payload?: any) => {
  try {
    showLoader();

    const headers: HeadersInit = {
      Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      "Content-Type": "application/json",
      "Accept-Encoding": "identity",
    };

    const requestUrl = `${AppConstant.BASE_URL}${endpoint}`;

    const response = await fetch(requestUrl, {
      method: "POST",
      headers,
      ...(payload !== undefined && { body: JSON.stringify(payload) }),
    });

    hideLoader();
    if (response.ok) {
      const contentDisposition = response.headers.get("Content-Disposition");
      const filename = contentDisposition
        ? contentDisposition.split("filename=")[1]?.replace(/['"]/g, "")
        : "report.xlsx";

      const contentType = response.headers.get("Content-Type") || "";

      if (
        contentType.includes(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
      ) {
        const base64Data = await response.text();
        const binaryData = atob(base64Data);

        const byteNumbers = new Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
          byteNumbers[i] = binaryData.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: contentType });

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showSuccessAlert("Download Successfully");
        return { success: true };
      }

      showErrorAlert("Invalid file format received");
      return { success: false, message: "Invalid file format received" };
    } else {
      const navigate = getNavigate();
      if (response.status === 500) {
        closeAllModals();
      } else if (response.status === 401) {
        if (!isMockAuthSession()) {
          clearLocalStorage();
          navigate?.(ROUTES.LOGIN.path, { replace: true });
        }
      }

      if (!(response.status === 401 && isMockAuthSession())) {
        showErrorAlert("Failed to download the file");
      }
      return { success: false, message: "Failed to download the file" };
    }
  } catch (error: any) {
    hideLoader();
    return { success: false, error: error.message || "Network error" };
  }
};
