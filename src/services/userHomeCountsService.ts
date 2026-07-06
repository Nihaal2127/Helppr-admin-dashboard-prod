import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { UserHomeCountsModel } from "../lib/models/UserHomeCountsModel";

export const fetchUserHomeCountsById = async (): Promise<{
  response: boolean;
  userHomeCounts: UserHomeCountsModel | null;
}> => {
  const response = await apiRequest(
    `${ApiPaths.GET_USER_HOME_COUNTS_BY_ID()}`,
    "GET"
  );
  if (response.success) {
    return {
      response: true,
      userHomeCounts: response.data.record,
    };
  } else {
    return {
      response: false,
      userHomeCounts: null,
    };
  }
};

export const createOrUpdateUserHomeCounts = async (
  payload: any,
  isEditable: boolean,
  id?: string
): Promise<boolean> => {
  const path = isEditable
    ? ApiPaths.UPDATE_USER_HOME_COUNTS(id!)
    : ApiPaths.CREATE_USER_HOME_COUNTS;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, payload);
  if (response.success) {
    return true;
  }
  return false;
};
