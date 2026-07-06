import React, { useEffect, useMemo, useState } from "react";
import { Modal, Button, Row, Col, Form } from "react-bootstrap";
import { useForm, UseFormRegister, UseFormSetValue } from "react-hook-form";
import CustomCloseButton from "../../components/CustomCloseButton";
import CustomTextField from "../../components/CustomTextField";
import CustomTextFieldIndiaMobile from "../../components/CustomTextFieldIndiaMobile";
import CustomTextFieldRadio from "../../components/CustomTextFieldRadio";
import CustomDatePicker from "../../components/CustomDatePicker";
import CustomImageUploader from "../../components/CustomImageUploader";
import GenderRadioField from "../../components/GenderRadioField";
import { formatDate, getStatusOptions } from "../../helper/utility";
import { dateToLocalYmd } from "../../helper/dateFormat";
import { openDialog } from "../../lib/global/DialogManager";
import { showErrorAlert, showSuccessAlert } from "../../lib/global/alertHelper";
import { AppConstant } from "../../lib/global/AppConstant";
import {
  getFranchiseEmployeeScreenMenuItems,
} from "../../lib/layout/franchiseEmployeeScreenPermissions";
import {
  screenPermissionKeysFromItems,
  screenPermissionsForPayload,
} from "../../lib/layout/screenPermissionSelection";
import ScreenPermissionChecklist from "../../components/ScreenPermissionChecklist";
import {
  formatGenderLabel,
  normalizeGenderValue,
} from "../../lib/user/genderOptions";
import { menuKeysFromAvailablePages } from "../../services/userService";
import type { EmployeeRow } from "../../services/myFranchiseService";
import {
  createFranchiseEmployee,
  updateFranchiseEmployee,
} from "../../services/myFranchiseService";
import {
  isNonEmptyName,
  isValidUserEmail,
  isValidE164StylePhone,
  fullPhoneFromIndiaNational,
  nationalDigitsWithoutIndia91,
  sanitizeIndiaNationalPhoneInput,
  validateStrongPassword,
  passwordsMatch,
} from "../../lib/user/userFormValidation";
import profilePlaceholder from "../../assets/icons/profile.svg";

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

