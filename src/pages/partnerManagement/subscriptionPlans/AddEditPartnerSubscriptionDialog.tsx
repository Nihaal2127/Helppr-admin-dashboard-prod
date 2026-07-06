import React, { useEffect, useMemo, useState } from "react";
import type { FieldErrors } from "react-hook-form";
import { useForm, UseFormRegister } from "react-hook-form";
import { Modal, Button, Row, Col, Form } from "react-bootstrap";
import CustomCloseButton from "../../../components/CustomCloseButton";
import { CustomFormInput } from "../../../components/CustomFormInput";
import CustomFormSelect from "../../../components/CustomFormSelect";
import CustomDatePicker from "../../../components/CustomDatePicker";
import CustomImageUploader from "../../../components/CustomImageUploader";
import { DetailsRow } from "../../../helper/utility";
import { openDialog } from "../../../lib/global/DialogManager";
import { savePartnerSubscription } from "../../../services/partnerManagementService";
import { fetchSubscriptionPlanDropDown } from "../../../services/partnerManagementService";
import { fetchUser } from "../../../services/userService";
import { showErrorAlert } from "../../../lib/global/alertHelper";
import type { PartnerSubscriptionModel } from "../../../lib/types/partnerManagementTypes";
import { dateToLocalYmd } from "../../../helper/dateFormat";

type AddEditPartnerSubscriptionDialogProps = {
  isEditable: boolean;
  subscription: PartnerSubscriptionModel | null;
  onClose: () => void;
  onRefreshData: () => void;
};

type PartnerInfoModel = {
  partner_id: string;
  partner_name: string;
  email: string;
  phone: string;
  location: string;
  joined_date: string;
  status: string;
  description: string;
};

type PartnerInfoDialogProps = {
  partner: PartnerInfoModel;
  onClose: () => void;
};

const defaultSubscriptionPlanOptions = [
  { value: "basic", label: "Basic" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "platinum", label: "Platinum" },
];

/* Address / location select options (kept when address UI is re-enabled)
const locationOptions = [
    { value: "Hyderabad", label: "Hyderabad" },
    { value: "Vijayawada", label: "Vijayawada" },
    { value: "Visakhapatnam", label: "Visakhapatnam" },
    { value: "Warangal", label: "Warangal" },
];
*/

const labelStyle: React.CSSProperties = {
  fontWeight: 600,
  color: "#2b2b2b",
  fontSize: "15px",
  marginBottom: "6px",
};

const valueStyle: React.CSSProperties = {
  color: "#555",
  fontSize: "15px",
  lineHeight: "22px",
  wordBreak: "break-word",
};

const PartnerInfoDialog: React.FC<PartnerInfoDialogProps> & {
  show: (partner: PartnerInfoModel) => void;
} = ({ partner, onClose }) => {
  const statusClass =
    partner.status === "Active"
      ? "text-success fw-semibold text-capitalize"
      : "text-warning fw-semibold text-capitalize";

  return (
    <Modal show={true} onHide={onClose} centered size="lg">
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          Partner Information
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>

      <Modal.Body className="px-4 pb-4 pt-0">
        <div className="custom-other-details" style={{ padding: "16px" }}>
          <Row className="align-items-center mb-4">
            <Col>
              <h3 className="mb-0" style={{ color: "#000" }}>
                Partner
              </h3>
            </Col>

            <Col className="text-end">
              <i
                className="bi bi-pencil-fill"
                style={{
                  cursor: "pointer",
                  color: "var(--primary-color)",
                }}
              />
            </Col>
          </Row>

          <Row className="g-4">
            <Col md={6}>
              <div style={labelStyle}>Partner Name</div>
              <div style={valueStyle}>{partner.partner_name || "-"}</div>
            </Col>

            <Col md={6}>
              <div style={labelStyle}>Email</div>
              <div style={valueStyle}>{partner.email || "-"}</div>
            </Col>

            <Col md={6}>
              <div style={labelStyle}>Phone</div>
              <div style={valueStyle}>{partner.phone || "-"}</div>
            </Col>

            <Col md={6}>
              <div style={labelStyle}>Location</div>
              <div style={valueStyle}>{partner.location || "-"}</div>
            </Col>

            <Col md={6}>
              <div style={labelStyle}>Joined Date</div>
              <div style={valueStyle}>{partner.joined_date || "-"}</div>
            </Col>

            <Col md={6}>
              <div style={labelStyle}>Status</div>
              <div style={valueStyle} className={statusClass}>
                {partner.status || "-"}
              </div>
            </Col>

            <Col md={12}>
              <div style={labelStyle}>Description</div>
              <div style={valueStyle}>{partner.description || "-"}</div>
            </Col>
          </Row>
        </div>
      </Modal.Body>
    </Modal>
  );
};

