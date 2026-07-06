import { getLocalStorage } from "./localStorageHelper";
import { AppConstant } from "./AppConstant";

/** True when the stored token is a legacy mock-auth token (no longer produced by login). */
export function isMockAuthSession(): boolean {
  const token = getLocalStorage(AppConstant.authToken);
  return typeof token === "string" && token.startsWith("mock-");
}
