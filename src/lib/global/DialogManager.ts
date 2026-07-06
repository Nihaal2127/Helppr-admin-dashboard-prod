import ReactDOM from "react-dom";

const openModals: Set<HTMLElement> = new Set();

export const closeAllModals = () => {
  openModals.forEach((modalContainer) => {
    ReactDOM.unmountComponentAtNode(modalContainer);
    if (modalContainer.parentNode) {
      modalContainer.parentNode.removeChild(modalContainer);
    }
  });
  openModals.clear();
};

export const openDialog = (
  modalId: string,
  render: (close: () => void) => React.ReactElement
) => {
  const existingModal = document.getElementById(modalId);
  if (existingModal) return;

  const modalContainer = document.createElement("div");
  modalContainer.id = modalId;
  document.body.appendChild(modalContainer);

  openModals.add(modalContainer);

  const closeModal = () => {
    ReactDOM.unmountComponentAtNode(modalContainer);
    openModals.delete(modalContainer);

    if (modalContainer.parentNode) {
      modalContainer.parentNode.removeChild(modalContainer);
    }
  };

  ReactDOM.render(render(closeModal), modalContainer);
};