PartnerInfoDialog.show = (partner: PartnerInfoModel) => {
  openDialog("partner-info-dialog", (close) => (
    <PartnerInfoDialog partner={partner} onClose={close} />
  ));
};

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.onerror = () => reject(new Error("Unable to read file"));
    fr.readAsDataURL(file);
  });
}

const AddEditPartnerSubscriptionDialog: React.FC<AddEditPartnerSubscriptionDialogProps> & {
  show: (
    isEditable: boolean,
    subscription: PartnerSubscriptionModel | null,
    onRefreshData: () => void
  ) => void;
} = ({ isEditable, subscription, onClose, onRefreshData }) => {
  const initialData: PartnerSubscriptionModel = useMemo(
    () =>
      subscription || {
        _id: "",
        partner_id: "",
        partner_name: "",
        subscription_plan: "",
        subscription_plan_id: "",
        subscription_start_date: "",
        subscription_end_date: "",
        rating: "",
        location: "",
        address: "",
        banner_image: "",
        notes: "",
        is_active: undefined as any,
      },
    [subscription]
  );

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors },
    reset,
  } = useForm<PartnerSubscriptionModel>({
    defaultValues: initialData,
  });

  const [viewData, setViewData] =
    useState<PartnerSubscriptionModel>(initialData);
  const [forceForm, setForceForm] = useState(false);
  const [platinumBannerFiles, setPlatinumBannerFiles] = useState<File[]>([]);
  const [planSelectOptions, setPlanSelectOptions] = useState<
    { value: string; label: string }[]
  >(defaultSubscriptionPlanOptions);
  const [partnerSelectOptions, setPartnerSelectOptions] = useState<
    { value: string; label: string }[]
  >([]);

  const watchedPlan = (watch("subscription_plan") || "")
    .toString()
    .toLowerCase();
  const isPlatinumPlan = (plan: string) =>
    (plan || "").toLowerCase() === "platinum";

  const viewOnly = !isEditable && !forceForm && !!subscription;
  const addMode = isEditable && !subscription;

  useEffect(() => {
    reset(initialData);
    setViewData(initialData);
    setForceForm(false);
    setPlatinumBannerFiles([]);
  }, [initialData, reset]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const opts = await fetchSubscriptionPlanDropDown();
      if (!cancelled && opts.length > 0) {
        setPlanSelectOptions(opts);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Type `2` = Partner — same source pattern as `AddPayoutDialog`. */
  useEffect(() => {
    if (!addMode) {
      setPartnerSelectOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const pageSize = 250;
      const first = await fetchUser(false, 2, 1, pageSize, { status: "true" });
      if (cancelled) return;
      if (!first.response) {
        setPartnerSelectOptions([]);
        return;
      }
      let all = [...first.users];
      for (let page = 2; page <= first.totalPages; page++) {
        const next = await fetchUser(false, 2, page, pageSize, {
          status: "true",
        });
        if (cancelled) return;
        if (next.response) {
          all = all.concat(next.users);
        }
      }
      const opts = all
        .map((u) => {
          const id = String(u._id ?? (u as { id?: string }).id ?? "").trim();
          const rawName = (u.name ?? "").trim();
          const email = (u.email ?? "").trim();
          const label = rawName || email || id;
          return id ? { value: id, label } : null;
        })
        .filter((x): x is { value: string; label: string } => x != null);
      opts.sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
      );
      setPartnerSelectOptions(opts);
    })();
    return () => {
      cancelled = true;
    };
  }, [addMode]);

  useEffect(() => {
    if (!isPlatinumPlan(watchedPlan)) {
      setValue("banner_image", "", { shouldValidate: false });
      setPlatinumBannerFiles([]);
    }
  }, [watchedPlan, setValue]);

  const handleCancel = (): void => {
    if (!isEditable && forceForm) {
      setForceForm(false);
      reset(initialData);
      setViewData(initialData);
      setPlatinumBannerFiles([]);
      return;
    }
    onClose();
  };

  const onSubmitEvent = async (data: PartnerSubscriptionModel) => {
    let banner = (data.banner_image ?? "").trim();
    if (
      platinumBannerFiles.length > 0 &&
      isPlatinumPlan(data.subscription_plan)
    ) {
      try {
        banner = await readFileAsDataUrl(platinumBannerFiles[0]);
      } catch {
        /* keep typed URL if read fails */
      }
    }
    const resolvedIsActive =
      typeof data.is_active === "string"
        ? data.is_active === "true"
        : data.is_active !== undefined && data.is_active !== null
        ? Boolean(data.is_active)
        : viewData.is_active;

    /** `getValues()` last — react-select fields are updated via `setValue` and can be missing from `handleSubmit` `data`. */
    const merged = { ...viewData, ...data, ...getValues() };
    /** Prefer row id from props so update PUT always gets the correct `:id` even if `_id` is missing from merged form state. */
    const recordId = String(subscription?._id || merged._id || "").trim();
    let payload: PartnerSubscriptionModel = {
      ...merged,
      _id: recordId,
      banner_image: banner,
      is_active: resolvedIsActive,
    };
    const ok = await savePartnerSubscription(payload);
    if (!ok) return;
    setViewData(payload);
    reset(payload);
    onRefreshData();
    setPlatinumBannerFiles([]);
    if (addMode) {
      onClose();
      return;
    }
    if (!isEditable && forceForm) {
      setForceForm(false);
    } else if (isEditable) {
      onClose();
    }
  };

  const onSubmitInvalid = (errs: FieldErrors<PartnerSubscriptionModel>) => {
    const first = Object.values(errs).find(
      (e) => e && typeof e === "object" && "message" in e
    ) as { message?: string } | undefined;
    showErrorAlert(
      first?.message?.trim() || "Please fix the form errors and try again."
    );
  };

  const modalTitle = viewOnly
    ? "Partner Subscription Information"
    : addMode
    ? "Add Partner Subscription"
    : "Edit Partner Subscription";

  const statusText = viewData.is_active ? (
    <span className="text-success fw-semibold text-capitalize">Active</span>
  ) : (
    <span className="text-danger fw-semibold text-capitalize">Inactive</span>
  );

  const subscriptionStartStr = watch("subscription_start_date");
  const subscriptionEndStr = watch("subscription_end_date");
  const toYmdString = (v: unknown): string | null => {
    if (v == null || v === "") return null;
    if (typeof v === "string") return v.length >= 10 ? v.slice(0, 10) : v;
    if (v instanceof Date && !Number.isNaN(v.getTime()))
      return dateToLocalYmd(v);
    return null;
  };

  return (
    <Modal show={true} onHide={onClose} centered size="lg" enforceFocus={false}>
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          {modalTitle}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>

      {viewOnly ? (
        <>
          <Modal.Body
            className="px-4 pb-4 pt-0"
            style={{ maxHeight: "70vh", overflowY: "auto" }}
          >
            <div className="custom-other-details" style={{ padding: "10px" }}>
              <Row className="align-items-center mb-2">
                <Col>
                  <h3 className="mb-0">Partner</h3>
                </Col>
                <Col xs="auto" className="text-end">
                  <i
                    className="bi bi-pencil-square fs-5"
                    role="button"
                    title="Edit"
                    onClick={() => setForceForm(true)}
                    style={{ cursor: "pointer", color: "var(--primary-color)" }}
                  />
                </Col>
              </Row>

              <Row>
                <Col md={6} className="custom-helper-column">
                  <DetailsRow
                    title="Partner Name"
                    value={viewData.partner_name || "-"}
                  />
                  <DetailsRow
                    title="Subscription Plan"
                    value={viewData.subscription_plan || "-"}
                  />
                  <DetailsRow
                    title="Start Date"
                    value={viewData.subscription_start_date || "-"}
                  />
                </Col>
                <Col md={6} className="custom-helper-column">
                  <DetailsRow
                    title="End Date"
                    value={viewData.subscription_end_date || "-"}
                  />
                  <DetailsRow title="Status" value={statusText} />
                </Col>
              </Row>
              {isPlatinumPlan(viewData.subscription_plan) &&
              (viewData.banner_image || "").trim() ? (
                <Row className="mt-3">
                  <Col md={6}>
                    <div className="fw-medium mb-2">Banner image</div>
                    <div
                      className="border rounded overflow-hidden"
                      style={{ maxWidth: "100%" }}
                    >
                      <img
                        src={viewData.banner_image}
                        alt="Banner"
                        style={{
                          width: "100%",
                          maxHeight: 220,
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </div>
                  </Col>
                </Row>
              ) : isPlatinumPlan(viewData.subscription_plan) ? (
                <Row className="mt-3">
                  <Col md={12}>
                    <DetailsRow title="Banner image" value="—" />
                  </Col>
                </Row>
              ) : null}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </Modal.Footer>
        </>
      ) : (
        <Form
          noValidate
          id="partner-subscription-form"
          onSubmit={handleSubmit(onSubmitEvent, onSubmitInvalid)}
        >
          <Modal.Body
            className="px-4 pb-4 pt-0"
            style={{
              overflow: "visible",
              maxHeight: "min(90vh, calc(100vh - 140px))",
            }}
          >
            <div className="pt-1">
              <Row className="gx-3 gy-2">
                <Col md={6}>
                  {addMode ? (
                    <CustomFormSelect
                      label="Partner"
                      controlId="partner_id"
                      options={partnerSelectOptions}
                      register={register as unknown as UseFormRegister<any>}
                      fieldName="partner_id"
                      error={errors.partner_id as any}
                      asCol={false}
                      defaultValue={viewData.partner_id || ""}
                      setValue={(name: string, value: any) =>
                        setValue(name as keyof PartnerSubscriptionModel, value)
                      }
                      placeholder="Search and select partner"
                      menuPortal
                      onChange={(e) => {
                        const id = (e.target as HTMLSelectElement).value;
                        const opt = partnerSelectOptions.find(
                          (o) => o.value === id
                        );
                        setValue("partner_name", opt?.label ?? "", {
                          shouldValidate: false,
                          shouldDirty: true,
                        });
                      }}
                    />
                  ) : (
                    <CustomFormInput
                      label="Partner Name"
                      controlId="partner_name"
                      placeholder="—"
                      register={register}
                      error={errors.partner_name}
                      asCol={false}
                      isEditable={false}
                    />
                  )}
                </Col>

                <Col md={6}>
                  <CustomFormSelect
                    label="Subscription Plan"
                    controlId="subscription_plan_id"
                    options={planSelectOptions}
                    register={register as unknown as UseFormRegister<any>}
                    fieldName="subscription_plan_id"
                    error={errors.subscription_plan_id as any}
                    asCol={false}
                    defaultValue={
                      viewData.subscription_plan_id ||
                      viewData.subscription_plan ||
                      ""
                    }
                    setValue={(name: string, value: any) =>
                      setValue(name as keyof PartnerSubscriptionModel, value)
                    }
                    placeholder="Select subscription plan"
                    menuPortal
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      const opt = planSelectOptions.find((o) => o.value === v);
                      const slug = (opt?.label ?? "")
                        .trim()
                        .toLowerCase()
                        .replace(/\s+/g, "");
                      setValue("subscription_plan", slug, {
                        shouldValidate: false,
                      });
                    }}
                  />
                </Col>

                <Col md={6}>
                  <CustomDatePicker
                    label="Subscription Start Date"
                    controlId="subscription_start_date"
                    selectedDate={toYmdString(subscriptionStartStr)}
                    onChange={(date) => {
                      const value = date ? dateToLocalYmd(date) : "";
                      setValue("subscription_start_date", value, {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }}
                    register={register as unknown as UseFormRegister<any>}
                    setValue={setValue as any}
                    asCol={false}
                    groupClassName="mb-0 w-100 fw-medium"
                    placeholderText="Start date"
                    filterDate={() => true}
                    validation={{
                      required: "Subscription start date is required",
                    }}
                    error={errors.subscription_start_date}
                  />
                </Col>

                <Col md={6}>
                  <CustomDatePicker
                    label="Subscription End Date"
                    controlId="subscription_end_date"
                    selectedDate={toYmdString(subscriptionEndStr)}
                    onChange={(date) => {
                      const value = date ? dateToLocalYmd(date) : "";
                      setValue("subscription_end_date", value, {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }}
                    register={register as unknown as UseFormRegister<any>}
                    setValue={setValue as any}
                    asCol={false}
                    groupClassName="mb-0 w-100 fw-medium"
                    placeholderText="End date"
                    filterDate={() => true}
                    validation={{
                      required: "Subscription end date is required",
                    }}
                    error={errors.subscription_end_date}
                  />
                </Col>

                {isPlatinumPlan(watchedPlan) && (
                  <Col md={12}>
                    <CustomImageUploader
                      label="Upload banner image"
                      maxFiles={1}
                      isEditable={true}
                      existingImages={[]}
                      onFileChange={(files) => setPlatinumBannerFiles(files)}
                    />
                    <small className="text-muted d-block mt-1">
                      Only jpg, jpeg & png files are allowed
                    </small>
                  </Col>
                )}

                <Col md={12}>
                  <Form.Group style={{ marginTop: "10px" }}>
                    <Form.Label className="fw-medium mb-1">Status</Form.Label>
                    <div
                      className="d-flex"
                      style={{ flexDirection: "row", gap: "8px" }}
                    >
                      <Form.Check
                        type="radio"
                        id="partner_subscription_status_active"
                        label={
                          <span className="custom-radio-text">Active</span>
                        }
                        value="true"
                        checked={!!viewData.is_active}
                        onChange={() => {
                          setValue("is_active", true as any, {
                            shouldValidate: true,
                          });
                          setViewData((prev) => ({ ...prev, is_active: true }));
                        }}
                        className="custom-radio-check"
                      />
                      <Form.Check
                        type="radio"
                        id="partner_subscription_status_inactive"
                        label={
                          <span className="custom-radio-text">Inactive</span>
                        }
                        value="false"
                        checked={!viewData.is_active}
                        onChange={() => {
                          setValue("is_active", false as any, {
                            shouldValidate: true,
                          });
                          setViewData((prev) => ({
                            ...prev,
                            is_active: false,
                          }));
                        }}
                        className="custom-radio-check"
                      />
                    </div>
                  </Form.Group>
                </Col>
              </Row>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" type="button" onClick={handleCancel}>
              Cancel
            </Button>
            <Button className="btn-danger" type="submit">
              {addMode ? "Save" : "Update"}
            </Button>
          </Modal.Footer>
        </Form>
      )}
    </Modal>
  );
};

AddEditPartnerSubscriptionDialog.show = (
  isEditable: boolean,
  subscription: PartnerSubscriptionModel | null,
  onRefreshData: () => void
) => {
  openDialog("details-modal", (close) => (
    <AddEditPartnerSubscriptionDialog
      isEditable={isEditable}
      subscription={subscription}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default AddEditPartnerSubscriptionDialog;
