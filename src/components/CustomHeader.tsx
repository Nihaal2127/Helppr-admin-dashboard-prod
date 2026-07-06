import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Row, Col } from "react-bootstrap";
import { useSidebar } from "../context/SidebarContext";
import CustomFormSelect from "../components/CustomFormSelect";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../routes/Routes";
import {
  fetchRecentNotifications,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../services/notificationService";
import { formatDate } from "../helper/utility";
import { getLocalStorage } from "../lib/global/localStorageHelper";
import {
  HEADER_FRANCHISE_CHANGED_EVENT,
  readHeaderFranchisePreference,
  writeHeaderFranchisePreference,
} from "../lib/franchise/headerFranchisePreference";
import { AppConstant, UserRole } from "../lib/global/AppConstant";
import {
  fetchFranchiseById,
  fetchFranchiseDropDown,
} from "../services/franchiseService";

interface CustomHeaderProps {
  title: string;
  /** Shown to the left of the title (e.g. financial sub-page back arrow). */
  titlePrefix?: React.ReactNode;
  /** Intentionally `any` — RHF generics cause TS2589; strict `setValue` types break narrow form fields. */
  register?: any;
  setValue?: any;
  onLocationChange?: (selectedLocation: string) => void;
  rightActions?: React.ReactNode;
  /** Hide top-right franchise selector for pages that should not expose it. */
  hideFranchiseDropdown?: boolean;
}

const CustomHeader = ({
  title,
  titlePrefix,
  register,
  setValue,
  onLocationChange,
  rightActions,
  hideFranchiseDropdown = false,
}: CustomHeaderProps) => {
  const navigate = useNavigate();
  const sidebar = useSidebar();
  const isMobileTopBar = sidebar?.isMobileLayout ?? false;
  const currentUserRole = getLocalStorage(AppConstant.userRole);
  const isAdminUser = currentUserRole === UserRole.ADMIN;
  const isStaffUser = currentUserRole === UserRole.STAFF;
  const isFranchiseAdminOrEmployee =
    currentUserRole === UserRole.FRANCHISE_ADMIN ||
    currentUserRole === UserRole.EMPLOYEE;
  const [franchiseTitleName, setFranchiseTitleName] = useState("");
  const shouldShowFranchiseDropdown =
    (isAdminUser || isStaffUser) &&
    Boolean(register) &&
    Boolean(setValue) &&
    !hideFranchiseDropdown;
  const [selectedFranchise, setSelectedFranchise] = useState<string>(() =>
    readHeaderFranchisePreference()
  );
  const appliedFranchiseRef = useRef(readHeaderFranchisePreference());
  const [franchiseList, setFranchiseList] = useState<
    { value: string; label: string }[]
  >([{ value: "all", label: "All Franchises" }]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const [mobileTopBarSlot, setMobileTopBarSlot] = useState<HTMLElement | null>(
    null
  );

  const handleChange = (e: any) => {
    const raw = e.target.value as string;
    const value =
      !raw || String(raw).trim() === "" ? "all" : String(raw).trim();
    appliedFranchiseRef.current = value;
    setSelectedFranchise(value);
    setValue?.("franchise_id", value, {
      shouldValidate: false,
      shouldDirty: true,
    });
    writeHeaderFranchisePreference(value);
    onLocationChange?.(value);
  };

  const refreshNotifications = () => {
    setUnreadCount(getUnreadNotificationCount());
    setRecentNotifications(fetchRecentNotifications(6));
  };

  useEffect(() => {
    refreshNotifications();
    const onUpdated = () => refreshNotifications();
    const onStorage = () => refreshNotifications();
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!notificationRef.current?.contains(target)) {
        setIsNotificationOpen(false);
      }
    };

    window.addEventListener("notifications-updated", onUpdated);
    window.addEventListener("storage", onStorage);
    document.addEventListener("mousedown", onClickOutside);

    return () => {
      window.removeEventListener("notifications-updated", onUpdated);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!shouldShowFranchiseDropdown) return;
    (async () => {
      const options = await fetchFranchiseDropDown();
      if (cancelled) return;
      setFranchiseList([{ value: "all", label: "All Franchises" }, ...options]);
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldShowFranchiseDropdown]);

  /** When preference changes elsewhere (another tab, page “clear filters”), align UI + notify parent once. */
  useEffect(() => {
    if (!shouldShowFranchiseDropdown || !setValue) return;
    const syncFromStorage = () => {
      const v = readHeaderFranchisePreference();
      if (v === appliedFranchiseRef.current) return;
      appliedFranchiseRef.current = v;
      setSelectedFranchise(v);
      setValue("franchise_id", v, { shouldValidate: false });
      onLocationChange?.(v);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === AppConstant.headerFranchiseFilter || e.key === null) {
        syncFromStorage();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(
      HEADER_FRANCHISE_CHANGED_EVENT,
      syncFromStorage as EventListener
    );
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        HEADER_FRANCHISE_CHANGED_EVENT,
        syncFromStorage as EventListener
      );
    };
  }, [shouldShowFranchiseDropdown, setValue, onLocationChange]);

  useEffect(() => {
    let cancelled = false;
    if (!isFranchiseAdminOrEmployee) {
      setFranchiseTitleName("");
      return;
    }
    const fid = String(getLocalStorage(AppConstant.partnerId) ?? "").trim();
    if (!fid) {
      setFranchiseTitleName("");
      return;
    }
    void (async () => {
      const row = await fetchFranchiseById(fid, {
        skipAdminContactEnrichment: true,
      });
      if (cancelled) return;
      const name = String(row?.name ?? "").trim();
      setFranchiseTitleName(name);
    })();
    return () => {
      cancelled = true;
    };
  }, [isFranchiseAdminOrEmployee]);

  useEffect(() => {
    if (!isMobileTopBar) {
      setMobileTopBarSlot(null);
      return;
    }
    setMobileTopBarSlot(
      document.getElementById("app-mobile-top-bar-actions")
    );
  }, [isMobileTopBar]);

  const headerToolbar = (
    <>
      {rightActions}
      {shouldShowFranchiseDropdown && register && setValue && (
        <div className="custom-page-header__franchise">
          <CustomFormSelect
            label=""
            controlId="Franchise"
            options={franchiseList}
            register={register}
            fieldName="franchise_id"
            defaultValue={selectedFranchise}
            setValue={setValue}
            onChange={handleChange}
            clearResetsTo="all"
            asCol={false}
            noBottomMargin
          />
        </div>
      )}
      <div ref={notificationRef} className="position-relative">
        <button
          type="button"
          className="btn p-0 border-0 bg-transparent position-relative"
          aria-label="Notifications"
          onClick={() => setIsNotificationOpen((prev) => !prev)}
        >
          <i className="bi bi-bell-fill fs-4" style={{ color: "#dc3545" }} />
          {unreadCount > 0 && (
            <span className="custom-notification-badge">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {isNotificationOpen && (
          <div className="custom-notification-dropdown">
            <div className="custom-notification-header">
              <span>Notifications</span>
              <button
                type="button"
                className="btn btn-link p-0"
                onClick={() => {
                  markAllNotificationsAsRead();
                  refreshNotifications();
                }}
              >
                Mark all read
              </button>
            </div>

            <div className="custom-notification-list">
              {recentNotifications.length === 0 ? (
                <div className="custom-notification-empty">
                  No notifications
                </div>
              ) : (
                recentNotifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`custom-notification-item ${
                      item.status === "unread" ? "is-unread" : ""
                    }`}
                    onClick={() => {
                      markNotificationAsRead(item.id);
                      refreshNotifications();
                      setIsNotificationOpen(false);
                      navigate(ROUTES.NOTIFICATIONS.path);
                    }}
                  >
                    <div className="custom-notification-item-title-row">
                      <span className="custom-notification-item-title">
                        {item.title}
                      </span>
                      {item.status === "unread" && (
                        <span className="custom-notification-dot" />
                      )}
                    </div>
                    <div className="custom-notification-item-message">
                      {item.message}
                    </div>
                    <div className="custom-notification-item-time">
                      {formatDate(item.createdAt)}
                    </div>
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              className="custom-notification-view-all"
              onClick={() => {
                setIsNotificationOpen(false);
                navigate(ROUTES.NOTIFICATIONS.path);
              }}
            >
              View all notifications
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {isMobileTopBar &&
        mobileTopBarSlot &&
        createPortal(
          <div className="custom-page-header__toolbar">{headerToolbar}</div>,
          mobileTopBarSlot
        )}

      <Row className="g-0 p-0 mb-4 align-items-center custom-page-header">
        <Col
          sm={6}
          className="p-0 m-0 custom-page-header__title"
        >
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {titlePrefix}
            <h4 className="m-0 p-0 d-flex align-items-center flex-wrap gap-2">
              <span>{title}</span>
              {franchiseTitleName ? (
                <span
                  className="fw-normal"
                  style={{
                    fontSize: "1rem",
                    color: "var(--primary-new-txt-color)",
                  }}
                >
                  - {franchiseTitleName}
                </span>
              ) : null}
            </h4>
          </div>
        </Col>
        <Col
          sm={6}
          className="d-none d-lg-flex justify-content-end align-items-center gap-3 p-0 m-0 custom-page-header__actions"
        >
          {headerToolbar}
        </Col>
      </Row>
    </>
  );
};

export default CustomHeader;
