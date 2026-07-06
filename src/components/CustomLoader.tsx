import React from "react";
import "../assets/scss/loader.scss";

export const showLoader = () => {
  const loaderDiv = document.createElement("div");
  loaderDiv.setAttribute("id", "global-loader");
  loaderDiv.innerHTML = `
    <div class="loader-overlay">
      <div class="spinner"></div>
    </div>
  `;
  document.body.appendChild(loaderDiv);
};

export const hideLoader = () => {
  const loaderDiv = document.getElementById("global-loader");
  if (loaderDiv) {
    document.body.removeChild(loaderDiv);
  }
};

const CustomLoader: React.FC = () => {
  return (
    <div className="loader-overlay">
      <div className="spinner"></div>
    </div>
  );
};

export default CustomLoader;
