import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";

export const createOrUpdateBankAccount = async (
  payload: any,
  isEditable: boolean,
  id?: string
): Promise<boolean> => {
  const path = isEditable
    ? ApiPaths.UPDATE_BANK_ACCOUNT(id!)
    : ApiPaths.CREATE_BANK_ACCOUNT;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, payload);
  if (response.success) {
    return true;
  }
  return false;
};
