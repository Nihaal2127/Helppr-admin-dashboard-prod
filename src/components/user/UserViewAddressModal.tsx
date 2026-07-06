import React, { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { Modal, Button, Row, Col } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import CustomTextFieldSelect from "../../components/CustomTextFieldSelect";
import CustomTextField from "../../components/CustomTextField";
import { sanitizeIndianPincodeInput } from "../../lib/user/pincodeValidation";

export type UserViewAddressFormValues = {
  stateId: string;
  cityId: string;
  areaId: string;
  postal: string;
  line: string;
};

type FormShape = {
  va_state: string;
  va_city: string;
  va_area: string;
  va_pin: string;
  va_line: string;
};

type UserViewAddressModalProps = {
  show: boolean;
  title: string;
  states: { value: string; label: string }[];
  cities: { value: string; label: string }[];
  areas: { value: string; label: string; pincodes?: string[]; pincode?: string }[];
  onFetchCities: (stateId: string) => void | Promise<void>;
  onFetchAreas: (cityId: string, stateId?: string) => void | Promise<void>;
  initial: UserViewAddressFormValues | null;
  onHide: () => void;
  onSave: (values: UserViewAddressFormValues) => Promise<boolean>;
};

const UserViewAddressModal: React.FC<UserViewAddressModalProps> = ({
  show,
  title,
  states,
  cities,
  areas,
  onFetchCities,
  onFetchAreas,
  initial,
  onHide,
  onSave,
}) => {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormShape>({
    defaultValues: {
      va_state: "",
      va_city: "",
      va_area: "",
      va_pin: "",
      va_line: "",
    },
  });

  const selectedAreaId = watch("va_area");
  const pincodeOptions = useMemo(() => {
    const selected = areas.find((a) => a.value === selectedAreaId);
    if (!selected) return [];
    const fromList = Array.isArray(selected.pincodes)
      ? selected.pincodes
      : [];
    const merged = Array.from(
      new Set(
        [...fromList, selected.pincode ?? ""]
          .map((x) => sanitizeIndianPincodeInput(String(x ?? "").trim()))
          .filter(Boolean)
      )
    );
    return merged.map((pin) => ({ value: pin, label: pin }));
  }, [areas, selectedAreaId]);

  const pincodeOptionsMerged = useMemo(() => {
    const pin = sanitizeIndianPincodeInput(String(initial?.postal ?? "").trim());
    const initialAreaId = String(initial?.areaId ?? "").trim();
    const currentAreaId = String(selectedAreaId ?? "").trim();
    const base = pincodeOptions;
    const shouldPreserveInitialPin =
      Boolean(pin) &&
      Boolean(initialAreaId) &&
      currentAreaId === initialAreaId;
    if (shouldPreserveInitialPin && !base.some((o) => o.value === pin)) {
      return [...base, { value: pin, label: pin }];
    }
    return base;
  }, [pincodeOptions, initial?.postal, initial?.areaId, selectedAreaId]);

  /** Area/pin options load after `reset`; re-apply saved ids so selects show current values. */
  useEffect(() => {
    if (!show) return;
    const id = String(initial?.areaId ?? "").trim();
    if (!id) return;
    if (!areas.some((a) => String(a.value) === id)) return;
    setValue("va_area", id, { shouldValidate: false, shouldDirty: false });
  }, [show, areas, initial?.areaId, setValue]);

  useEffect(() => {
    if (!show) return;
    const pin = sanitizeIndianPincodeInput(String(initial?.postal ?? "").trim());
    const initialAreaId = String(initial?.areaId ?? "").trim();
    const currentAreaId = String(selectedAreaId ?? "").trim();
    if (!initialAreaId || currentAreaId !== initialAreaId) return;
    if (!pin) return;
    if (pincodeOptionsMerged.some((o) => o.value === pin)) {
      setValue("va_pin", pin, { shouldValidate: false, shouldDirty: false });
    }
  }, [
    show,
    pincodeOptionsMerged,
    initial?.postal,
    initial?.areaId,
    selectedAreaId,
    setValue,
  ]);

  useEffect(() => {
    if (!show) return;
    reset({
      va_state: initial?.stateId ?? "",
      va_city: initial?.cityId ?? "",
      va_area: initial?.areaId ?? "",
      va_pin: initial?.postal ?? "",
      va_line: initial?.line ?? "",
    });
    if (initial?.stateId) void onFetchCities(initial.stateId);
    if (initial?.cityId) void onFetchAreas(initial.cityId, initial?.stateId);
    // Primitives only: parent used to pass an inline `onFetchCities` that changed every render and
    // retriggered this effect → setViewCities loop while the modal was open.
  }, [
    show,
    initial?.stateId,
    initial?.cityId,
    initial?.areaId,
    initial?.postal,
    initial?.line,
    reset,
    onFetchCities,
    onFetchAreas,
  ]);

  const submit = handleSubmit(async (data) => {
    const ok = await onSave({
      stateId: data.va_state,
      cityId: data.va_city,
      areaId: data.va_area,
      postal: sanitizeIndianPincodeInput(data.va_pin ?? ""),
      line: (data.va_line ?? "").trim(),
    });
    if (ok) onHide();
  });

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      enforceFocus={false}
      dialogClassName="modal-vh-90 user-view-address-modal-wider"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          {title}
        </Modal.Title>
        <CustomCloseButton onClose={onHide} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        <form noValidate onSubmit={submit}>
          <Row className="g-2">
            <Col xs={12} md={6}>
              <CustomTextFieldSelect
                label="State"
                controlId="va_state"
                options={states}
                register={register}
                fieldName="va_state"
                error={errors.va_state}
                requiredMessage="Please select state"
                defaultValue={initial?.stateId ?? ""}
                setValue={setValue as (name: string, value: unknown) => void}
                menuPortal
                onChange={(e) => {
                  const v = e.target.value;
                  void onFetchCities(v);
                  void onFetchAreas("", v);
                  setValue("va_city", "");
                  setValue("va_area", "");
                  setValue("va_pin", "");
                }}
              />
            </Col>
            <Col xs={12} md={6}>
              <CustomTextFieldSelect
                label="City"
                controlId="va_city"
                options={cities}
                register={register}
                fieldName="va_city"
                error={errors.va_city}
                requiredMessage="Please select city"
                defaultValue={initial?.cityId ?? ""}
                setValue={setValue as (name: string, value: unknown) => void}
                menuPortal
                onChange={(e) => {
                  const cityValue = e.target.value;
                  const stateValue = watch("va_state");
                  setValue("va_area", "");
                  setValue("va_pin", "");
                  void onFetchAreas(cityValue, stateValue);
                }}
              />
            </Col>
            <Col xs={12} md={6}>
              <CustomTextFieldSelect
                label="Area"
                controlId="va_area"
                options={areas}
                register={register}
                fieldName="va_area"
                error={errors.va_area}
                requiredMessage="Please select area"
                defaultValue={initial?.areaId ?? ""}
                setValue={setValue as (name: string, value: unknown) => void}
                menuPortal
                onChange={(e) => {
                  const selected = areas.find((a) => a.value === e.target.value);
                  const firstPin = Array.isArray(selected?.pincodes)
                    ? selected?.pincodes?.[0]
                    : selected?.pincode;
                  setValue("va_pin", sanitizeIndianPincodeInput(firstPin ?? ""));
                }}
              />
            </Col>
            <Col xs={12} md={6}>
              <CustomTextFieldSelect
                label="Pin code"
                controlId="va_pin"
                options={pincodeOptionsMerged}
                register={register}
                fieldName="va_pin"
                error={errors.va_pin as any}
                requiredMessage="Please select pincode"
                defaultValue={initial?.postal ?? ""}
                setValue={setValue as (name: string, value: unknown) => void}
                menuPortal
              />
            </Col>
            <Col xs={12}>
              <CustomTextField
                label="Address"
                controlId="va_line"
                placeholder="Street, building, etc."
                register={register}
                error={errors.va_line}
                validation={{ required: "Address is required" }}
                as="textarea"
                rows={2}
              />
            </Col>
          </Row>
          <Row className="mt-4">
            <Col className="d-flex justify-content-end gap-2">
              <Button
                type="button"
                className="custom-btn-secondary"
                onClick={onHide}
              >
                Cancel
              </Button>
              <Button type="submit" className="custom-btn-primary">
                Save
              </Button>
            </Col>
          </Row>
        </form>
      </Modal.Body>
    </Modal>
  );
};

export default UserViewAddressModal;
