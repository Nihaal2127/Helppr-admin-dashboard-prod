import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter } from "react-router-dom";

import App from "./App";

/**
 * react-select (and similar UIs) inside modals can trigger Chrome's
 * "ResizeObserver loop completed with undelivered notifications" when layout
 * updates run in the same frame as observation. Deferring the callback breaks
 * the synchronous loop without hiding real errors.
 */
if (typeof window !== "undefined" && window.ResizeObserver) {
  const OriginalResizeObserver = window.ResizeObserver;
  window.ResizeObserver = class extends OriginalResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        window.requestAnimationFrame(() => {
          callback(entries, observer);
        });
      });
    }
  };
}

ReactDOM.render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <App />
    </BrowserRouter>
  </React.StrictMode>,
  document.getElementById("root")
);

// Register Firebase Messaging service worker early so it is active before FCM token requests.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/firebase-messaging-sw.js")
      .catch((error) => {
        console.log("Firebase messaging service worker registration failed:", error);
      });
  });
}
