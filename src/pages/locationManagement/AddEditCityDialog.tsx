import React, { useState, useEffect, useRef } from "react";
import { useForm, UseFormRegister } from "react-hook-form";
import { Modal, Button, Row, Col } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { CityModel } from "../../lib/models/CityModel";
import { CustomFormInput } from "../../components/CustomFormInput";
import { CustomRadioSelection } from "../../components/CustomRadioSelection";
import { DetailsRow, getStatusOptions } from "../../helper/utility";
import CustomFormSelect from "../../components/CustomFormSelect";
import { showErrorAlert } from "../../lib/global/alertHelper";
import { fetchStateDropDown } from "../../services/stateService";
import { createOrUpdateCity } from "../../services/cityService";
import { openDialog } from "../../lib/global/DialogManager";

type AddEditCityDialogProps = {
  isEditable: boolean;
  isViewMode?: boolean;
  city: CityModel | null;
  onClose: () => void;
  onRefreshData: () => void;
};

const AddEditCityDialog: React.FC<AddEditCityDialogProps> & {
  show: (
    isEditable: boolean,
    city: CityModel | null,
    onRefreshData: () => void,
    isViewMode?: boolean
  ) => void;
} = ({ isEditable, isViewMode = false, city, onClose, onRefreshData }) => {
  const [localViewMode, setLocalViewMode] = useState(isViewMode);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CityModel>({
    defaultValues: {
      name: city?.name || "",
      state_id: city?.state_id || "",
      is_active: city?.is_active ?? true,
    },
  });

  const [states, setState] = useState<{ value: string; label: string }[]>([]);
  const fetchRef = useRef(false);

  const fetchStateFromApi = async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const stateOptions = await fetchStateDropDown();
      setState(stateOptions);
    } finally {
      fetchRef.current = false;
    }
  };

  useEffect(() => {
    fetchStateFromApi();
  }, []);

  useEffect(() => {
    if (isEditable && city) {
      setValue("name", city.name || "");
      setValue("state_id", city.state_id || "");
      if (city.is_active !== undefined) {
        setValue("is_active", city.is_active);
      }
    }
  }, [isEditable, city, setValue]);

  useEffect(() => {
    if (city?.state_id && states.length > 0) {
      const selectedState = states.find((s) => s.value === city.state_id);
      if (selectedState) {
        setValue("state_id", city.state_id);
      }
    }
  }, [states, city?.state_id, setValue]);

  const stateLabelForView =
    city?.state_name ||
    states.find((s) => s.value === city?.state_id)?.label ||
    city?.state_id ||
    "-";

  const onSubmitEvent = async (data: CityModel) => {
    const isActive =
      typeof data.is_active === "boolean"
        ? data.is_active
        : String(data.is_active ?? "") === "true";
    const payload = {
      name: data.name,
      state_id: data.state_id,
      is_active: isActive,
    };
    let response;

    if (isEditable) {
      if (!city?._id) {
        showErrorAlert("Unable to update. ID is missing.");
        return;
      }

      response = await createOrUpdateCity(payload, true, city._id);
    } else {
      response = await createOrUpdateCity(payload, false);
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
            ? "City Details"
            : isEditable
            ? "Edit City"
            : "Add City"}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        {localViewMode && city ? (
          <section className="custom-other-details" style={{ padding: "10px" }}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h3 className="mb-0">City Information</h3>
              <i
                className="bi bi-pencil-fill fs-6 text-danger"
                style={{ cursor: "pointer" }}
                role="button"
                aria-label="Edit city"
                onClick={() => setLocalViewMode(false)}
              />
            </div>

            <div className="row">
              <div className="col-md-12 custom-helper-column">
                <DetailsRow title="City Name" value={city.name ?? "-"} />
                <DetailsRow title="State Name" value={stateLabelForView} />
                <DetailsRow
                  title="Status"
                  value={city.is_active ? "Active" : "Inactive"}
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
                defaultValue={isEditable ? city?.state_id : ""}
                setValue={setValue as (name: string, value: any) => void}
              />

              <CustomFormInput
                label="City"
                controlId="name"
                placeholder="Enter City Name"
                register={register}
                error={errors.name}
                asCol={false}
                validation={{ required: "City name is required" }}
              />
              <CustomRadioSelection
                label="Status"
                name="is_active"
                options={getStatusOptions()}
                defaultValue={isEditable ? city?.is_active?.toString() : "true"}
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

AddEditCityDialog.show = (
  isEditable: boolean,
  city: CityModel | null,
  onRefreshData: () => void,
  isViewMode: boolean = false
) => {
  openDialog("details-modal", (close) => (
    <AddEditCityDialog
      isEditable={isEditable}
      isViewMode={isViewMode}
      city={city}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default AddEditCityDialog;
