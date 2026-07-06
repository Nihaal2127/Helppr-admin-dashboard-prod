import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { showLog } from "../helper/utility";

export const updatePartnerDocument = async (
  payload: any,
  id: string
): Promise<{ fileList: String[]; response: boolean }> => {
  const response = await apiRequest(
    ApiPaths.UPDATE_PARTNER_DOCUMENT(id),
    "PUT",
    payload
  );
  if (response.success) {
    return {
      fileList: response.data.records,
      response: true,
    };
  } else {
    showLog("Document fail:", response.message || "Unknown error");
    return {
      fileList: [],
      response: false,
    };
  }
};

export const deletePartnerDocument = async (id: string): Promise<boolean> => {
  const response = await apiRequest(
    ApiPaths.DELETE_PARTNER_DOCUMENT(id),
    "DELETE"
  );
  if (response.success) {
    return true;
  } else {
    showLog(response.message || "Failed to delete partner document");
    return false;
  }
};

export const updateStatusDocument = async (
  payload: any,
  id: string
): Promise<boolean> => {
  const response = await apiRequest(
    ApiPaths.UPDATE_STATUS_PARTNER_DOCUMENT(id),
    "PUT",
    payload
  );
  if (response.success) {
    return true;
  } else {
    showLog(response.message || "Failed to update status partner document");
    return false;
  }
};
