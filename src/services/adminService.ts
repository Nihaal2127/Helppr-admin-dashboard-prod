import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { UserModel } from "../lib/models/UserModel";
import { showLog } from "../helper/utility";
import { WEB_MANAGEMENT_USER_TYPE } from "./userService";

const LOGIN_TYPE_ATTEMPTS = [
  WEB_MANAGEMENT_USER_TYPE.SUPER_ADMIN,
  WEB_MANAGEMENT_USER_TYPE.FRANCHISE_ADMIN,
  WEB_MANAGEMENT_USER_TYPE.FRANCHISE_EMPLOYEE,
  WEB_MANAGEMENT_USER_TYPE.STAFF,
] as const;

export const login = async (payload: {
  email: string;
  password: string;
  device_token?: string | null;
}): Promise<{ admin: UserModel | null; response: boolean }> => {
  try {
    const base: Record<string, unknown> = {
      email: payload.email,
      password: payload.password,
    };
    const rawToken = payload.device_token;
    if (rawToken != null && String(rawToken).trim() !== "") {
      base.device_token = rawToken;
    }

    const types = [...LOGIN_TYPE_ATTEMPTS];
    for (let i = 0; i < types.length; i++) {
      const suppressErrorAlert = i < types.length - 1;
      const response = await apiRequest(
        ApiPaths.LOGIN(),
        "POST",
        { ...base, type: types[i] },
        false,
        false,
        suppressErrorAlert
      );
      if (response.success) {
        return {
          admin: response.data.record,
          response: true,
        };
      }
    }

    showLog("Login failed after trying dashboard user types");
    return {
      admin: null,
      response: false,
    };
  } catch (error) {
    showLog("Error during admin login:", error);
    return {
      admin: null,
      response: false,
    };
  }
};

export const forgotPassword = async (payload: any): Promise<boolean> => {
  try {
    const response = await apiRequest(
      ApiPaths.FORGOT_PASSWORD(),
      "POST",
      payload
    );
    if (response.success) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    showLog("Error during forgot password:", error);
    return false;
  }
};

export const logout = async (): Promise<Boolean> => {
  try {
    const response = await apiRequest(ApiPaths.LOGOUT(), "POST");
    if (response.success) {
      return true;
    } else {
      showLog("Admin logout failed:", response.message || "Unknown error");
      return false;
    }
  } catch (error) {
    showLog("Error during user logout:", error);
    return false;
  }
};

export const fetchById = async (id: string): Promise<UserModel | null> => {
  try {
    const response = await apiRequest(
      `${ApiPaths.GET_USER_BY_ID()}/${id}`,
      "GET"
    );
    if (response.success) {
      return response.data.record;
    } else {
      showLog("Failed to fetch user:", response.message || "Unknown error");
      return null;
    }
  } catch (error) {
    showLog("Error during user login:", error);
    return null;
  }
};

export const createOrUpdateUser = async (
  payload: any,
  isEditable: boolean,
  id?: string
): Promise<boolean> => {
  const path = isEditable ? ApiPaths.UPDATE_USER(id!) : ApiPaths.CREATE_USER;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, payload);
  if (response.success) {
    return true;
  }
  return false;
};

export const changePassword = async (payload: any): Promise<boolean> => {
  const response = await apiRequest(ApiPaths.CHANGE_PASSWORD, "POST", payload);
  if (response.success) {
    return true;
  }
  return false;
};
