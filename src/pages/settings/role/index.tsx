import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Form, Modal, Row, Col } from "react-bootstrap";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import CustomImageUploader from "../../../components/CustomImageUploader";
import CustomHeader from "../../../components/CustomHeader";
import SettingsNav from "../../../components/SettingsNav";
import CustomTable from "../../../components/CustomTable";
import CustomUtilityBox from "../../../components/CustomUtilityBox";
import CustomActionColumn from "../../../components/CustomActionColumn";
import CustomSummaryBox from "../../../components/CustomSummaryBox";
import { CustomFormInput } from "../../../components/CustomFormInput";
import { CustomFormIndiaMobile } from "../../../components/CustomFormIndiaMobile";
import CustomFormSelect from "../../../components/CustomFormSelect";
import { DetailsRow, FullDetailsRow, formatDate } from "../../../helper/utility";
import { dateToLocalYmd } from "../../../helper/dateFormat";
import CustomDatePicker from "../../../components/CustomDatePicker";
import { readHeaderFranchisePreference } from "../../../lib/franchise/headerFranchisePreference";
import {
  RoleSettingsModel,
  StaffSettingsModel,
} from "../../../lib/models/SettingsModel";
import {
  ensureSettingsSeedData,
  createRoleUserWithApi,
  createStaffUserWithApi,
  updateRoleUserWithApi,
  updateStaffUserWithApi,
  fetchSettingsSectionPageByType,
  voidRole,
} from "../../../services/settingsService";
import CustomCloseButton from "../../../components/CustomCloseButton";
import ScreenPermissionChecklist from "../../../components/ScreenPermissionChecklist";
import GenderRadioField from "../../../components/GenderRadioField";
import {
  formatGenderLabel,
  normalizeGenderValue,
} from "../../../lib/user/genderOptions";
import { openConfirmDialog } from "../../../components/CustomConfirmDialog";
import { showErrorAlert } from "../../../lib/global/alertHelper";
import { mainMenuItems } from "../../../lib/layout/menuItems";
import {
  getFranchiseEmployeeScreenMenuItems,
  labelForFranchiseEmployeeScreenKey,
} from "../../../lib/layout/franchiseEmployeeScreenPermissions";
import {
  screenPermissionKeysFromItems,
  screenPermissionsForPayload,
} from "../../../lib/layout/screenPermissionSelection";
import { AppConstant, UserRole } from "../../../lib/global/AppConstant";
import { getLocalStorage } from "../../../lib/global/localStorageHelper";
import profilePlaceholder from "../../../assets/icons/profile.svg";
import {
  WEB_MANAGEMENT_USER_TYPE,
  createOrUpdateUser,
} from "../../../services/userService";
import {
  fetchFranchiseDropDown,
  FranchiseDropDownOption,
} from "../../../services/franchiseService";
import type { ServerTableSortBy } from "../../../lib/global/serverTableSort";
import {
  isValidUserEmail,
  isValidE164StylePhone,
  nationalDigitsWithoutIndia91,
  sanitizeIndiaNationalPhoneInput,
  fullPhoneFromIndiaNational,
  validateStrongPassword,
  passwordsMatch,
} from "../../../lib/user/userFormValidation";

type GenderField = "male" | "female" | "others";

function dobToYmd(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    const s = value.trim();
    return s.length >= 10 ? s.slice(0, 10) : s;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return dateToLocalYmd(value);
  }
  return "";
}

const emptyRoleForm = {
  roleName: "",
  email: "",
  phone_number: "",
  gender: "male" as GenderField,
  date_of_birth: "",
  profile_url: "",
  roleType: "franchise_admin" as "franchise_admin" | "employee",
  assignedFranchise: "",
  status: "active" as "active" | "inactive",
  screenPermissions: [] as string[],
  password: "",
  confirmPassword: "",
};

const employeeScreenPermissionMenuItems = getFranchiseEmployeeScreenMenuItems();
const employeeScreenPermissionKeys = screenPermissionKeysFromItems(
  employeeScreenPermissionMenuItems
);
const staffScreenPermissionMenuItems = mainMenuItems.filter(
  ({ key }) => key !== "my-franchise"
);
const staffScreenPermissionKeys = screenPermissionKeysFromItems(
  staffScreenPermissionMenuItems
);

const emptyStaffForm = {
  name: "",
  email: "",
  phone_number: "",
  gender: "male" as GenderField,
  date_of_birth: "",
  profile_url: "",
  status: "active" as "active" | "inactive",
  screenPermissions: [] as string[],
  allFranchises: true,
  franchisePermissions: [] as string[],
  password: "",
  confirmPassword: "",
};

const emptyStaffRhf = {
  staff_name: "",
  staff_date_of_birth: "",
  staff_email: "",
  staff_phone: "",
  staff_password: "",
  staff_confirm_password: "",
};

function staffRhfFromForm(form: typeof emptyStaffForm) {
  return {
    staff_name: form.name,
    staff_date_of_birth: form.date_of_birth,
    staff_email: form.email,
    staff_phone: form.phone_number,
    staff_password: form.password,
    staff_confirm_password: form.confirmPassword,
  };
}

/** Profile image for franchise/staff role view: backend path or absolute URL; mock `uploads/…` uses placeholder. */
function franchiseRoleProfileImageSrc(profileUrl?: string): string {
  const u = (profileUrl ?? "").trim();
  if (!u) return profilePlaceholder;
  if (
    u.startsWith("http://") ||
    u.startsWith("https://") ||
    u.startsWith("data:")
  )
    return u;
  if (u.startsWith("uploads/")) return profilePlaceholder;
  return `${AppConstant.IMAGE_BASE_URL}${u}?t=${Date.now()}`;
}

const staffFranchiseSummary = (s: StaffSettingsModel) =>
  s.allFranchises
    ? "All franchises"
    : s.franchisePermissions.length
    ? s.franchisePermissions.join(", ")
    : "-";

type SummaryCounts = {
  total: number;
  active: number;
  inactive: number;
};

const EMPTY_SUMMARY_COUNTS: SummaryCounts = {
  total: 0,
  active: 0,
  inactive: 0,
};

const compareNullableText = (a?: string, b?: string) =>
  (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
const isMongoObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value.trim());

function applyRoleSortFallback(
  rows: RoleSettingsModel[],
  sortBy: ServerTableSortBy
): RoleSettingsModel[] {
  const primarySort = sortBy[0];
  if (!primarySort) return rows;
  if (primarySort.id !== "roleName" && primarySort.id !== "email") return rows;
  const dir = primarySort.desc ? -1 : 1;
  const sorted = [...rows].sort((left, right) => {
    const base =
      primarySort.id === "roleName"
        ? compareNullableText(left.roleName, right.roleName)
        : compareNullableText(left.email, right.email);
    return base * dir;
  });
  return sorted;
}

function applyStaffSortFallback(
  rows: StaffSettingsModel[],
  sortBy: ServerTableSortBy
): StaffSettingsModel[] {
  const primarySort = sortBy[0];
  if (!primarySort) return rows;
  if (primarySort.id !== "name" && primarySort.id !== "email") return rows;
  const dir = primarySort.desc ? -1 : 1;
  const sorted = [...rows].sort((left, right) => {
    const base =
      primarySort.id === "name"
        ? compareNullableText(left.name, right.name)
        : compareNullableText(left.email, right.email);
    return base * dir;
  });
  return sorted;
}

