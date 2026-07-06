import { AppConstant } from "./AppConstant";
import { disconnectChatSocket } from "../chat/chatSocket";

export const getLocalStorage = (key: string) => {
  return localStorage.getItem(key);
};

export const setLocalStorage = (key: string, value: any) => {
  localStorage.setItem(key, value);
};

export const removeItemLocalStorage = (key: string) => {
  localStorage.removeItem(key);
};

export const clearLocalStorage = () => {
  disconnectChatSocket();
  localStorage.clear();
  sessionStorage.clear();
};

export const getCreatedById = () => {
  return getLocalStorage(AppConstant.createdById) as string;
};
