import { showSuccessAlert, showErrorAlert } from "../alertHelper";
import { showLoader, hideLoader } from "../../../components/CustomLoader";
import { ROUTES } from "../../../routes/Routes";
import { AppConstant, getChatServiceUrl } from "../AppConstant";
import { clearLocalStorage } from "../localStorageHelper";
import { isMockAuthSession } from "../authSessionHelper";
import { getNavigate } from "../../../helper/navigation";
import { closeAllModals } from "../DialogManager";

/** REST client for Chat Service VPS (`CHAT_SERVICE_URL`). */
export const chatApiRequest = async (
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  payload?: unknown,
  options?: {
    skipLoader?: boolean;
    suppressErrorAlert?: boolean;
    suppressSuccessAlert?: boolean;
    signal?: AbortSignal;
  }
) => {
  const skipLoader = options?.skipLoader ?? false;
  const suppressErrorAlert = options?.suppressErrorAlert ?? false;
  const suppressSuccessAlert = options?.suppressSuccessAlert ?? true;

  try {
    if (!skipLoader) showLoader();

    const headers: HeadersInit = {
      Authorization: `Bearer ${localStorage.getItem(AppConstant.authToken)}`,
      "Content-Type": "application/json",
    };

    const requestUrl = `${getChatServiceUrl().replace(/^http:\/\//i, "https://")}${endpoint}`;

    const response = await fetch(requestUrl, {
      method,
      headers,
      ...(options?.signal ? { signal: options.signal } : {}),
      ...(method !== "GET" && payload !== undefined
        ? { body: JSON.stringify(payload) }
        : {}),
    });

    if (!skipLoader) hideLoader();

    const responseText = await response.text();
    let data: Record<string, unknown> = {};

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { message: responseText || "Invalid server response" };
    }

    if (response.ok) {
      if (data.success === false) {
        const message = String(data.message || "Request failed");
        if (!suppressErrorAlert) {
          showErrorAlert(message);
        }
        return {
          success: false as const,
          status: Number(data.status) || response.status,
          message,
          data,
        };
      }

      if (method !== "GET" && !suppressSuccessAlert) {
        showSuccessAlert(String(data.message || "Operation successful!"));
      }
      return { success: true as const, data };
    }

    const navigate = getNavigate();
    if (response.status === 500) {
      closeAllModals();
    } else if (response.status === 401) {
      if (!isMockAuthSession()) {
        clearLocalStorage();
        navigate?.(ROUTES.LOGIN.path);
      }
    }

    if (!(response.status === 401 && isMockAuthSession()) && !suppressErrorAlert) {
      showErrorAlert(String(data.message || "Request failed"));
    }

    return {
      success: false as const,
      status: response.status,
      message: String(data.message || "Request failed"),
      data,
    };
  } catch (error: unknown) {
    if (!skipLoader) hideLoader();

    const err = error as { name?: string; message?: string };
    if (err?.name === "AbortError") {
      return { success: false as const, aborted: true as const, error: "aborted" };
    }

    const errorMessage =
      err?.message === "Failed to fetch"
        ? "Chat service unreachable. Please check network or Chat Service URL."
        : err?.message || "Network error";

    if (!suppressErrorAlert) {
      showErrorAlert(errorMessage);
    }

    return { success: false as const, error: errorMessage };
  }
};