function franchiseEmployeeProfileImageSrc(profileUrl?: string): string {
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

type EmployeeFormValues = {
  name: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  is_active: string;
  chat_enabled: boolean;
};

type FranchiseEmployeeDialogProps = {
  onClose: () => void;
  /** Return a Promise so add/update can await getCount + list reload before closing. */
  onRefreshData: () => void | Promise<void>;
} & (
  | { mode: "add"; employee: null }
  | { mode: "view-edit"; employee: EmployeeRow }
);

const FranchiseEmployeeDialog: React.FC<FranchiseEmployeeDialogProps> & {
  showAdd: (onRefreshData: () => void | Promise<void>) => void;
  showView: (
    employee: EmployeeRow,
    onRefreshData: () => void | Promise<void>
  ) => void;
} = (props) => {
  const { onClose, onRefreshData } = props;
  const isAdd = props.mode === "add";
  const employee = isAdd ? null : props.employee;

  /** Explicit tuple (avoids rare HMR / legacy `ReactDOM.render` issues with destructured setter). */
  const screenPermissionState = useState<string[]>(["dashboards"]);
  const screenPermissionKeys = screenPermissionState[0];
  const setScreenPermissionKeys = screenPermissionState[1];

  const [isEditing, setIsEditing] = useState(isAdd);
  const [gender, setGender] = useState<GenderField>("male");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);

  const franchiseScreenMenuItems = useMemo(
    () => getFranchiseEmployeeScreenMenuItems(),
    []
  );
  const franchiseScreenPermissionKeys = useMemo(
    () => screenPermissionKeysFromItems(franchiseScreenMenuItems),
    [franchiseScreenMenuItems]
  );

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    getValues,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      password: "",
      confirmPassword: "",
      is_active: "true",
      chat_enabled: true,
    },
  });

  const isActiveStr = watch("is_active");
  const isActiveBool = String(isActiveStr ?? "") === "true";
  const chatEnabled = watch("chat_enabled");

  useEffect(() => {
    setIsEditing(isAdd);
  }, [isAdd, employee?._id]);

  useEffect(() => {
    if (isAdd) {
      reset({
        name: "",
        phone: "",
        email: "",
        password: "",
        confirmPassword: "",
        is_active: "true",
        chat_enabled: true,
      });
      setScreenPermissionKeys(["dashboards"]);
      setGender("male");
      setDateOfBirth("");
      setProfileUrl("");
      setProfileImageFile(null);
      return;
    }
    if (employee && isEditing) {
      reset({
        name: employee.name,
        phone: nationalDigitsWithoutIndia91(String(employee.phone ?? "")),
        email: employee.email,
        password: "",
        confirmPassword: "",
        is_active: String(employee.is_active),
        chat_enabled: Boolean(
          employee.is_active && (employee.chat_enabled ?? true)
        ),
      });
      setGender(normalizeGenderValue(employee.gender) || "male");
      setDateOfBirth(dobToYmd(employee.date_of_birth));
      setProfileUrl(employee.profile_url ?? "");
      setProfileImageFile(null);
      const fromKeys = employee.screenPermissionKeys?.length
        ? employee.screenPermissionKeys
        : menuKeysFromAvailablePages(employee.accessible_screens);
      setScreenPermissionKeys(fromKeys.length ? fromKeys : ["dashboards"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use employee?._id so parent re-fetch (new object ref) does not reset the form mid-edit; fields match that id
  }, [isAdd, employee?._id, isEditing, reset]);

  const modalTitle = isAdd
    ? "Add Employee"
    : isEditing
    ? "Edit Employee"
    : "Employee Details";

  const parseSubmitPayload = (data: EmployeeFormValues & { phone?: string }) => {
    const is_active = String(data.is_active ?? "") === "true";
    const chat_enabled = is_active ? Boolean(data.chat_enabled) : false;
    const keys = screenPermissionsForPayload(
      screenPermissionKeys,
      franchiseScreenPermissionKeys
    );
    const national = sanitizeIndiaNationalPhoneInput(
      String(data.phone ?? "").trim()
    );
    const phone = fullPhoneFromIndiaNational(national);
    return {
      name: data.name.trim(),
      phone,
      email: data.email.trim(),
      is_active,
      chat_enabled,
      screenPermissionKeys: keys,
      gender,
      date_of_birth: dateOfBirth.trim() || undefined,
      profile_url: profileUrl.trim() || undefined,
      imageFile: profileImageFile ?? undefined,
    };
  };

  const onSubmitForm = async (data: EmployeeFormValues) => {
    const activeWatch = watch("is_active");
    const isActiveStr =
      typeof activeWatch === "boolean"
        ? String(activeWatch)
        : (activeWatch as string | undefined) ?? data.is_active ?? "true";

    const payload = parseSubmitPayload({
      ...data,
      is_active: isActiveStr,
      chat_enabled: Boolean(watch("chat_enabled")),
    });
    if (!isNonEmptyName(payload.name)) {
      showErrorAlert("Please enter a name.");
      return;
    }
    if (!isValidUserEmail(payload.email)) {
      showErrorAlert("Please enter a valid email address.");
      return;
    }
    if (!isValidE164StylePhone(payload.phone)) {
      showErrorAlert("Please enter a valid mobile number (digits after +91).");
      return;
    }
    if (isAdd) {
      const pwErr = validateStrongPassword(data.password ?? "");
      if (pwErr) {
        showErrorAlert(pwErr);
        return;
      }
      if (!passwordsMatch(data.password ?? "", data.confirmPassword ?? "")) {
        showErrorAlert("Password and confirm password do not match.");
        return;
      }
    }
    if (payload.screenPermissionKeys.length === 0) {
      showErrorAlert("Select at least one screen permission.");
      return;
    }

    if (isAdd) {
      const ok = await createFranchiseEmployee({
        ...payload,
        password: data.password.trim(),
      });
      if (ok) {
        showSuccessAlert("Employee added");
        await Promise.resolve(onRefreshData());
        onClose();
      }
      return;
    }

    if (!employee?._id) {
      showErrorAlert("Unable to update. ID is missing.");
      return;
    }

    const ok = await updateFranchiseEmployee(employee._id, payload);
    if (ok) {
      showSuccessAlert("Employee updated");
      await Promise.resolve(onRefreshData());
      onClose();
    }
  };

  const renderViewBody = () => {
    if (!employee) return null;
    const screenPermissionLabels: string[] = employee.accessible_screens?.length
      ? employee.accessible_screens.map((s) => String(s.page ?? "").trim()).filter(Boolean)
      : employee.screenPermissionKeys?.length
        ? employee.screenPermissionKeys.map(
            (k) =>
              franchiseScreenMenuItems.find((i) => i.key === k)?.label ?? k
          )
        : [];
    const chatOn = Boolean(
      employee.is_active && (employee.chat_enabled ?? true)
    );
    const detailFields: { label: string; value: React.ReactNode }[] = [
      { label: "Email", value: employee.email ?? "-" },
      { label: "Phone", value: employee.phone ?? "-" },
      { label: "Gender", value: formatGenderLabel(employee.gender) },
      {
        label: "Date of Birth",
        value: employee.date_of_birth
          ? formatDate(String(employee.date_of_birth))
          : "-",
      },
      { label: "Chat", value: chatOn ? "Enabled" : "Disabled" },
      {
        label: "Status",
        value: (
          <span
            className={
              employee.is_active ? "custom-active" : "custom-inactive"
            }
          >
            {employee.is_active ? "Active" : "Inactive"}
          </span>
        ),
      },
    ];

    return (
      <section className="custom-other-details franchise-employee-view-card">
        <button
          type="button"
          className="franchise-employee-view-card__edit btn btn-link p-0 border-0"
          aria-label="Edit employee"
          onClick={() => setIsEditing(true)}
        >
          <i className="bi bi-pencil-fill fs-6 text-danger" />
        </button>

        <div className="franchise-employee-view-card__profile">
          <img
            className="franchise-employee-view-card__avatar"
            src={franchiseEmployeeProfileImageSrc(employee.profile_url)}
            alt=""
          />
          <h5 className="franchise-employee-view-card__name">
            {employee.name ?? "-"}
          </h5>
        </div>

        <div className="franchise-employee-view-card__fields">
          {detailFields.map(({ label, value }) => (
            <div key={label} className="franchise-employee-view-card__field">
              <span className="franchise-employee-view-card__label">
                {label}
              </span>
              <span className="franchise-employee-view-card__value">
                {value}
              </span>
            </div>
          ))}
          <div className="franchise-employee-view-card__field">
            <span className="franchise-employee-view-card__label">
              Screen Permissions
            </span>
            <div className="franchise-employee-view-card__value">
              {screenPermissionLabels.length > 0 ? (
                <ul className="franchise-employee-view-card__perm-list mb-0">
                  {screenPermissionLabels.map((label, i) => (
                    <li key={`${label}-${i}`}>{label}</li>
                  ))}
                </ul>
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderFormBody = () => (
    <form
      noValidate
      id="franchise-employee-form"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit(onSubmitForm)(e);
      }}
    >
      <div className="row g-2 franchise-employee-form-fields">
        <div className="col-12">
          <CustomImageUploader
            label="Profile photo"
            maxFiles={1}
            isEditable={Boolean(employee)}
            {...(profileUrl ? { existingImages: [profileUrl] } : {})}
            onFileChange={(files) => {
              const f = files[0] ?? null;
              setProfileImageFile(f);
              if (!employee) {
                setProfileUrl("");
                return;
              }
              if (f) {
                setProfileUrl(`uploads/${f.name}`);
                return;
              }
              setProfileUrl((prev) => prev);
            }}
          />
        </div>
        <div className="col-12">
          <CustomTextField
            label="Name"
            controlId="name"
            placeholder="Enter Name"
            register={register}
            error={errors.name}
            validation={{
              validate: (v: string) =>
                isNonEmptyName(v) || "Name cannot be empty.",
            }}
            value={watch("name") ?? ""}
            onChange={(v) =>
              setValue("name", v, { shouldDirty: true, shouldValidate: false })
            }
          />
        </div>
        <div className="col-12">
          <Row className="align-items-start franchise-employee-field-row">
            <Col sm={4} className="d-flex align-items-start">
              <label className="custom-profile-lable mb-0">Date of Birth</label>
            </Col>
            <Col>
              <CustomDatePicker
                label=""
                controlId="franchise_emp_date_of_birth"
                asCol={false}
                birthDatePicker
                selectedDate={dateOfBirth ? dateOfBirth : null}
                placeholderText="Select date of birth"
                register={register as unknown as UseFormRegister<any>}
                setValue={setValue as unknown as UseFormSetValue<any>}
                groupClassName="mb-0 w-100 franchise-employee-dob-field"
                onChange={(date) => {
                  const value = date ? dateToLocalYmd(date) : "";
                  setDateOfBirth(value);
                }}
              />
            </Col>
          </Row>
        </div>
        <div className="col-12">
          <CustomTextField
            label="Email"
            controlId="email"
            placeholder="name@example.com"
            register={register}
            error={errors.email}
            validation={{
              validate: (v: string) =>
                isValidUserEmail(v) || "Enter a valid email address.",
            }}
            inputType="email"
            value={watch("email") ?? ""}
            onChange={(v) =>
              setValue("email", v, { shouldDirty: true, shouldValidate: false })
            }
          />
        </div>
        <div className="col-12">
          <CustomTextFieldIndiaMobile
            label="Phone number"
            controlId="phone"
            placeholder="Mobile number"
            register={register}
            value={watch("phone") ?? ""}
            onChange={(v) =>
              setValue("phone", v, { shouldDirty: true, shouldValidate: false })
            }
          />
        </div>
        <div className="col-12">
          <Row className="align-items-start franchise-employee-field-row">
            <Col sm={4} className="d-flex align-items-start">
              <label className="custom-profile-lable mb-0">Gender</label>
            </Col>
            <Col>
              <GenderRadioField
                value={gender}
                showLabel={false}
                className="mb-0"
                onChange={(next) => setGender(next)}
              />
            </Col>
          </Row>
        </div>
        {isAdd ? (
          <>
            <div className="col-12">
              <CustomTextField
                label="Password"
                controlId="password"
                placeholder="Enter Password"
                register={register}
                error={errors.password}
                inputType="password"
                autoComplete="new-password"
                validation={{
                  validate: (v: string) =>
                    validateStrongPassword(v) ?? true,
                }}
                value={watch("password") ?? ""}
                onChange={(v) =>
                  setValue("password", v, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </div>
            <div className="col-12">
              <CustomTextField
                label="Confirm password"
                controlId="confirmPassword"
                placeholder="Re-enter password"
                register={register}
                error={errors.confirmPassword}
                inputType="password"
                autoComplete="new-password"
                validation={{
                  validate: (v: string) =>
                    passwordsMatch(getValues("password"), v) ||
                    "Passwords do not match.",
                }}
                value={watch("confirmPassword") ?? ""}
                onChange={(v) =>
                  setValue("confirmPassword", v, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </div>
          </>
        ) : null}
        <div className="col-12">
          <Row className="align-items-center mb-3">
            <Col sm={4} className="d-flex align-items-center">
              <label className="custom-profile-lable">Chat</label>
            </Col>
            <Col>
              <Form.Check
                type="switch"
                id="franchise-employee-form-chat"
                className={`franchise-status-switch${
                  isActiveBool && chatEnabled
                    ? " franchise-status-switch--on"
                    : ""
                }`}
                checked={isActiveBool ? Boolean(chatEnabled) : false}
                disabled={!isActiveBool}
                aria-label={
                  !isActiveBool
                    ? "Chat unavailable when employee is inactive"
                    : chatEnabled
                    ? "Chat on, switch to turn off"
                    : "Chat off, switch to turn on"
                }
                title={
                  isActiveBool
                    ? "Chat on / off"
                    : "Inactive employees cannot use chat"
                }
                onChange={(e) => {
                  setValue("chat_enabled", e.target.checked, {
                    shouldValidate: true,
                  });
                }}
              />
            </Col>
          </Row>
        </div>
        <div className="col-12">
          <CustomTextFieldRadio
            key={`emp-status-${employee?._id ?? "new"}-${isEditing}`}
            label="Status"
            name="is_active"
            options={getStatusOptions()}
            defaultValue={
              isAdd ? "true" : employee ? String(employee.is_active) : "true"
            }
            isEditable
            setValue={setValue}
          />
        </div>
        <div className="col-12 mb-1">
          <ScreenPermissionChecklist
            idPrefix="franchise_emp_screen"
            title="Screen permissions"
            headClassName="fw-medium mb-1 mt-3"
            items={franchiseScreenMenuItems}
            selectedKeys={screenPermissionKeys}
            onChange={setScreenPermissionKeys}
          />
        </div>
      </div>
      <Row className="mt-4">
        <Col xs={12} className="text-center d-flex justify-content-end gap-3">
          <Button type="submit" className="custom-btn-primary">
            {isAdd ? "Add" : "Update"}
          </Button>
          <Button
            type="button"
            className="custom-btn-secondary"
            onClick={() => {
              if (!isAdd && isEditing) {
                setIsEditing(false);
                return;
              }
              onClose();
            }}
          >
            Cancel
          </Button>
        </Col>
      </Row>
    </form>
  );

  return (
    <Modal
      show={true}
      size="lg"
      onHide={onClose}
      centered
      scrollable
      dialogClassName="custom-big-modal"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          {modalTitle}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        {!isAdd && !isEditing && renderViewBody()}
        {(isAdd || isEditing) && renderFormBody()}
      </Modal.Body>
    </Modal>
  );
};

FranchiseEmployeeDialog.showAdd = (
  onRefreshData: () => void | Promise<void>
) => {
  openDialog("franchise-employee-modal", (close) => (
    <FranchiseEmployeeDialog
      mode="add"
      employee={null}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

FranchiseEmployeeDialog.showView = (
  employee: EmployeeRow,
  onRefreshData: () => void | Promise<void>
) => {
  openDialog("franchise-employee-modal", (close) => (
    <FranchiseEmployeeDialog
      mode="view-edit"
      employee={employee}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default FranchiseEmployeeDialog;
