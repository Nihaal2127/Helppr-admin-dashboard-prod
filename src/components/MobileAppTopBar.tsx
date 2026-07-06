import React from "react";
import { useSidebar } from "../context/SidebarContext";
import SidebarMenuButton from "./SidebarMenuButton";

/** Fixed white toolbar on mobile/tablet; actions slot filled via portal from CustomHeader. */
const MobileAppTopBar: React.FC = () => {
  const sidebar = useSidebar();

  if (!sidebar?.isMobileLayout) return null;

  return (
    <header className="app-mobile-top-bar" aria-label="App toolbar">
      <div className="app-mobile-top-bar__inner">
        {!sidebar.isOpen && (
          <SidebarMenuButton className="app-mobile-top-bar__menu" />
        )}
        <div
          id="app-mobile-top-bar-actions"
          className="app-mobile-top-bar__actions"
        />
      </div>
    </header>
  );
};

export default MobileAppTopBar;
