import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Modal, Button, Row, Col } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { StateModel } from "../../lib/models/StateModel";
import { CustomFormInput } from "../../components/CustomFormInput";
import { CustomRadioSelection } from "../../components/CustomRadioSelection";
import { DetailsRow, getStatusOptions } from "../../helper/utility";
import { showErrorAlert } from "../../lib/global/alertHelper";
import { createOrUpdateState } from "../../services/stateService";
import { openDialog } from "../../lib/global/DialogManager";

type AddEditStateDialogProps = {
  isEditable: boolean;
  isViewMode?: boolean;
  state: StateModel | null;
  onClose: () => void;
  onRefreshData: () => void;
};

const AddEditStateDialog: React.FC<AddEditStateDialogProps> & {
  show: (
    isEditable: boolean,
    state: StateModel | null,
    onRefreshData: () => void,
    isViewMode?: boolean
  ) => void;
} = ({ isEditable, isViewMode = false, state, onClose, onRefreshData }) => {
  const [localViewMode, setLocalViewMode] = useState(isViewMode);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<StateModel>({
    defaultValues: {
      name: state?.name || "",
      is_active: state?.is_active ?? true,
    },
  });

  useEffect(() => {
    if (isEditable && state) {
      setValue("name", state.name || "");
      if (state.is_active !== undefined) {
        setValue("is_active", state.is_active);
      }
    }
  }, [isEditable, state, setValue]);

  const onSubmitEvent = async (data: StateModel) => {
    const isActive =
      typeof data.is_active === "boolean"
        ? data.is_active
        : String(data.is_active ?? "") === "true";
    const payload = {
      name: data.name,
      is_active: isActive,
    };
    let response;

    if (isEditable) {
      if (!state?._id) {
        showErrorAlert("Unable to update. ID is missing.");
        return;
      }

      response = await createOrUpdateState(payload, true, state._id);
    } else {
      response = await createOrUpdateState(payload, false);
    }

    if (response) {
      onClose && onClose();
      onRefreshData();
    }
  };

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
            ? "State Details"
            : isEditable
            ? "Edit State"
            : "Add State"}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        {localViewMode && state ? (
          <section className="custom-other-details" style={{ padding: "10px" }}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h3 className="mb-0">State Information</h3>
              <i
                className="bi bi-pencil-fill fs-6 text-danger"
                style={{ cursor: "pointer" }}
                role="button"
                aria-label="Edit state"
                onClick={() => setLocalViewMode(false)}
              />
            </div>

            <div className="row">
              <div className="col-md-12 custom-helper-column">
                <DetailsRow title="State Name" value={state.name ?? "-"} />
                <DetailsRow
                  title="Status"
                  value={state.is_active ? "Active" : "Inactive"}
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
              <CustomFormInput
                label="State"
                controlId="name"
                placeholder="Enter State Name"
                register={register}
                error={errors.name}
                asCol={false}
                validation={{ required: "State name is required" }}
              />

              <CustomRadioSelection
                label="Status"
                name="is_active"
                options={getStatusOptions()}
                defaultValue={
                  isEditable ? state?.is_active?.toString() : "true"
                }
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

AddEditStateDialog.show = (
  isEditable: boolean,
  state: StateModel | null,
  onRefreshData: () => void,
  isViewMode: boolean = false
) => {
  openDialog("details-modal", (close) => (
    <AddEditStateDialog
      isEditable={isEditable}
      isViewMode={isViewMode}
      state={state}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default AddEditStateDialog;
