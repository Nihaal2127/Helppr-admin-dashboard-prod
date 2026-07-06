import React from "react";
import { useSidebar } from "../context/SidebarContext";

type SidebarMenuButtonProps = {
  className?: string;
};

/** Mobile/tablet hamburger — no-op on desktop (≥992px). */
const SidebarMenuButton: React.FC<SidebarMenuButtonProps> = ({
  className = "",
}) => {
  const sidebar = useSidebar();

  if (!sidebar?.isMobileLayout) return null;

  return (
    <button
      type="button"
      className={`sidebar-mobile-toggle ${className}`.trim()}
      aria-label="Open menu"
      aria-expanded={sidebar.isOpen}
      onClick={sidebar.openSidebar}
    >
      <i className="bi bi-list" aria-hidden />
    </button>
  );
};

export default SidebarMenuButton;
