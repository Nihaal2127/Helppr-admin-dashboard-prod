import { apiRequestBlob } from "../lib/global/remote/apiHelper";

export const exportData = async (path: string, payload?: any) => {
  const response = await apiRequestBlob(path, payload);
  if (response.success) {
    return true;
  }
  return false;
};