const RoleManagement = () => {
  const SETTINGS_ROLE_PAGE_SIZE = 10;
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { register, setValue, reset } = useForm<any>();
  const isFranchiseAdminSession =
    getLocalStorage(AppConstant.userRole) === UserRole.FRANCHISE_ADMIN;
  const isSuperAdminSession =
    getLocalStorage(AppConstant.userRole) === UserRole.ADMIN;
  const [items, setItems] = useState<RoleSettingsModel[]>([]);
  const [keyword, setKeyword] = useState("");
  const [roleType, setRoleType] = useState<
    "all" | "franchise_admin" | "employee"
  >(() => (isFranchiseAdminSession ? "employee" : "franchise_admin"));
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [franchiseFilter, setFranchiseFilter] = useState(() =>
    readHeaderFranchisePreference()
  );
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RoleSettingsModel | null>(null);
  const [form, setForm] = useState(emptyRoleForm);
  const [isViewMode, setIsViewMode] = useState(false);
  const [selectedBox, setSelectedBox] = useState(() =>
    isFranchiseAdminSession ? "box-employee" : "box-franchise-admin"
  );

  const [staffItems, setStaffItems] = useState<StaffSettingsModel[]>([]);
  const [staffKeyword, setStaffKeyword] = useState("");
  const [staffStatus, setStaffStatus] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [staffUtilityKey, setStaffUtilityKey] = useState(0);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffEditing, setStaffEditing] = useState<StaffSettingsModel | null>(
    null
  );
  const [staffForm, setStaffForm] = useState(emptyStaffForm);
  const [staffIsViewMode, setStaffIsViewMode] = useState(false);
  const [roleSavePending, setRoleSavePending] = useState(false);
  const [staffSavePending, setStaffSavePending] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [roleCurrentPage, setRoleCurrentPage] = useState(1);
  const [roleTotalPages, setRoleTotalPages] = useState(1);
  const [staffCurrentPage, setStaffCurrentPage] = useState(1);
  const [staffTotalPages, setStaffTotalPages] = useState(1);
  const [roleSortBy, setRoleSortBy] = useState<ServerTableSortBy>([]);
  const [staffSortBy, setStaffSortBy] = useState<ServerTableSortBy>([]);
  const [franchiseDropdownOptions, setFranchiseDropdownOptions] = useState<
    FranchiseDropDownOption[]
  >([]);
  /** Assigned Franchise in Add/Edit Franchise Admin — `GET …/getDropDown` (assigned scope). Loaded only when that modal is open. */
  const [franchiseAssignedAdminDropdownOptions, setFranchiseAssignedAdminDropdownOptions] =
    useState<FranchiseDropDownOption[]>([]);
  const [roleImageFile, setRoleImageFile] = useState<File | null>(null);
  const [staffImageFile, setStaffImageFile] = useState<File | null>(null);
  const [staffAddFormKey, setStaffAddFormKey] = useState(0);
  const [franchiseAdminSummaryCounts, setFranchiseAdminSummaryCounts] =
    useState<SummaryCounts>(EMPTY_SUMMARY_COUNTS);
  const [employeeSummaryCounts, setEmployeeSummaryCounts] =
    useState<SummaryCounts>(EMPTY_SUMMARY_COUNTS);
  const [staffSummaryCounts, setStaffSummaryCounts] =
    useState<SummaryCounts>(EMPTY_SUMMARY_COUNTS);

  /** Latest id→name map for resolving `franchise_id` before `franchiseNameById` hook runs later in the file. */
  const franchiseNameByIdRef = useRef<Map<string, string>>(new Map());

  const openFormWithData = useCallback(
    (item?: RoleSettingsModel, viewMode = false) => {
      const emptyRhf = {
        role_name: "",
        role_email: "",
        role_phone: "",
        role_password: "",
        role_confirm_password: "",
        assigned_franchise: "",
      };
      if (!item) {
        setEditing(null);
        setForm(emptyRoleForm);
        reset(emptyRhf);
        setRoleImageFile(null);
        setIsViewMode(false);
        setShowForm(true);
        return;
      }
      setEditing(item);
      setIsViewMode(viewMode);
      const rawPerms = item.screenPermissions?.length
        ? [...item.screenPermissions]
        : [];
      const fid = String(item.franchise_id ?? "").trim();
      const nameFromId = fid ? franchiseNameByIdRef.current.get(fid) : "";
      const nextForm = {
        roleName: item.roleName,
        email: item.email ?? "",
        phone_number: nationalDigitsWithoutIndia91(
          String(item.phone_number ?? "")
        ),
        gender: normalizeGenderValue(item.gender) || "male",
        date_of_birth: dobToYmd(item.date_of_birth),
        profile_url: item.profile_url ?? "",
        roleType: item.roleType,
        assignedFranchise:
          (item.assignedFranchise ?? "").trim() || nameFromId || "",
        status: item.status,
        screenPermissions: rawPerms,
        password: "",
        confirmPassword: "",
      };
      setForm(nextForm);
      reset({
        role_name: nextForm.roleName,
        role_email: nextForm.email,
        role_phone: nextForm.phone_number,
        role_password: "",
        role_confirm_password: "",
        assigned_franchise: nextForm.assignedFranchise,
      });
      setShowForm(true);
      setRoleImageFile(null);
    },
    [reset]
  );

  const openStaffWithData = useCallback(
    (item?: StaffSettingsModel, viewMode = false) => {
      if (!item) {
        setStaffEditing(null);
        setStaffForm({ ...emptyStaffForm });
        setStaffImageFile(null);
        setStaffIsViewMode(false);
        reset(emptyStaffRhf);
        setStaffAddFormKey((k) => k + 1);
        setShowStaffModal(true);
        return;
      }
      setStaffEditing(item);
      setStaffIsViewMode(viewMode);
      const nextStaffForm = {
        name: item.name,
        email: item.email ?? "",
        phone_number: nationalDigitsWithoutIndia91(
          String(item.phone_number ?? "")
        ),
        gender: normalizeGenderValue(item.gender) || "male",
        date_of_birth: dobToYmd(item.date_of_birth),
        profile_url: item.profile_url ?? "",
        status: item.status,
        screenPermissions: item.screenPermissions?.length
          ? item.screenPermissions.filter((k) => k !== "my-franchise")
          : [],
        allFranchises: item.allFranchises,
        franchisePermissions: item.franchisePermissions?.length
          ? [...item.franchisePermissions]
          : [],
        password: "",
        confirmPassword: "",
      };
      setStaffForm(nextStaffForm);
      reset(staffRhfFromForm(nextStaffForm));
      setShowStaffModal(true);
      setStaffImageFile(null);
    },
    [reset],
  );

  useEffect(() => {
    if (!showForm || !editing) return;
    const rawPerms = editing.screenPermissions?.length
      ? [...editing.screenPermissions]
      : [];
    setForm({
      roleName: editing.roleName,
      email: editing.email ?? "",
      phone_number: nationalDigitsWithoutIndia91(
        String(editing.phone_number ?? "")
      ),
      gender: normalizeGenderValue(editing.gender) || "male",
      date_of_birth: dobToYmd(editing.date_of_birth),
      profile_url: editing.profile_url ?? "",
      roleType: editing.roleType,
      assignedFranchise:
        (editing.assignedFranchise ?? "").trim() ||
        (String(editing.franchise_id ?? "").trim()
          ? franchiseNameByIdRef.current.get(
              String(editing.franchise_id).trim()
            ) ?? ""
          : ""),
      status: editing.status,
      screenPermissions: rawPerms,
      password: "",
      confirmPassword: "",
    });
    setRoleImageFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when modal opens / role id changes; avoid resetting on unrelated `editing` churn
  }, [showForm, editing?.id]);

  useEffect(() => {
    if (!showStaffModal || !staffEditing) return;
    const nextStaffForm = {
      name: staffEditing.name,
      email: staffEditing.email ?? "",
      phone_number: nationalDigitsWithoutIndia91(
        String(staffEditing.phone_number ?? "")
      ),
      gender: normalizeGenderValue(staffEditing.gender) || "male",
      date_of_birth: dobToYmd(staffEditing.date_of_birth),
      profile_url: staffEditing.profile_url ?? "",
      status: staffEditing.status,
      screenPermissions: staffEditing.screenPermissions?.length
        ? staffEditing.screenPermissions.filter((k) => k !== "my-franchise")
        : [],
      allFranchises: staffEditing.allFranchises,
      franchisePermissions: staffEditing.franchisePermissions?.length
        ? [...staffEditing.franchisePermissions]
        : [],
      password: "",
      confirmPassword: "",
    };
    setStaffForm(nextStaffForm);
    reset(staffRhfFromForm(nextStaffForm));
    setStaffImageFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same pattern as role modal above
  }, [showStaffModal, staffEditing?.id, reset]);

  const [reloadToken, setReloadToken] = useState(0);

  const [passwordModal, setPasswordModal] = useState<{
    userId: string;
    userType: number;
    displayName: string;
  } | null>(null);
  const [passwordModalFields, setPasswordModalFields] = useState({
    newPassword: "",
    reenterPassword: "",
  });
  const [passwordModalPending, setPasswordModalPending] = useState(false);

  const closePasswordModal = useCallback(() => {
    setPasswordModal(null);
    setPasswordModalFields({ newPassword: "", reenterPassword: "" });
  }, []);

  const openRolePasswordModal = useCallback((row: RoleSettingsModel) => {
    const userType =
      row.roleType === "franchise_admin"
        ? WEB_MANAGEMENT_USER_TYPE.FRANCHISE_ADMIN
        : WEB_MANAGEMENT_USER_TYPE.FRANCHISE_EMPLOYEE;
    setPasswordModalFields({ newPassword: "", reenterPassword: "" });
    setPasswordModal({
      userId: row.id,
      userType,
      displayName: row.roleName,
    });
  }, []);

  const openStaffPasswordModal = useCallback((row: StaffSettingsModel) => {
    setPasswordModalFields({ newPassword: "", reenterPassword: "" });
    setPasswordModal({
      userId: row.id,
      userType: WEB_MANAGEMENT_USER_TYPE.STAFF,
      displayName: row.name,
    });
  }, []);

  const submitPasswordModal = useCallback(async () => {
    if (!passwordModal) return;
    const pw = passwordModalFields.newPassword.trim();
    const pwErr = validateStrongPassword(pw);
    if (pwErr) {
      showErrorAlert(pwErr);
      return;
    }
    if (!passwordsMatch(pw, passwordModalFields.reenterPassword)) {
      showErrorAlert("Password and re-enter password do not match.");
      return;
    }
    setPasswordModalPending(true);
    try {
      const ok = await createOrUpdateUser(
        {
          type: passwordModal.userType,
          password: pw,
          confirm_password: passwordModalFields.reenterPassword.trim(),
        },
        true,
        passwordModal.userId
      );
      if (ok) {
        closePasswordModal();
        setReloadToken((v) => v + 1);
      }
    } finally {
      setPasswordModalPending(false);
    }
  }, [passwordModal, passwordModalFields, closePasswordModal]);

  const openAddFranchiseAdminModal = useCallback(() => {
    setSelectedBox("box-franchise-admin");
    setRoleType("franchise_admin");
    setRoleCurrentPage(1);
    setEditing(null);
    setIsViewMode(false);
    setForm({ ...emptyRoleForm, roleType: "franchise_admin" });
    reset({
      role_name: "",
      role_email: "",
      role_phone: "",
      role_password: "",
      role_confirm_password: "",
      assigned_franchise: "",
    });
    setRoleImageFile(null);
    setShowForm(true);
  }, [reset]);

  useEffect(() => {
    const st = routerLocation.state as {
      openAddFranchiseAdmin?: boolean;
    } | null;
    if (!st?.openAddFranchiseAdmin) return;
    navigate(routerLocation.pathname, { replace: true, state: null });
    openAddFranchiseAdminModal();
  }, [routerLocation.state, routerLocation.pathname, navigate, openAddFranchiseAdminModal]);

  useEffect(() => {
    ensureSettingsSeedData();
  }, []);

  /** Full franchise list (`GET_FRANCHISE_DROP_DOWN` / full_list) — header filter + Employee Assigned Franchise. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fullList = await fetchFranchiseDropDown();
      if (!cancelled) setFranchiseDropdownOptions(fullList);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Assigned-admin dropdown (`GET_FRANCHISE_DROP_DOWN_ASSIGNED`) — only while Franchise Admin modal is open. */
  useEffect(() => {
    if (!showForm || form.roleType !== "franchise_admin") return;
    let cancelled = false;
    void (async () => {
      const rows = await fetchFranchiseDropDown({ assignedAdminDropdown: true });
      if (!cancelled) setFranchiseAssignedAdminDropdownOptions(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [showForm, form.roleType]);

  useEffect(() => {
    setInitialLoadDone(true);
  }, []);

  useEffect(() => {
    if (!initialLoadDone) return;
    let cancelled = false;

    const fetchCountsForType = async (
      type: number,
      setter: React.Dispatch<React.SetStateAction<SummaryCounts>>
    ) => {
      const [allRes, activeRes, inactiveRes] = await Promise.all([
        fetchSettingsSectionPageByType(type, 1, 1, { status: "all" }),
        fetchSettingsSectionPageByType(type, 1, 1, { status: "active" }),
        fetchSettingsSectionPageByType(type, 1, 1, { status: "inactive" }),
      ]);
      if (cancelled) return;
      setter({
        total: allRes?.totalItems ?? 0,
        active: activeRes?.totalItems ?? 0,
        inactive: inactiveRes?.totalItems ?? 0,
      });
    };

    void Promise.all([
      fetchCountsForType(
        WEB_MANAGEMENT_USER_TYPE.FRANCHISE_ADMIN,
        setFranchiseAdminSummaryCounts
      ),
      fetchCountsForType(
        WEB_MANAGEMENT_USER_TYPE.FRANCHISE_EMPLOYEE,
        setEmployeeSummaryCounts
      ),
      fetchCountsForType(WEB_MANAGEMENT_USER_TYPE.STAFF, setStaffSummaryCounts),
    ]);

    return () => {
      cancelled = true;
    };
  }, [initialLoadDone, reloadToken]);

  const loadCurrentSectionPage = useCallback(async () => {
    if (!initialLoadDone) return;
    let cancelled = false;
    await (async () => {
      const type =
        selectedBox === "box-staff"
          ? WEB_MANAGEMENT_USER_TYPE.STAFF
          : selectedBox === "box-franchise-admin"
          ? WEB_MANAGEMENT_USER_TYPE.FRANCHISE_ADMIN
          : WEB_MANAGEMENT_USER_TYPE.FRANCHISE_EMPLOYEE;
      const apiData = await fetchSettingsSectionPageByType(
        type,
        selectedBox === "box-staff" ? staffCurrentPage : roleCurrentPage,
        SETTINGS_ROLE_PAGE_SIZE,
        selectedBox === "box-staff"
          ? { keyword: staffKeyword, status: staffStatus }
          : {
              keyword,
              status,
              franchiseId:
                franchiseFilter && franchiseFilter !== "all"
                  ? franchiseFilter
                  : undefined,
            },
        selectedBox === "box-staff" ? staffSortBy : roleSortBy
      );
      if (cancelled) return;
      if (!apiData) {
        if (selectedBox === "box-staff") {
          setStaffItems([]);
          setStaffTotalPages(1);
        } else {
          const targetRoleType =
            selectedBox === "box-franchise-admin"
              ? "franchise_admin"
              : "employee";
          setItems((prev) => prev.filter((r) => r.roleType !== targetRoleType));
          setRoleTotalPages(1);
        }
        return;
      }
      if (selectedBox === "box-staff") {
        setStaffItems(apiData.staff);
        setStaffTotalPages(Math.max(1, apiData.totalPages || 1));
      } else {
        const targetRoleType =
          selectedBox === "box-franchise-admin"
            ? "franchise_admin"
            : "employee";
        setItems((prev) => {
          const other = prev.filter((r) => r.roleType !== targetRoleType);
          const current = apiData.roles.filter(
            (r) => r.roleType === targetRoleType
          );
          return [...other, ...current];
        });
        setRoleTotalPages(Math.max(1, apiData.totalPages || 1));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    initialLoadDone,
    selectedBox,
    roleCurrentPage,
    staffCurrentPage,
    keyword,
    status,
    staffKeyword,
    staffStatus,
    roleSortBy,
    staffSortBy,
    franchiseFilter,
  ]);

  useEffect(() => {
    void loadCurrentSectionPage();
  }, [loadCurrentSectionPage, reloadToken]);

  const franchiseNameById = useMemo(() => {
    const map = new Map<string, string>();
    franchiseDropdownOptions.forEach((option) => {
      const k = String(option.value ?? "").trim();
      if (k) map.set(k, option.label);
    });
    return map;
  }, [franchiseDropdownOptions]);

  useEffect(() => {
    franchiseNameByIdRef.current = franchiseNameById;
  }, [franchiseNameById]);

  /** When modal is open and dropdown finishes loading, fill Assigned Franchise from `franchise_id`. */
  useEffect(() => {
    if (!showForm || !editing) return;
    const fid = String(editing.franchise_id ?? "").trim();
    if (!fid || !franchiseNameById.has(fid)) return;
    const label = franchiseNameById.get(fid)!;
    setForm((prev) => {
      if ((prev.assignedFranchise ?? "").trim()) return prev;
      return { ...prev, assignedFranchise: label };
    });
  }, [showForm, editing, franchiseNameById]);

  /** Resolve label from API fields or franchise dropdown (handles delayed dropdown load). */
  const franchiseDisplayFor = useCallback(
    (item: RoleSettingsModel | null | undefined) => {
      if (!item) return "";
      const direct = (item.assignedFranchise ?? "").trim();
      if (direct) return direct;
      const fid = String(item.franchise_id ?? "").trim();
      if (fid && franchiseNameById.has(fid)) {
        return franchiseNameById.get(fid)!;
      }
      return "";
    },
    [franchiseNameById]
  );

  const franchiseDisplayForRoleTableColumn = useCallback(
    (item: RoleSettingsModel | null | undefined) => franchiseDisplayFor(item),
    [franchiseDisplayFor]
  );

  const roleRows = useMemo(
    () =>
      applyRoleSortFallback(
        items.map((item) => {
          const fid = String(item.franchise_id ?? "").trim();
          const fromMap = fid ? franchiseNameById.get(fid) : undefined;
          const assigned =
            (item.assignedFranchise ?? "").trim() ||
            (fromMap ?? "").trim() ||
            "";
          return {
            ...item,
            assignedFranchise: assigned,
          };
        }),
        roleSortBy
      ),
    [items, franchiseNameById, roleSortBy]
  );

  const filtered = useMemo(() => {
    return roleRows.filter((item) => {
      // Keyword and status are already applied on backend (`/user/getAll` query params).
      const matchesType = roleType === "all" || item.roleType === roleType;
      const matchesFranchise = (() => {
        if (franchiseFilter === "all") return true;
        const filterValue = String(franchiseFilter ?? "").trim();
        if (!filterValue) return true;
        if (isMongoObjectId(filterValue)) {
          return String(item.franchise_id ?? "").trim() === filterValue;
        }
        return (item.assignedFranchise || "") === filterValue;
      })();
      return matchesType && matchesFranchise;
    });
  }, [roleRows, roleType, franchiseFilter]);

  const isStaffSection = selectedBox === "box-staff";

  const staffFiltered = useMemo(() => {
    // Keyword and status are already applied on backend (`/user/getAll` query params).
    return applyStaffSortFallback(staffItems, staffSortBy);
  }, [staffItems, staffSortBy]);

  const franchiseAdminSummaryData = useMemo(
    () => ({
      Total: franchiseAdminSummaryCounts.total,
      Active: franchiseAdminSummaryCounts.active,
      Inactive: franchiseAdminSummaryCounts.inactive,
    }),
    [franchiseAdminSummaryCounts]
  );

  const employeeSummaryData = useMemo(
    () => ({
      Total: employeeSummaryCounts.total,
      Active: employeeSummaryCounts.active,
      Inactive: employeeSummaryCounts.inactive,
    }),
    [employeeSummaryCounts]
  );

  const staffSummaryData = useMemo(
    () => ({
      Total: staffSummaryCounts.total,
      Active: staffSummaryCounts.active,
      Inactive: staffSummaryCounts.inactive,
    }),
    [staffSummaryCounts]
  );

  /**
   * Employee: `GET_FRANCHISE_DROP_DOWN` (full_list). Admin: `GET_FRANCHISE_DROP_DOWN_ASSIGNED`.
   * Label → id map via `franchiseMetaByName`.
   */
  const assignedFranchiseOptions = useMemo(() => {
    const source =
      form.roleType === "employee"
        ? franchiseDropdownOptions
        : franchiseAssignedAdminDropdownOptions;
    const options = source.map((o) => ({
      value: o.label,
      label: o.label,
    }));
    if (
      form.assignedFranchise &&
      !options.some((x) => x.value === form.assignedFranchise)
    ) {
      options.unshift({
        value: form.assignedFranchise,
        label: form.assignedFranchise,
      });
    }
    const head: { value: string; label: string }[] = [
      { value: "", label: "Select Franchise" },
    ];
    return [...head, ...options];
  }, [
    form.roleType,
    franchiseDropdownOptions,
    franchiseAssignedAdminDropdownOptions,
    form.assignedFranchise,
  ]);

  const franchiseMetaByName = useMemo(() => {
    const source =
      form.roleType === "employee"
        ? franchiseDropdownOptions
        : franchiseAssignedAdminDropdownOptions;
    const map = new Map<string, FranchiseDropDownOption>();
    source.forEach((option) => {
      if (!map.has(option.label)) {
        map.set(option.label, option);
      }
    });
    return map;
  }, [
    form.roleType,
    franchiseDropdownOptions,
    franchiseAssignedAdminDropdownOptions,
  ]);

  const columns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "sr",
        Cell: ({ row }: any) => row.index + 1,
      },
      // {
      //   Header: "Id",
      //   accessor: "roleId",
      //   Cell: textUnderlineCell("roleId", (row) => openFormWithData(row, true)),
      // },
      { Header: "Name", accessor: "roleName", sort: true },
      {
        Header: "Email",
        accessor: "email",
        sort: true,
        Cell: ({ row }: any) => row.original.email || "-",
      },
      {
        Header: "Phone",
        accessor: "phone_number",
        Cell: ({ row }: any) => row.original.phone_number || "-",
      },
      {
        Header: "Assigned Franchise",
        accessor: "assignedFranchise",
        Cell: ({ row }: any) =>
          franchiseDisplayForRoleTableColumn(row.original) || "-",
      },
      {
        Header: "Status",
        accessor: "status",
        Cell: ({ row }: any) => (
          <span
            className={
              row.original.status === "active"
                ? "custom-active"
                : "custom-inactive"
            }
          >
            {row.original.status === "active" ? "Active" : "Inactive"}
          </span>
        ),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: any) => (
          <CustomActionColumn
            row={row}
            onView={() => openFormWithData(row.original, true)}
            onEdit={
              isSuperAdminSession
                ? undefined
                : () => openFormWithData(row.original, false)
            }
            onChangePassword={
              isSuperAdminSession
                ? () => openRolePasswordModal(row.original)
                : undefined
            }
            onDelete={() => {
              openConfirmDialog(
                "Are you sure you want to void this role?",
                "Void",
                "Cancel",
                () => {
                  voidRole(row.original.id);
                  setReloadToken((v) => v + 1);
                }
              );
            }}
          />
        ),
      },
    ],
    [
      openFormWithData,
      franchiseDisplayForRoleTableColumn,
      isSuperAdminSession,
      openRolePasswordModal,
    ]
  );

  const staffColumns = React.useMemo(
    () => [
      { Header: "S.no", accessor: "sr", Cell: ({ row }: any) => row.index + 1 },
      // {
      //   Header: "ID",
      //   accessor: "staffId",
      //   Cell: textUnderlineCell("staffId", (row) => openStaffWithData(row, true)),
      // },
      { Header: "Name", accessor: "name", sort: true },
      {
        Header: "Email",
        accessor: "email",
        sort: true,
        Cell: ({ row }: any) => row.original.email || "-",
      },
      {
        Header: "Phone",
        accessor: "phone_number",
        Cell: ({ row }: any) => row.original.phone_number || "-",
      },
      {
        Header: "Status",
        accessor: "status",
        Cell: ({ row }: any) => (
          <span
            className={
              row.original.status === "active"
                ? "custom-active"
                : "custom-inactive"
            }
          >
            {row.original.status === "active" ? "Active" : "Inactive"}
          </span>
        ),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: any) => (
          <CustomActionColumn
            row={row}
            onView={() => openStaffWithData(row.original, true)}
            onEdit={
              isSuperAdminSession
                ? undefined
                : () => openStaffWithData(row.original, false)
            }
            onChangePassword={
              isSuperAdminSession
                ? () => openStaffPasswordModal(row.original)
                : undefined
            }
          />
        ),
      },
    ],
    [openStaffWithData, isSuperAdminSession, openStaffPasswordModal]
  );

  const clearFiltersDisabled =
    !keyword.trim() && status === "all" && franchiseFilter === "all";

  const clearRoleFilters = () => {
    setKeyword("");
    setStatus("all");
    setFranchiseFilter("all");
    setRoleCurrentPage(1);
    setUtilitySearchKey((k) => k + 1);
  };

  const clearStaffFiltersDisabled =
    !staffKeyword.trim() && staffStatus === "all";

  const clearStaffFilters = () => {
    setStaffKeyword("");
    setStaffStatus("all");
    setStaffCurrentPage(1);
    setStaffUtilityKey((k) => k + 1);
  };

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Management Roles"
        titlePrefix={<SettingsNav />}
        register={register}
        setValue={setValue}
        onLocationChange={(selectedFranchise) => {
          // Header franchise filter is intended for the role table (not Staff section).
          setSelectedBox("box-franchise-admin");
          setRoleType("franchise_admin");
          setFranchiseFilter(selectedFranchise);
          setRoleCurrentPage(1);
        }}
      />

      <div className="box-container settings-role-box-container">
        {!isFranchiseAdminSession && (
          <CustomSummaryBox
            divId="box-franchise-admin"
            title="Franchise Admin"
            data={franchiseAdminSummaryData}
            onSelect={(divId) => {
              setSelectedBox(divId);
              setRoleType("franchise_admin");
              setRoleCurrentPage(1);
            }}
            isSelected={selectedBox === "box-franchise-admin"}
            onFilterChange={(filter) => {
              setRoleType("franchise_admin");
              if (filter.status === "true") setStatus("active");
              else if (filter.status === "false") setStatus("inactive");
              else setStatus("all");
            }}
            isAddShow={true}
            addButtonLable="Add"
            onAddClick={() => {
              setEditing(null);
              setIsViewMode(false);
              setForm({ ...emptyRoleForm, roleType: "franchise_admin" });
              reset({
                role_name: "",
                role_email: "",
                role_phone: "",
                role_password: "",
                role_confirm_password: "",
                assigned_franchise: "",
              });
              setRoleImageFile(null);
              setShowForm(true);
            }}
          />
        )}

        <CustomSummaryBox
          divId="box-employee"
          title="Franchise Employee"
          data={employeeSummaryData}
          onSelect={(divId) => {
            setSelectedBox(divId);
            setRoleType("employee");
            setRoleCurrentPage(1);
          }}
          isSelected={selectedBox === "box-employee"}
          onFilterChange={(filter) => {
            setRoleType("employee");
            if (filter.status === "true") setStatus("active");
            else if (filter.status === "false") setStatus("inactive");
            else setStatus("all");
          }}
          isAddShow={true}
          addButtonLable="Add"
          onAddClick={() => {
            setEditing(null);
            setIsViewMode(false);
            setForm({ ...emptyRoleForm, roleType: "employee" });
            reset({
              role_name: "",
              role_email: "",
              role_phone: "",
              role_password: "",
              role_confirm_password: "",
              assigned_franchise: "",
            });
            setRoleImageFile(null);
            setShowForm(true);
          }}
        />

        {!isFranchiseAdminSession && (
          <CustomSummaryBox
            className="box-staff-card"
            divId="box-staff"
            title="Staff"
            data={staffSummaryData}
            onSelect={(divId) => {
              setSelectedBox(divId);
              setStaffCurrentPage(1);
            }}
            isSelected={selectedBox === "box-staff"}
            onFilterChange={(filter) => {
              setSelectedBox("box-staff");
              if (filter.status === "true") setStaffStatus("active");
              else if (filter.status === "false") setStaffStatus("inactive");
              else setStaffStatus("all");
            }}
            isAddShow={true}
            addButtonLable="Add"
            onAddClick={() => openStaffWithData()}
          />
        )}
      </div>

      {isStaffSection ? (
        <div className="staff-settings-utility">
          <CustomUtilityBox
            key={`staff-utility-${staffUtilityKey}`}
            title="Staff"
            searchHint="Search Name, Email, Phone Number"
            toolsInlineRow
            afterSearchSlot={
              <Button
                variant="outline-secondary"
                size="sm"
                className="custom-btn-secondary partner-payout-clear-btn px-3"
                type="button"
                disabled={clearStaffFiltersDisabled}
                onClick={clearStaffFilters}
              >
                Clear
              </Button>
            }
            controlSlot={
              <div style={{ width: "190px", minWidth: "190px" }}>
                <CustomFormSelect
                  label="Status"
                  controlId="staff_status_filter"
                  options={[
                    { value: "all", label: "All" },
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                  register={register}
                  fieldName="staff_status_filter"
                  asCol={false}
                  noBottomMargin
                  defaultValue={staffStatus}
                  setValue={setValue}
                  onChange={(e) => {
                    setStaffStatus(
                      e.target.value as "all" | "active" | "inactive"
                    );
                    setStaffCurrentPage(1);
                  }}
                />
              </div>
            }
            onSearch={(value) => {
              setStaffKeyword(value);
              setStaffCurrentPage(1);
            }}
            syncKeyword={staffKeyword}
            hideUtilityActions
            hideMoreIcon={true}
          />
        </div>
      ) : (
        <CustomUtilityBox
          key={`role-utility-${utilitySearchKey}`}
          title={`${
            selectedBox === "box-franchise-admin"
              ? "Franchise Admin"
              : "Franchise Employee"
          }`}
          searchHint="Search Name, Email, Phone Number"
          toolsInlineRow
          afterSearchSlot={
            <Button
              variant="outline-secondary"
              size="sm"
              className="custom-btn-secondary partner-payout-clear-btn px-3"
              type="button"
              disabled={clearFiltersDisabled}
              onClick={clearRoleFilters}
            >
              Clear
            </Button>
          }
          controlSlot={
            <>
              <div style={{ width: "190px", minWidth: "190px" }}>
                <CustomFormSelect
                  label="Status"
                  controlId="role_status_filter"
                  options={[
                    { value: "all", label: "All" },
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                  register={register}
                  fieldName="role_status_filter"
                  asCol={false}
                  noBottomMargin
                  defaultValue={status}
                  setValue={setValue}
                  onChange={(e) => {
                    setStatus(e.target.value as "all" | "active" | "inactive");
                    setRoleCurrentPage(1);
                  }}
                />
              </div>
            </>
          }
          onSearch={(value) => {
            setKeyword(value);
            setRoleCurrentPage(1);
          }}
          syncKeyword={keyword}
          hideUtilityActions
          hideMoreIcon={true}
        />
      )}

      {!initialLoadDone ? (
        <div className="text-center py-4">Loading data...</div>
      ) : isStaffSection ? (
        <div className="staff-settings-table-shell">
          <CustomTable
            columns={staffColumns}
            data={staffFiltered}
            currentPage={staffCurrentPage}
            totalPages={staffTotalPages}
            pageSize={SETTINGS_ROLE_PAGE_SIZE}
            onPageChange={(page) => setStaffCurrentPage(page)}
            manualSortBy
            sortBy={staffSortBy}
            onSortChange={(next) => {
              setStaffSortBy(next);
              setStaffCurrentPage(1);
            }}
            isPagination={true}
          />
        </div>
      ) : (
        <CustomTable
          columns={columns}
          data={filtered}
          currentPage={roleCurrentPage}
          totalPages={roleTotalPages}
          pageSize={SETTINGS_ROLE_PAGE_SIZE}
          onPageChange={(page) => setRoleCurrentPage(page)}
          manualSortBy
          sortBy={roleSortBy}
          onSortChange={(next) => {
            setRoleSortBy(next);
            setRoleCurrentPage(1);
          }}
          isPagination={true}
        />
      )}

      <Modal
        show={Boolean(passwordModal)}
        onHide={() => {
          if (!passwordModalPending) closePasswordModal();
        }}
        centered
        dialogClassName="custom-big-modal"
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            Change password
          </Modal.Title>
          <CustomCloseButton
            onClose={() => {
              if (!passwordModalPending) closePasswordModal();
            }}
          />
        </Modal.Header>
        <Modal.Body className="px-4 pb-4 pt-0">
          {passwordModal ? (
            <>
              <p className="text-muted small mb-3 mb-md-4">
                {passwordModal.displayName}
              </p>
              <Row>
                <div className="col-md-12">
                  <CustomFormInput
                    label="New Password"
                    controlId="settings_role_pwd_new"
                    placeholder="Enter new Password"
                    register={register}
                    inputType="password"
                    asCol={false}
                    autoComplete="new-password"
                    value={passwordModalFields.newPassword}
                    onChange={(value: string) =>
                      setPasswordModalFields((p) => ({
                        ...p,
                        newPassword: value,
                      }))
                    }
                  />
                </div>
                <div className="col-md-12">
                  <CustomFormInput
                    label="Re-enter Password"
                    controlId="settings_role_pwd_reenter"
                    placeholder="Re-enter password"
                    register={register}
                    inputType="password"
                    asCol={false}
                    autoComplete="new-password"
                    value={passwordModalFields.reenterPassword}
                    onChange={(value: string) =>
                      setPasswordModalFields((p) => ({
                        ...p,
                        reenterPassword: value,
                      }))
                    }
                  />
                </div>
              </Row>
              <Row className="mt-4">
                <Col
                  xs={12}
                  className="text-center d-flex justify-content-end gap-3"
                >
                  <Button
                    type="button"
                    className="custom-btn-primary"
                    disabled={passwordModalPending}
                    onClick={() => void submitPasswordModal()}
                  >
                    {passwordModalPending ? "Updating…" : "Update"}
                  </Button>
                  <Button
                    type="button"
                    className="custom-btn-secondary"
                    disabled={passwordModalPending}
                    onClick={closePasswordModal}
                  >
                    Cancel
                  </Button>
                </Col>
              </Row>
            </>
          ) : null}
        </Modal.Body>
      </Modal>

      <Modal
        show={showForm}
        onHide={() => setShowForm(false)}
        centered
        key={`settings-role-modal-${editing?.id ?? `add-${form.roleType}`}`}
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            {editing
              ? isViewMode
                ? form.roleType === "franchise_admin"
                  ? "Franchise Admin Information"
                  : "Franchise Employee Information"
                : form.roleType === "franchise_admin"
                ? "Edit Franchise Admin"
                : "Edit Franchise Employee"
              : form.roleType === "franchise_admin"
              ? "Add Franchise Admin"
              : "Add Franchise Employee"}
          </Modal.Title>
          <CustomCloseButton onClose={() => setShowForm(false)} />
        </Modal.Header>
        <Modal.Body
          className="px-4 pb-4 pt-0"
          style={{ maxHeight: "70vh", overflowY: "auto" }}
        >
          {isViewMode && editing ? (
            <section
              className="custom-other-details"
              style={{ padding: "10px" }}
            >
              <div className="d-flex justify-content-end mb-2">
                <i
                  className="bi bi-pencil-fill fs-6 text-danger"
                  style={{ cursor: "pointer" }}
                  title="Edit"
                  aria-label="Edit"
                  onClick={() => setIsViewMode(false)}
                />
              </div>
              <div className="text-center mb-3">
                <img
                  src={franchiseRoleProfileImageSrc(editing.profile_url)}
                  alt=""
                  width={120}
                  height={120}
                  style={{
                    objectFit: "cover",
                    borderRadius: "50%",
                    border: "1px solid var(--lb1-border)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                />
                <h4
                  className="mt-3 mb-0 fw-semibold"
                  style={{
                    color: "var(--navi-color)",
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  {editing.roleName}
                </h4>
              </div>
              <div
                className="row pt-3 border-top"
                style={{ borderColor: "var(--lb1-border)" }}
              >
                <div className="col-md-12 custom-helper-column">
                  <DetailsRow title="Email" value={editing.email || "-"} />
                  <DetailsRow
                    title="Phone"
                    value={editing.phone_number || "-"}
                  />
                  <DetailsRow
                    title="Gender"
                    value={formatGenderLabel(editing.gender)}
                  />
                  <DetailsRow
                    title="Date of Birth"
                    value={
                      editing.date_of_birth
                        ? formatDate(String(editing.date_of_birth))
                        : "-"
                    }
                  />
                  <DetailsRow
                    title="Assigned Franchise"
                    value={franchiseDisplayFor(editing) || "-"}
                  />
                  <DetailsRow
                    title="Status"
                    value={editing.status === "active" ? "Active" : "Inactive"}
                  />
                  {editing.roleType !== "franchise_admin" ? (
                    <FullDetailsRow
                      title="Screen Permissions"
                      value={
                        editing.screenPermissions?.length ? (
                          <ul className="mb-0 ps-3">
                            {editing.screenPermissions.map((permissionKey) => (
                              <li key={permissionKey}>
                                {labelForFranchiseEmployeeScreenKey(
                                  permissionKey
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          "-"
                        )
                      }
                    />
                  ) : null}
                </div>
              </div>
            </section>
          ) : (
            <div className="row g-2">
              <div className="col-md-12">
                <CustomFormInput
                  label="Name"
                  controlId="role_name"
                  placeholder="Enter Name"
                  register={register}
                  asCol={false}
                  value={form.roleName}
                  onChange={(value: string) =>
                    setForm((p) => ({ ...p, roleName: value }))
                  }
                />
              </div>
              <div className="col-md-12">
                <CustomDatePicker
                  label="Date of Birth"
                  controlId="role_date_of_birth"
                  asCol={false}
                  birthDatePicker
                  selectedDate={form.date_of_birth ? form.date_of_birth : null}
                  placeholderText="Select date of birth"
                  register={register}
                  setValue={setValue}
                  onChange={(date) => {
                    const value = date ? dateToLocalYmd(date) : "";
                    setForm((p) => ({ ...p, date_of_birth: value }));
                    setValue("role_date_of_birth", value);
                  }}
                />
              </div>
              <div className="col-md-12">
                <CustomFormInput
                  label="Email"
                  controlId="role_email"
                  placeholder="name@example.com"
                  register={register}
                  inputType="email"
                  asCol={false}
                  value={form.email}
                  onChange={(value: string) =>
                    setForm((p) => ({ ...p, email: value }))
                  }
                />
              </div>
              <div className="col-md-12">
                <CustomFormIndiaMobile
                  label="Phone number"
                  controlId="role_phone"
                  placeholder="Mobile number"
                  register={register}
                  asCol={false}
                  value={form.phone_number}
                  onChange={(value: string) =>
                    setForm((p) => ({
                      ...p,
                      phone_number: sanitizeIndiaNationalPhoneInput(value),
                    }))
                  }
                />
              </div>
              <div className="col-md-12">
                <GenderRadioField
                  value={form.gender}
                  onChange={(gender) => setForm((p) => ({ ...p, gender }))}
                />
              </div>
              {!editing && (
                <>
                  <div className="col-md-12">
                    <CustomFormInput
                      label="Password"
                      controlId="role_password"
                      placeholder="Enter new Password"
                      register={register}
                      inputType="password"
                      asCol={false}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(value: string) =>
                        setForm((p) => ({ ...p, password: value }))
                      }
                    />
                  </div>
                  <div className="col-md-12">
                    <CustomFormInput
                      label="Confirm password"
                      controlId="role_confirm_password"
                      placeholder="Re-enter password"
                      register={register}
                      inputType="password"
                      asCol={false}
                      autoComplete="new-password"
                      value={form.confirmPassword}
                      onChange={(value: string) =>
                        setForm((p) => ({ ...p, confirmPassword: value }))
                      }
                    />
                  </div>
                </>
              )}
              <div className="col-md-12">
                <CustomImageUploader
                  label="Profile photo"
                  maxFiles={1}
                  isEditable={Boolean(editing)}
                  {...(form.profile_url
                    ? { existingImages: [form.profile_url] }
                    : {})}
                  onFileChange={(files) => {
                    const f = files[0] ?? null;
                    setRoleImageFile(f);
                    setForm((p) => {
                      if (!editing) {
                        return { ...p, profile_url: "" };
                      }
                      if (f) {
                        return { ...p, profile_url: `uploads/${f.name}` };
                      }
                      return { ...p, profile_url: p.profile_url };
                    });
                  }}
                />
              </div>
              <div className="col-md-12">
                <CustomFormSelect
                  label="Assigned Franchise"
                  controlId="assigned_franchise"
                  options={assignedFranchiseOptions}
                  register={register}
                  fieldName="assigned_franchise"
                  asCol={false}
                  defaultValue={form.assignedFranchise}
                  setValue={setValue}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setForm((p) => ({
                      ...p,
                      assignedFranchise: raw,
                    }));
                  }}
                  menuPortal
                />
              </div>
              <div className="col-md-12">
                <Form.Group style={{ marginTop: "10px" }}>
                  <Form.Label className="fw-medium mb-1">Status</Form.Label>
                  <div
                    className="d-flex"
                    style={{ flexDirection: "row", gap: "8px" }}
                  >
                    <Form.Check
                      type="radio"
                      id="role_status_active"
                      label={<span className="custom-radio-text">Active</span>}
                      value="active"
                      checked={form.status === "active"}
                      onChange={() =>
                        setForm((p) => ({ ...p, status: "active" }))
                      }
                      className="custom-radio-check"
                    />
                    <Form.Check
                      type="radio"
                      id="role_status_inactive"
                      label={
                        <span className="custom-radio-text">Inactive</span>
                      }
                      value="inactive"
                      checked={form.status === "inactive"}
                      onChange={() =>
                        setForm((p) => ({ ...p, status: "inactive" }))
                      }
                      className="custom-radio-check"
                    />
                  </div>
                </Form.Group>
              </div>
              {form.roleType === "employee" && (
                <div className="col-md-12">
                  <ScreenPermissionChecklist
                    idPrefix="role_screen_perm"
                    items={employeeScreenPermissionMenuItems}
                    selectedKeys={form.screenPermissions}
                    onChange={(screenPermissions) =>
                      setForm((prev) => ({ ...prev, screenPermissions }))
                    }
                  />
                </div>
              )}
            </div>
          )}
        </Modal.Body>
        {!isViewMode && (
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              className="btn-danger"
              disabled={roleSavePending}
              onClick={async () => {
                if (!form.roleName.trim()) {
                  showErrorAlert("Please enter name.");
                  return;
                }
                if (!form.email.trim() || !isValidUserEmail(form.email)) {
                  showErrorAlert("Please enter a valid email address.");
                  return;
                }
                const rolePhoneFull = fullPhoneFromIndiaNational(
                  sanitizeIndiaNationalPhoneInput(form.phone_number)
                );
                if (!isValidE164StylePhone(rolePhoneFull)) {
                  showErrorAlert(
                    "Please enter a valid mobile number (10 digits after +91)."
                  );
                  return;
                }
                if (!editing) {
                  const pwErr = validateStrongPassword(form.password);
                  if (pwErr) {
                    showErrorAlert(pwErr);
                    return;
                  }
                  if (!passwordsMatch(form.password, form.confirmPassword)) {
                    showErrorAlert("Password and confirm password do not match.");
                    return;
                  }
                }
                const rolePayload = {
                  roleId:
                    editing?.roleId ||
                    `ROLE-${String(items.length + 1).padStart(3, "0")}`,
                  roleName: form.roleName.trim(),
                  email: form.email.trim(),
                  phone_number: rolePhoneFull,
                  gender: form.gender,
                  date_of_birth: form.date_of_birth.trim() || undefined,
                  profile_url: form.profile_url.trim() || undefined,
                  roleType: form.roleType,
                  assignedFranchise: form.assignedFranchise || undefined,
                  franchise_id:
                    (form.assignedFranchise &&
                      franchiseMetaByName.get(form.assignedFranchise)?.value) ||
                    editing?.franchise_id ||
                    undefined,
                  state_id:
                    (form.assignedFranchise &&
                      franchiseMetaByName.get(form.assignedFranchise)
                        ?.state_id) ||
                    editing?.state_id ||
                    undefined,
                  city_id:
                    (form.assignedFranchise &&
                      franchiseMetaByName.get(form.assignedFranchise)
                        ?.city_id) ||
                    editing?.city_id ||
                    undefined,
                  status: form.status,
                  screenPermissions:
                    form.roleType === "employee"
                      ? screenPermissionsForPayload(
                          form.screenPermissions,
                          employeeScreenPermissionKeys
                        )
                      : form.screenPermissions,
                };
                if (editing?.id) {
                  setRoleSavePending(true);
                  try {
                    const ok = await updateRoleUserWithApi(
                      editing.id,
                      rolePayload,
                      roleImageFile ?? undefined
                    );
                    if (ok) {
                      setRoleImageFile(null);
                      setShowForm(false);
                      setReloadToken((v) => v + 1);
                    }
                  } finally {
                    setRoleSavePending(false);
                  }
                  return;
                }
                setRoleSavePending(true);
                try {
                  const result = await createRoleUserWithApi(
                    rolePayload,
                    roleImageFile ?? undefined,
                    form.password.trim()
                  );
                  if (result.ok) {
                    setRoleImageFile(null);
                    setShowForm(false);
                    setRoleCurrentPage(1);
                    setReloadToken((v) => v + 1);
                  }
                } finally {
                  setRoleSavePending(false);
                }
              }}
            >
              {roleSavePending ? "Saving…" : editing ? "Update" : "Save"}
            </Button>
          </Modal.Footer>
        )}
      </Modal>

      <Modal
        show={showStaffModal}
        onHide={() => setShowStaffModal(false)}
        centered
        enforceFocus={false}
        className="staff-settings-modal"
        contentClassName="staff-settings-modal__body"
      >
        <Modal.Header className="staff-settings-modal__header py-3 px-4 border-bottom-0 position-relative">
          <Modal.Title as="h5" className="custom-modal-title pe-4">
            {staffEditing
              ? staffIsViewMode
                ? "Staff Information"
                : "Edit Staff"
              : "Add Staff"}
          </Modal.Title>
          <CustomCloseButton onClose={() => setShowStaffModal(false)} />
        </Modal.Header>
        <Modal.Body
          className="px-4 pb-4 pt-3"
          style={{ maxHeight: "70vh", overflowY: "auto" }}
        >
          {staffIsViewMode && staffEditing ? (
            <section
              className="custom-other-details staff-settings-view-card modal-readonly-details"
              style={{ padding: "14px" }}
            >
              <div className="d-flex justify-content-end mb-2">
                <i
                  className="bi bi-pencil-fill fs-6"
                  style={{ cursor: "pointer", color: "#0f766e" }}
                  title="Edit"
                  aria-label="Edit"
                  onClick={() => setStaffIsViewMode(false)}
                />
              </div>
              <div className="text-center mb-3">
                <img
                  src={franchiseRoleProfileImageSrc(staffEditing.profile_url)}
                  alt=""
                  width={120}
                  height={120}
                  style={{
                    objectFit: "cover",
                    borderRadius: "50%",
                    border: "1px solid var(--lb1-border)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                />
                <h4
                  className="mt-3 mb-0 fw-semibold"
                  style={{
                    color: "var(--navi-color)",
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  {staffEditing.name}
                </h4>
              </div>
              <div
                className="row pt-3 border-top"
                style={{ borderColor: "var(--lb1-border)" }}
              >
                <div className="col-md-12 custom-helper-column">
                  <DetailsRow title="Email" value={staffEditing.email || "-"} />
                  <DetailsRow
                    title="Phone"
                    value={staffEditing.phone_number || "-"}
                  />
                  <DetailsRow
                    title="Gender"
                    value={formatGenderLabel(staffEditing.gender)}
                  />
                  <DetailsRow
                    title="Date of Birth"
                    value={
                      staffEditing.date_of_birth
                        ? formatDate(String(staffEditing.date_of_birth))
                        : "-"
                    }
                  />
                  <FullDetailsRow
                    title="Screen Permissions"
                    value={
                      staffEditing.screenPermissions?.length ? (
                        <ul className="mb-0 ps-3">
                          {staffEditing.screenPermissions.map(
                            (permissionKey) => (
                              <li key={permissionKey}>
                                {labelForFranchiseEmployeeScreenKey(
                                  permissionKey
                                )}
                              </li>
                            )
                          )}
                        </ul>
                      ) : (
                        "-"
                      )
                    }
                  />
                  <FullDetailsRow
                    title="Franchise Permissions"
                    value={staffFranchiseSummary(staffEditing)}
                  />
                </div>
              </div>
            </section>
          ) : (
            <div
              className="row g-2"
              key={staffEditing ? undefined : `add-${staffAddFormKey}`}
            >
              <div className="col-md-12">
                <CustomFormInput
                  label="Name"
                  controlId="staff_name"
                  placeholder="Enter Name"
                  register={register}
                  asCol={false}
                  value={staffForm.name}
                  onChange={(value: string) =>
                    setStaffForm((p) => ({ ...p, name: value }))
                  }
                />
              </div>
              <div className="col-md-12">
                <CustomDatePicker
                  label="Date of Birth"
                  controlId="staff_date_of_birth"
                  asCol={false}
                  birthDatePicker
                  selectedDate={
                    staffForm.date_of_birth ? staffForm.date_of_birth : null
                  }
                  placeholderText="Select date of birth"
                  register={register}
                  setValue={setValue}
                  onChange={(date) => {
                    const value = date ? dateToLocalYmd(date) : "";
                    setStaffForm((p) => ({ ...p, date_of_birth: value }));
                    setValue("staff_date_of_birth", value);
                  }}
                />
              </div>
              <div className="col-md-12">
                <CustomFormInput
                  label="Email"
                  controlId="staff_email"
                  placeholder="name@example.com"
                  register={register}
                  inputType="email"
                  asCol={false}
                  value={staffForm.email}
                  onChange={(value: string) =>
                    setStaffForm((p) => ({ ...p, email: value }))
                  }
                />
              </div>
              <div className="col-md-12">
                <CustomFormIndiaMobile
                  label="Phone number"
                  controlId="staff_phone"
                  placeholder="Mobile number"
                  register={register}
                  asCol={false}
                  value={staffForm.phone_number}
                  onChange={(value: string) =>
                    setStaffForm((p) => ({
                      ...p,
                      phone_number: sanitizeIndiaNationalPhoneInput(value),
                    }))
                  }
                />
              </div>
              <div className="col-md-12">
                <GenderRadioField
                  value={staffForm.gender}
                  onChange={(gender) =>
                    setStaffForm((p) => ({ ...p, gender }))
                  }
                />
              </div>
              {!staffEditing && (
                <>
                  <div className="col-md-12">
                    <CustomFormInput
                      label="Password"
                      controlId="staff_password"
                      placeholder="Enter Password"
                      register={register}
                      inputType="password"
                      asCol={false}
                      autoComplete="new-password"
                      value={staffForm.password}
                      onChange={(value: string) =>
                        setStaffForm((p) => ({ ...p, password: value }))
                      }
                    />
                  </div>
                  <div className="col-md-12">
                    <CustomFormInput
                      label="Confirm password"
                      controlId="staff_confirm_password"
                      placeholder="Re-enter password"
                      register={register}
                      inputType="password"
                      asCol={false}
                      autoComplete="new-password"
                      value={staffForm.confirmPassword}
                      onChange={(value: string) =>
                        setStaffForm((p) => ({ ...p, confirmPassword: value }))
                      }
                    />
                  </div>
                </>
              )}
              <div className="col-md-12">
                <CustomImageUploader
                  label="Profile photo"
                  maxFiles={1}
                  isEditable={Boolean(staffEditing)}
                  {...(staffForm.profile_url
                    ? { existingImages: [staffForm.profile_url] }
                    : {})}
                  onFileChange={(files) => {
                    setStaffImageFile(files[0] ?? null);
                    setStaffForm((p) => ({
                      ...p,
                      profile_url: files[0]
                        ? `uploads/${files[0].name}`
                        : p.profile_url,
                    }));
                  }}
                />
              </div>
              <div className="col-md-12">
                <Form.Group style={{ marginTop: "6px" }}>
                  <Form.Label className="fw-medium mb-1">Status</Form.Label>
                  <div
                    className="d-flex"
                    style={{ flexDirection: "row", gap: "8px" }}
                  >
                    <Form.Check
                      type="radio"
                      id="staff_status_active"
                      label={<span className="custom-radio-text">Active</span>}
                      value="active"
                      checked={staffForm.status === "active"}
                      onChange={() =>
                        setStaffForm((p) => ({ ...p, status: "active" }))
                      }
                      className="custom-radio-check"
                    />
                    <Form.Check
                      type="radio"
                      id="staff_status_inactive"
                      label={
                        <span className="custom-radio-text">Inactive</span>
                      }
                      value="inactive"
                      checked={staffForm.status === "inactive"}
                      onChange={() =>
                        setStaffForm((p) => ({ ...p, status: "inactive" }))
                      }
                      className="custom-radio-check"
                    />
                  </div>
                </Form.Group>
              </div>
              <div className="col-md-12">
                <ScreenPermissionChecklist
                  idPrefix="staff_screen_perm"
                  items={staffScreenPermissionMenuItems}
                  selectedKeys={staffForm.screenPermissions}
                  onChange={(screenPermissions) =>
                    setStaffForm((prev) => ({ ...prev, screenPermissions }))
                  }
                />
              </div>
            </div>
          )}
        </Modal.Body>
        {!staffIsViewMode && (
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowStaffModal(false)}
            >
              Cancel
            </Button>
            <Button
              className="staff-settings-save-btn"
              disabled={staffSavePending}
              onClick={async () => {
                if (!staffForm.name.trim()) {
                  showErrorAlert("Please enter name.");
                  return;
                }
                if (
                  !staffForm.email.trim() ||
                  !isValidUserEmail(staffForm.email)
                ) {
                  showErrorAlert("Please enter a valid email address.");
                  return;
                }
                const staffPhoneFull = fullPhoneFromIndiaNational(
                  sanitizeIndiaNationalPhoneInput(staffForm.phone_number)
                );
                if (!isValidE164StylePhone(staffPhoneFull)) {
                  showErrorAlert(
                    "Please enter a valid mobile number (10 digits after +91)."
                  );
                  return;
                }
                if (!staffEditing) {
                  const pwErr = validateStrongPassword(staffForm.password);
                  if (pwErr) {
                    showErrorAlert(pwErr);
                    return;
                  }
                  if (
                    !passwordsMatch(
                      staffForm.password,
                      staffForm.confirmPassword
                    )
                  ) {
                    showErrorAlert("Password and confirm password do not match.");
                    return;
                  }
                }
                if (
                  !staffForm.allFranchises &&
                  staffForm.franchisePermissions.length === 0
                ) {
                  showErrorAlert(
                    "Select at least one franchise, or choose All franchises."
                  );
                  return;
                }
                const staffPayload = {
                  staffId:
                    staffEditing?.staffId ||
                    `STAFF-${String(staffItems.length + 1).padStart(3, "0")}`,
                  name: staffForm.name.trim(),
                  email: staffForm.email.trim(),
                  phone_number: staffPhoneFull,
                  gender: staffForm.gender,
                  date_of_birth: staffForm.date_of_birth.trim() || undefined,
                  profile_url: staffForm.profile_url.trim() || undefined,
                  status: staffForm.status,
                  screenPermissions: screenPermissionsForPayload(
                    staffForm.screenPermissions,
                    staffScreenPermissionKeys
                  ).filter((k) => k !== "my-franchise"),
                  allFranchises: staffForm.allFranchises,
                  franchisePermissions: staffForm.allFranchises
                    ? []
                    : [...staffForm.franchisePermissions],
                };
                if (staffEditing?.id) {
                  setStaffSavePending(true);
                  try {
                    const ok = await updateStaffUserWithApi(
                      staffEditing.id,
                      staffPayload,
                      staffImageFile ?? undefined
                    );
                    if (ok) {
                      setStaffImageFile(null);
                      setShowStaffModal(false);
                      setReloadToken((v) => v + 1);
                    }
                  } finally {
                    setStaffSavePending(false);
                  }
                  return;
                }
                setStaffSavePending(true);
                try {
                  const ok = await createStaffUserWithApi(
                    staffPayload,
                    staffImageFile ?? undefined,
                    staffForm.password.trim()
                  );
                  if (ok) {
                    setStaffImageFile(null);
                    setShowStaffModal(false);
                    setStaffCurrentPage(1);
                    setReloadToken((v) => v + 1);
                  }
                } finally {
                  setStaffSavePending(false);
                }
              }}
            >
              {staffSavePending ? "Saving…" : staffEditing ? "Update" : "Save"}
            </Button>
          </Modal.Footer>
        )}
      </Modal>
    </div>
  );
};

export default RoleManagement;
