import React, { useEffect, useMemo, useState } from "react";
import { useForm, UseFormRegister } from "react-hook-form";
import { Modal, Button, Row, Col, Form } from "react-bootstrap";
import CustomCloseButton from "../../../components/CustomCloseButton";
import { CustomFormInput } from "../../../components/CustomFormInput";
import CustomFormSelect from "../../../components/CustomFormSelect";
import { capitalizeString, DetailsRow } from "../../../helper/utility";
import { openDialog } from "../../../lib/global/DialogManager";
import { saveSubscriptionPlan } from "../../../services/partnerManagementService";
import type { SubscriptionPlanModel } from "../../../lib/models/SubscriptionPlanModel";

export type { SubscriptionPlanModel };

type AddEditSubscriptionPlanDialogProps = {
  isEditable: boolean;
  plan: SubscriptionPlanModel | null;
  onClose: () => void;
  onRefreshData: () => void;
};

const durationTypeOptions = [
  { value: "days", label: "Days" },
  { value: "months", label: "Months" },
];

const AddEditSubscriptionPlanDialog: React.FC<AddEditSubscriptionPlanDialogProps> & {
  show: (
    isEditable: boolean,
    plan: SubscriptionPlanModel | null,
    onRefreshData: () => void
  ) => void;
} = ({ isEditable, plan, onClose, onRefreshData }) => {
  const initialData: SubscriptionPlanModel = useMemo(
    () =>
      plan || {
        _id: "",
        plan_name: "",
        plan_description: "",
        price: "",
        duration: "",
        duration_type: "",
        priority: "",
        is_active: undefined as any,
      },
    [plan]
  );

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    reset,
  } = useForm<SubscriptionPlanModel>({
    defaultValues: initialData,
  });

  const [viewData, setViewData] = useState<SubscriptionPlanModel>(initialData);

  useEffect(() => {
    reset(initialData);
    setViewData(initialData);
  }, [initialData, reset]);

  const handleEditClick = (): void => {
    onClose();
    AddEditSubscriptionPlanDialog.show(true, viewData, onRefreshData);
  };

  const onSubmitEvent = async (data: SubscriptionPlanModel) => {
    const updatedData: SubscriptionPlanModel = {
      ...data,
      is_active:
        typeof data.is_active === "string"
          ? data.is_active === "true"
          : data.is_active,
    };

    const isUpdate = Boolean(plan?._id);
    const ok = await saveSubscriptionPlan(updatedData, isUpdate);
    if (!ok) return;
    setViewData(updatedData);
    onRefreshData();
    onClose();
  };

  return (
    <Modal show={true} onHide={onClose} centered size="lg">
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          {isEditable
            ? plan
              ? "Edit Subscription Plan"
              : "Add Subscription Plan"
            : "Subscription Plan Information"}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>

      <Modal.Body
        className="px-4 pb-4 pt-0"
        style={{ maxHeight: "70vh", overflowY: "auto" }}
      >
        {!isEditable ? (
          <section className="custom-other-details" style={{ padding: "10px" }}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h3 className="mb-0">Plan</h3>
              <i
                className="bi bi-pencil-fill fs-6 text-danger"
                style={{ cursor: "pointer" }}
                onClick={handleEditClick}
              />
            </div>
            <div className="row">
              <div className="col-md-6 custom-helper-column">
                <DetailsRow
                  title="Plan Name"
                  value={capitalizeString(viewData.plan_name) || "-"}
                />
                <DetailsRow title="Price" value={viewData.price || "-"} />
                <DetailsRow title="Duration" value={viewData.duration || "-"} />
              </div>
              <div className="col-md-6 custom-helper-column">
                <DetailsRow
                  title="Duration Type"
                  value={capitalizeString(viewData.duration_type) || "-"}
                />
                <DetailsRow title="Priority" value={viewData.priority || "-"} />
                <DetailsRow
                  title="Status"
                  value={viewData.is_active ? "Active" : "Inactive"}
                />
              </div>
            </div>
            <div className="mt-3 p-3 border rounded">
              <div className="custom-personal-row-title mb-2">
                Plan Description
              </div>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "var(--txt-color)",
                }}
              >
                {viewData.plan_description || "-"}
              </div>
            </div>
          </section>
        ) : (
          <Form
            noValidate
            id="subscription-plan-form"
            onSubmit={handleSubmit(onSubmitEvent)}
          >
            <Row className="gx-3 gy-2">
              <Col md={6}>
                <CustomFormInput
                  label="Plan Name"
                  controlId="plan_name"
                  placeholder={plan ? "—" : "Enter Plan Name"}
                  register={register}
                  error={errors.plan_name}
                  asCol={false}
                  validation={{ required: "Plan name is required" }}
                  isEditable={!plan}
                  inputStyle={
                    plan ? { borderColor: "var(--txtfld-border)" } : undefined
                  }
                />
              </Col>

              <Col md={6}>
                <CustomFormInput
                  label="Price"
                  controlId="price"
                  placeholder="Enter Price"
                  register={register}
                  error={errors.price}
                  asCol={false}
                  validation={{ required: "Price is required" }}
                />
              </Col>

              <Col md={6}>
                <CustomFormInput
                  label="Duration"
                  controlId="duration"
                  placeholder="Enter Duration"
                  register={register}
                  error={errors.duration}
                  asCol={false}
                  validation={{ required: "Duration is required" }}
                />
              </Col>

              <Col md={6}>
                <CustomFormSelect
                  label="Duration Type"
                  controlId="duration_type"
                  options={durationTypeOptions}
                  register={register as unknown as UseFormRegister<any>}
                  fieldName="duration_type"
                  error={errors.duration_type as any}
                  asCol={false}
                  requiredMessage="Please select duration type"
                  defaultValue={viewData.duration_type || ""}
                  setValue={(name: string, value: any) =>
                    setValue(name as keyof SubscriptionPlanModel, value)
                  }
                />
              </Col>
              <Col md={6}>
                <CustomFormInput
                  label="Priority"
                  controlId="priority"
                  placeholder="Enter Priority"
                  register={register}
                  error={errors.priority}
                  asCol={false}
                />
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="fw-medium mb-1">Status</Form.Label>
                  <div
                    className="d-flex"
                    style={{ flexDirection: "row", gap: "8px" }}
                  >
                    <Form.Check
                      type="radio"
                      id="subscription_plan_status_active"
                      label={<span className="custom-radio-text">Active</span>}
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
                      id="subscription_plan_status_inactive"
                      label={
                        <span className="custom-radio-text">Inactive</span>
                      }
                      value="false"
                      checked={!viewData.is_active}
                      onChange={() => {
                        setValue("is_active", false as any, {
                          shouldValidate: true,
                        });
                        setViewData((prev) => ({ ...prev, is_active: false }));
                      }}
                      className="custom-radio-check"
                    />
                  </div>
                </Form.Group>
              </Col>

              <Col md={12}>
                <CustomFormInput
                  label="Plan Description"
                  controlId="plan_description"
                  placeholder="Enter Plan Description"
                  register={register}
                  error={errors.plan_description}
                  asCol={false}
                  validation={{ required: "Plan description is required" }}
                  as="textarea"
                  rows={3}
                />
              </Col>
            </Row>
          </Form>
        )}
      </Modal.Body>
      {isEditable && (
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="btn-danger"
            type="submit"
            form="subscription-plan-form"
          >
            {plan ? "Update" : "Save"}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
};

AddEditSubscriptionPlanDialog.show = (
  isEditable: boolean,
  plan: SubscriptionPlanModel | null,
  onRefreshData: () => void
) => {
  openDialog("details-modal", (close) => (
    <AddEditSubscriptionPlanDialog
      isEditable={isEditable}
      plan={plan}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default AddEditSubscriptionPlanDialog;
