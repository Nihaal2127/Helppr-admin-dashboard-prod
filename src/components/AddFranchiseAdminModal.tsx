import React, { useEffect, useMemo, useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import { useForm } from "react-hook-form";
import CustomCloseButton from "./CustomCloseButton";
import { CustomFormInput } from "./CustomFormInput";
import { CustomFormIndiaMobile } from "./CustomFormIndiaMobile";
import CustomFormSelect from "./CustomFormSelect";
import CustomImageUploader from "./CustomImageUploader";
import { createRoleUserWithApi } from "../services/settingsService";
import {
  fetchFranchiseDropDown,
  FranchiseDropDownOption,
} from "../services/franchiseService";
import {
  fullPhoneFromIndiaNational,
  isValidE164StylePhone,
  isValidUserEmail,
  passwordsMatch,
  sanitizeIndiaNationalPhoneInput,
  validateStrongPassword,
} from "../lib/user/userFormValidation";
import { showErrorAlert } from "../lib/global/alertHelper";
import { openDialog } from "../lib/global/DialogManager";
import GenderRadioField from "./GenderRadioField";
import CustomDatePicker from "./CustomDatePicker";
import { dateToLocalYmd } from "../helper/dateFormat";
import { FieldLabelText } from "./RequiredFieldMark";

const MODAL_DOM_ID = "add-franchise-admin-nested-dialog";

type GenderField = "male" | "female" | "others";

type Props = {
  onClose: () => void;
  /** Called after successful create with new Mongo user id when available. */
  onSuccess: (newUserId?: string) => void;
};

type FormState = {
  roleName: string;
  email: string;
  phone_number: string;
  gender: GenderField;
  date_of_birth: string;
  password: string;
  confirmPassword: string;
  assignedFranchise: string;
  status: "active" | "inactive";
  profile_url: string;
};

const emptyForm: FormState = {
  roleName: "",
  email: "",
  phone_number: "",
  gender: "male",
  date_of_birth: "",
  password: "",
  confirmPassword: "",
  assignedFranchise: "",
  status: "active",
  profile_url: "",
};

/**
 * Inline “Add Franchise Admin” used from Franchise Management (stacked over Add Franchise).
 */
const AddFranchiseAdminModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const { register, setValue } = useForm<any>();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [roleImageFile, setRoleImageFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [franchiseAssignedAdminDropdownOptions, setFranchiseAssignedAdminDropdownOptions] =
    useState<FranchiseDropDownOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await fetchFranchiseDropDown({ assignedAdminDropdown: true });
      if (!cancelled) setFranchiseAssignedAdminDropdownOptions(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const assignedFranchiseOptions = useMemo(() => {
    const options = franchiseAssignedAdminDropdownOptions.map((o) => ({
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
    return [
      { value: "", label: "Select Franchise" },
      ...options,
    ];
  }, [franchiseAssignedAdminDropdownOptions, form.assignedFranchise]);

  const franchiseMetaByName = useMemo(() => {
    const map = new Map<string, FranchiseDropDownOption>();
    franchiseAssignedAdminDropdownOptions.forEach((option) => {
      if (!map.has(option.label)) map.set(option.label, option);
    });
    return map;
  }, [franchiseAssignedAdminDropdownOptions]);

  const submit = async () => {
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
    const pwErr = validateStrongPassword(form.password);
    if (pwErr) {
      showErrorAlert(pwErr);
      return;
    }
    if (!passwordsMatch(form.password, form.confirmPassword)) {
      showErrorAlert("Password and confirm password do not match.");
      return;
    }

    const rolePayload = {
      roleId: `ROLE-${Date.now()}`,
      roleName: form.roleName.trim(),
      email: form.email.trim(),
      phone_number: rolePhoneFull,
      gender: form.gender,
      date_of_birth: form.date_of_birth.trim() || undefined,
      profile_url: form.profile_url.trim() || undefined,
      roleType: "franchise_admin" as const,
      assignedFranchise: form.assignedFranchise || undefined,
      franchise_id:
        (form.assignedFranchise &&
          franchiseMetaByName.get(form.assignedFranchise)?.value) ||
        undefined,
      state_id:
        (form.assignedFranchise &&
          franchiseMetaByName.get(form.assignedFranchise)?.state_id) ||
        undefined,
      city_id:
        (form.assignedFranchise &&
          franchiseMetaByName.get(form.assignedFranchise)?.city_id) ||
        undefined,
      status: form.status,
      screenPermissions: [],
    };

    setPending(true);
    try {
      const result = await createRoleUserWithApi(
        rolePayload,
        roleImageFile ?? undefined,
        form.password.trim()
      );
      if (result.ok) {
        onSuccess(result.newUserId);
        onClose();
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      show
      onHide={onClose}
      centered
      enforceFocus={false}
      backdrop="static"
      dialogClassName="modal-dialog-scrollable"
      style={{ zIndex: 1060 }}
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          Add Franchise Admin
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body
        className="px-4 pb-4 pt-0"
        style={{ maxHeight: "70vh", overflowY: "auto" }}
      >
        <div className="row g-2">
          <div className="col-md-12">
            <CustomFormInput
              label="Name"
              controlId="nested_role_name"
              placeholder="Enter Name"
              register={register}
              asCol={false}
              showRequiredMark
              value={form.roleName}
              onChange={(value: string) =>
                setForm((p) => ({ ...p, roleName: value }))
              }
            />
          </div>
          <div className="col-md-12">
            <CustomDatePicker
              label="Date of Birth"
              controlId="nested_role_date_of_birth"
              asCol={false}
              birthDatePicker
              required
              selectedDate={form.date_of_birth ? form.date_of_birth : null}
              placeholderText="Select date of birth"
              register={register}
              setValue={setValue}
              onChange={(date) => {
                const value = date ? dateToLocalYmd(date) : "";
                setForm((p) => ({ ...p, date_of_birth: value }));
                setValue("nested_role_date_of_birth", value);
              }}
            />
          </div>
          <div className="col-md-12">
            <CustomFormInput
              label="Email"
              controlId="nested_role_email"
              placeholder="name@example.com"
              register={register}
              inputType="email"
              asCol={false}
              showRequiredMark
              value={form.email}
              onChange={(value: string) =>
                setForm((p) => ({ ...p, email: value }))
              }
            />
          </div>
          <div className="col-md-12">
            <CustomFormIndiaMobile
              label="Phone number"
              controlId="nested_role_phone"
              placeholder="Mobile number"
              register={register}
              asCol={false}
              validation={{ required: true }}
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
              required
            />
          </div>
          <div className="col-md-12">
            <CustomFormInput
              label="Password"
              controlId="nested_role_password"
              placeholder="Enter new Password"
              register={register}
              inputType="password"
              asCol={false}
              autoComplete="new-password"
              showRequiredMark
              value={form.password}
              onChange={(value: string) =>
                setForm((p) => ({ ...p, password: value }))
              }
            />
          </div>
          <div className="col-md-12">
            <CustomFormInput
              label="Confirm password"
              controlId="nested_role_confirm_password"
              placeholder="Re-enter password"
              register={register}
              inputType="password"
              asCol={false}
              autoComplete="new-password"
              showRequiredMark
              value={form.confirmPassword}
              onChange={(value: string) =>
                setForm((p) => ({ ...p, confirmPassword: value }))
              }
            />
          </div>
          <div className="col-md-12">
            <label
              className="form-label fw-medium mb-2 d-block"
              style={{ color: "var(--content-txt-color)" }}
            >
              <FieldLabelText label="Profile photo" required />
            </label>
            <CustomImageUploader
              label="Profile photo"
              hideLabel
              maxFiles={1}
              isEditable={false}
              onFileChange={(files) => {
                const f = files[0] ?? null;
                setRoleImageFile(f);
                setForm((p) => ({ ...p, profile_url: "" }));
              }}
            />
          </div>
          <div className="col-md-12">
            <CustomFormSelect
              label="Assigned Franchise"
              controlId="nested_assigned_franchise"
              options={assignedFranchiseOptions}
              register={register}
              fieldName="nested_assigned_franchise"
              asCol={false}
              defaultValue={form.assignedFranchise}
              setValue={setValue}
              onChange={(e) => {
                const raw = e.target.value;
                setForm((p) => ({ ...p, assignedFranchise: raw }));
              }}
              menuPortal
            />
          </div>
          <div className="col-md-12">
            <Form.Group style={{ marginTop: "10px" }}>
              <Form.Label className="fw-medium mb-1">
                <FieldLabelText label="Status" required />
              </Form.Label>
              <div className="d-flex" style={{ flexDirection: "row", gap: "8px" }}>
                <Form.Check
                  type="radio"
                  id="nested_role_status_active"
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
                  id="nested_role_status_inactive"
                  label={<span className="custom-radio-text">Inactive</span>}
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
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          className="btn-danger"
          disabled={pending}
          onClick={() => void submit()}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export function openAddFranchiseAdminModal(
  onCreated: (info: { userId?: string }) => void
): void {
  if (document.getElementById(MODAL_DOM_ID)) return;
  openDialog(MODAL_DOM_ID, (close) => (
    <AddFranchiseAdminModal
      onClose={close}
      onSuccess={(userId) => onCreated({ userId })}
    />
  ));
}

export default AddFranchiseAdminModal;
