import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { TaxOtherChargesModel } from "../lib/models/TaxOtherChargesModel";

export const fetchTaxOtherChargesById = async (): Promise<{
  response: boolean;
  taxOtherCharges: TaxOtherChargesModel | null;
}> => {
  const response = await apiRequest(
    `${ApiPaths.GET_TAX_OTHER_CHARGES_BY_ID()}`,
    "GET"
  );
  if (response.success) {
    return {
      response: true,
      taxOtherCharges: response.data.record,
    };
  } else {
    return {
      response: false,
      taxOtherCharges: null,
    };
  }
};

export const createOrUpdateTaxOtherCharges = async (
  payload: any,
  isEditable: boolean,
  id?: string
): Promise<boolean> => {
  const path = isEditable
    ? ApiPaths.UPDATE_TAX_OTHER_CHARGES(id!)
    : ApiPaths.CREATE_TAX_OTHER_CHARGES;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, payload);
  if (response.success) {
    return true;
  }
  return false;
};
