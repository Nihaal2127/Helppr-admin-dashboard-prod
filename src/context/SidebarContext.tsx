import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/** Matches Bootstrap `lg` and mobile sidebar rules in App.scss */
export const SIDEBAR_MOBILE_BREAKPOINT = 992;

export type SidebarContextValue = {
  isOpen: boolean;
  isMobileLayout: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

type SidebarProviderProps = {
  isMobileLayout: boolean;
  children: React.ReactNode;
};

export const SidebarProvider: React.FC<SidebarProviderProps> = ({
  isMobileLayout,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isMobileLayout) setIsOpen(false);
  }, [isMobileLayout]);

  const openSidebar = useCallback(() => {
    if (isMobileLayout) setIsOpen(true);
  }, [isMobileLayout]);

  const closeSidebar = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (!isMobileLayout) return;
    setIsOpen((prev) => !prev);
  }, [isMobileLayout]);

  const value = useMemo(
    () => ({
      isOpen,
      isMobileLayout,
      openSidebar,
      closeSidebar,
      toggleSidebar,
    }),
    [isOpen, isMobileLayout, openSidebar, closeSidebar, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
};

/** Returns null outside protected layout (auth pages). */
export const useSidebar = (): SidebarContextValue | null =>
  useContext(SidebarContext);

/** Closes the drawer on route change and locks body scroll while open. */
export const SidebarEffects: React.FC<{ pathname: string }> = ({
  pathname,
}) => {
  const sidebar = useSidebar();
  const closeSidebar = sidebar?.closeSidebar;
  const isOpen = sidebar?.isOpen ?? false;
  const isMobileLayout = sidebar?.isMobileLayout ?? false;

  useEffect(() => {
    closeSidebar?.();
  }, [pathname, closeSidebar]);

  useEffect(() => {
    if (!isOpen || !isMobileLayout) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar?.();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, isMobileLayout, closeSidebar]);

  return null;
};
