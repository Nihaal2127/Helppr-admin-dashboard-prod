import React, { useEffect, useRef, useState } from "react";
import {
  useForm,
  UseFormRegister,
  Controller,
  FieldError,
} from "react-hook-form";
import { Modal, Button, Row, Col, Form } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { AreaModel } from "../../lib/models/AreaModel";
import { CustomFormInput } from "../../components/CustomFormInput";
import CustomFormSelect from "../../components/CustomFormSelect";
import { CustomRadioSelection } from "../../components/CustomRadioSelection";
import { DetailsRow, getStatusOptions } from "../../helper/utility";
import { showErrorAlert } from "../../lib/global/alertHelper";
import { createOrUpdateArea } from "../../services/areaService";
import { fetchStateDropDown } from "../../services/stateService";
import { fetchCityDropDown } from "../../services/cityService";
import { openDialog } from "../../lib/global/DialogManager";

type PincodeTagFieldProps = {
  value: string[];
  onChange: (next: string[]) => void;
  onBlur: () => void;
  error?: FieldError;
  placeholder?: string;
  label?: string;
};

const PincodeTagField: React.FC<PincodeTagFieldProps> = ({
  value,
  onChange,
  onBlur,
  error,
  placeholder = "Enter pincode(6 digits)",
  label = "Pin codes",
}) => {
  const [rows, setRows] = useState<string[]>(value.length ? [...value] : [""]);

  useEffect(() => {
    setRows(value.length ? [...value] : [""]);
  }, [value]);

  /** Emit non-empty trimmed codes only (order preserved; duplicates kept so rows stay in sync until user fixes). */
  const emitCodes = (nextRows: string[]) => {
    const codes = nextRows
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    onChange(codes);
  };

  const duplicateCompletePinsMessage = React.useMemo(() => {
    const completeSix = rows
      .map((r) => r.trim())
      .filter((r) => r.length === 6 && /^\d{6}$/.test(r));
    const freq = new Map<string, number>();
    completeSix.forEach((p) => freq.set(p, (freq.get(p) ?? 0) + 1));
    const hasDup = Array.from(freq.values()).some((n) => n > 1);
    return hasDup ? "Already this pincode entered" : "";
  }, [rows]);

  const pincodeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!duplicateCompletePinsMessage) return;
    const el = pincodeScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [duplicateCompletePinsMessage, rows]);

  const updateRow = (index: number, nextValue: string) => {
    const numericOnly = nextValue.replace(/\D/g, "").slice(0, 6);
    const nextRows = rows.map((row, i) => (i === index ? numericOnly : row));
    setRows(nextRows);
    emitCodes(nextRows);
  };

  const addRow = () => {
    setRows((prev) => [...prev, ""]);
  };

  const removeRow = (index: number) => {
    const nextRows = rows.filter((_, i) => i !== index);
    const normalizedRows = nextRows.length ? nextRows : [""];
    setRows(normalizedRows);
    emitCodes(normalizedRows);
  };

  return (
    <Form.Group as="div" controlId="pincode">
      {label?.trim() && <Form.Label className="fw-medium">{label}</Form.Label>}
      <div
        className={error || duplicateCompletePinsMessage ? "is-invalid" : ""}
      >
        <div
          ref={pincodeScrollRef}
          style={{ maxHeight: "180px", overflowY: "auto", paddingRight: "4px" }}
        >
          {rows.map((pin, index) => {
            const isLast = index === rows.length - 1;
            return (
              <div
                className="d-flex align-items-end gap-2 mb-2"
                key={`pincode-row-${index}`}
              >
                <Form.Control
                  type="text"
                  value={pin}
                  onChange={(e) => updateRow(index, e.target.value)}
                  onBlur={onBlur}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder={placeholder}
                />
                <button
                  type="button"
                  className={`px-2 btn ${
                    isLast ? "btn-outline-success" : "btn-outline-danger"
                  }`}
                  disabled={
                    isLast &&
                    (!!duplicateCompletePinsMessage ||
                      pin.trim().length !== 6 ||
                      !/^\d{6}$/.test(pin.trim()))
                  }
                  onClick={() => (isLast ? addRow() : removeRow(index))}
                  aria-label={
                    isLast ? "Add pincode field" : "Remove pincode field"
                  }
                  style={{
                    width: "auto",
                    minWidth: "unset",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderRadius: "0.375rem",
                  }}
                >
                  <i className={`bi ${isLast ? "bi-plus-lg" : "bi-trash"}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {duplicateCompletePinsMessage ? (
        <Form.Text className="text-danger d-block small mt-1">
          {duplicateCompletePinsMessage}
        </Form.Text>
      ) : null}
      {error &&
        !(
          duplicateCompletePinsMessage &&
          error.message === duplicateCompletePinsMessage
        ) && (
          <Form.Control.Feedback type="invalid" style={{ display: "block" }}>
            {error.message}
          </Form.Control.Feedback>
        )}
    </Form.Group>
  );
};

type Props = {
  isEditable: boolean;
  isViewMode?: boolean;
  area: AreaModel | null;
  onClose: () => void;
  onRefreshData: () => void;
};

const parseAreaPincodesArray = (row: AreaModel | null): string[] => {
  if (!row) return [];
  const raw =
    (row as any)?.pincodes ??
    (row as any)?.pincode ??
    (row as any)?.pin_codes ??
    [];
  const parts: string[] = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === "string"
    ? raw.split(",")
    : [];
  const seen = new Set<string>();
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => {
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    });
};

const formatAreaPincodesDisplay = (row: AreaModel | null): string => {
  const normalized = parseAreaPincodesArray(row);
  return normalized.length ? normalized.join(", ") : "-";
};

const AddEditAreaDialog: React.FC<Props> & {
  show: (
    isEditable: boolean,
    area: AreaModel | null,
    onRefreshData: () => void,
    isViewMode?: boolean
  ) => void;
} = ({ isEditable, isViewMode = false, area, onClose, onRefreshData }) => {
  const [localViewMode, setLocalViewMode] = useState(isViewMode);

  type AreaFormValues = {
    state_id: string;
    city_id: string;
    name: string;
    pincode: string[];
    is_active: boolean | string;
  };

  const initialPincodes = parseAreaPincodesArray(area);

  const [states, setStates] = useState<{ value: string; label: string }[]>([]);
  const [cities, setCities] = useState<
    { value: string; label: string; state_id?: string }[]
  >([]);
  const [selectedStateId, setSelectedStateId] = useState<string>("");

  const fetchRef = useRef(false);
  const initStateFromCityRef = useRef(false);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<AreaFormValues>({
    defaultValues: {
      name: area?.name || "",
      state_id: "",
      city_id: area?.city_id || "",
      pincode: initialPincodes,
      is_active: area?.is_active ?? true,
    },
  });

  const fetchStatesFromApi = async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const stateOptions = await fetchStateDropDown();
      setStates(stateOptions);
    } finally {
      fetchRef.current = false;
    }
  };

  const fetchCitiesForState = async (stateIdList: string[]) => {
    const cityOptions = await fetchCityDropDown(stateIdList);
    setCities(cityOptions);
  };

  useEffect(() => {
    fetchStatesFromApi();
  }, []);

  // If editing, infer state selection from the provided city_id
  useEffect(() => {
    const init = async () => {
      if (!isEditable || !area?.city_id) return;
      if (states.length === 0) return;
      if (initStateFromCityRef.current) return;

      initStateFromCityRef.current = true;

      // Fetch cities for all states so we can infer which state owns the city.
      const allStateIds = states.map((s) => s.value);
      const allCities = await fetchCityDropDown(allStateIds);
      const matchedCity: any = allCities.find(
        (c: any) => c.value === area.city_id
      );

      if (matchedCity?.state_id) {
        setSelectedStateId(matchedCity.state_id);
        setValue("state_id", matchedCity.state_id);
        await fetchCitiesForState([matchedCity.state_id]);
      } else {
        setCities(allCities as any);
      }

      setValue("city_id", area.city_id);
    };

    init();
  }, [isEditable, area?.city_id, states, setValue]);

  useEffect(() => {
    if (localViewMode || !isEditable || !area) return;
    setValue("name", area.name || "");
    if (area.is_active !== undefined) {
      setValue("is_active", area.is_active);
    }
    setValue("pincode", parseAreaPincodesArray(area));
  }, [localViewMode, isEditable, area, setValue]);

  const handleStateChange = async (e: any) => {
    const value = e.target.value as string;
    setSelectedStateId(value);
    setValue("state_id", value);

    setCities([]);
    setValue("city_id", "");

    if (!value) return;
    await fetchCitiesForState([value]);
  };

  const onSubmitEvent = async (data: AreaFormValues) => {
    const pinCodes = (data.pincode || []).map((p) => p.trim()).filter(Boolean);
    const isActive =
      typeof data.is_active === "boolean"
        ? data.is_active
        : String(data.is_active ?? "") === "true";

    const payload = {
      name: data.name,
      state_id: data.state_id,
      city_id: data.city_id,
      pincodes: pinCodes,
      is_active: isActive,
    };

    let response;

    if (isEditable) {
      if (!area?._id) {
        showErrorAlert("Unable to update. ID missing.");
        return;
      }
      response = await createOrUpdateArea(payload, true, area._id);
    } else {
      response = await createOrUpdateArea(payload, false);
    }

    if (response) {
      onClose();
      onRefreshData();
    }
  };

  const areaStateLabel =
    (area as any)?.state_name ||
    states.find((s) => s.value === (area as any)?.state_id)?.label ||
    (area as any)?.state_id ||
    "-";

  return (
    <Modal
      show={true}
      onHide={onClose}
      centered
      dialogClassName="custom-big-modal"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          {localViewMode
            ? "Area Details"
            : isEditable
            ? "Edit Area"
            : "Add Area"}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>

      <Modal.Body className="px-4 pb-4 pt-0">
        {localViewMode && area ? (
          <section className="custom-other-details" style={{ padding: "10px" }}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h3 className="mb-0">Area Information</h3>
              <i
                className="bi bi-pencil-fill fs-6 text-danger"
                style={{ cursor: "pointer" }}
                role="button"
                aria-label="Edit area"
                onClick={() => setLocalViewMode(false)}
              />
            </div>

            <div className="row">
              <div className="col-md-12 custom-helper-column">
                <DetailsRow title="Area Name" value={area.name ?? "-"} />
                <DetailsRow title="State" value={areaStateLabel} />
                <DetailsRow title="City" value={area.city_name ?? "-"} />
                <DetailsRow
                  title="Pin codes"
                  value={formatAreaPincodesDisplay(area)}
                />
                <DetailsRow
                  title="Status"
                  value={area.is_active ? "Active" : "Inactive"}
                />
              </div>
            </div>
          </section>
        ) : (
          <form
            noValidate
            name="profile-form"
            id="profile-form"
            onSubmit={handleSubmit(onSubmitEvent)}
          >
            <Row>
              <CustomFormSelect
                label="State"
                controlId="state"
                options={states}
                register={register as unknown as UseFormRegister<any>}
                fieldName="state_id"
                error={errors.state_id}
                asCol={false}
                requiredMessage="Please select state"
                defaultValue={selectedStateId}
                setValue={setValue as (name: string, value: any) => void}
                onChange={handleStateChange}
              />

              <CustomFormSelect
                label="City"
                controlId="city"
                options={cities}
                register={register as unknown as UseFormRegister<any>}
                fieldName="city_id"
                error={errors.city_id}
                asCol={false}
                requiredMessage="Please select city"
                defaultValue={isEditable ? area?.city_id || "" : ""}
                setValue={setValue as (name: string, value: any) => void}
              />

              <CustomFormInput
                label="Area"
                controlId="name"
                placeholder="Enter Area"
                register={register}
                error={errors.name}
                asCol={false}
                validation={{ required: "Area is required" }}
              />

              <Controller<AreaFormValues, "pincode">
                name="pincode"
                control={control}
                rules={{
                  validate: (value) => {
                    if (!Array.isArray(value) || value.length === 0) {
                      return "Pincode is required";
                    }
                    const trimmed = value
                      .map((v) => String(v ?? "").trim())
                      .filter((p) => p.length > 0);
                    if (!trimmed.length) return "Pincode is required";
                    const invalidLen = trimmed.some(
                      (p) => p.length !== 6 || !/^\d{6}$/.test(p)
                    );
                    if (invalidLen) return "Each pincode must be 6 digits";
                    if (new Set(trimmed).size !== trimmed.length) {
                      return "Already this pincode entered";
                    }
                    return true;
                  },
                }}
                render={({ field, fieldState }) => (
                  <PincodeTagField
                    label="Pin codes"
                    value={field.value ?? []}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error}
                    placeholder="Enter pincode(6 digits)"
                  />
                )}
              />

              <CustomRadioSelection
                label="Status"
                name="is_active"
                options={getStatusOptions()}
                defaultValue={isEditable ? area?.is_active?.toString() : "true"}
                isEditable={isEditable}
                setValue={setValue}
              />
            </Row>

            <Row className="mt-4">
              <Col
                xs={12}
                className="text-center d-flex justify-content-end gap-3 "
              >
                <Button type="submit" className="custom-btn-primary">
                  {isEditable ? "Update" : "Add"}
                </Button>

                <Button className="custom-btn-secondary" onClick={onClose}>
                  Cancel
                </Button>
              </Col>
            </Row>
          </form>
        )}
      </Modal.Body>
    </Modal>
  );
};

AddEditAreaDialog.show = (
  isEditable: boolean,
  area: AreaModel | null,
  onRefreshData: () => void,
  isViewMode: boolean = false
) => {
  openDialog("details-modal", (close) => (
    <AddEditAreaDialog
      isEditable={isEditable}
      isViewMode={isViewMode}
      area={area}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default AddEditAreaDialog;
