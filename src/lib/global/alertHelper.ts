import { toast, ToastOptions, ToastPosition } from "react-toastify";

const showAlert = (
  type: "success" | "info" | "warning" | "error",
  message: string
) => {
  const toastOptions: ToastOptions = {
    position: "top-right" as ToastPosition,
    autoClose: 2000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
  };

  switch (type) {
    case "success":
      toast.success(message, toastOptions);
      break;
    case "info":
      toast.info(message, toastOptions);
      break;
    case "warning":
      toast.warning(message, toastOptions);
      break;
    case "error":
      toast.error(message, toastOptions);
      break;
    default:
      toast(message, toastOptions);
  }
};

export const showSuccessAlert = (message: string) =>
  showAlert("success", message);
export const showInfoAlert = (message: string) => showAlert("info", message);
export const showWarningAlert = (message: string) =>
  showAlert("warning", message);
export const showErrorAlert = (message: string) => showAlert("error", message);
