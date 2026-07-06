import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Modal, Row } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { UserModel } from "../../lib/models/UserModel";
import {
  createUserAddressExtra,
  deleteMobileUserAddress,
  fetchUserById,
  updateUserAddressById,
} from "../../services/userService";
import { fetchCityDropDown } from "../../services/cityService";
import { fetchStateDropDown } from "../../services/stateService";
import { fetchAreaViewOptionsByCity } from "../../services/areaService";
import editIcon from "../../assets/icons/edit_red.svg";
import profileIcon from "../../assets/icons/profile.svg";
import {
  DetailsRow,
  PersonalAccountDetailsGrid,
} from "../../helper/utility";
import { formatGenderLabel } from "../../lib/user/genderOptions";
import ServiceDetailsDialog from "./ServiceDetailsDialog";
import UserAddressReadOnlyCards from "./UserAddressReadOnlyCards";
import UserViewAddressModal from "./UserViewAddressModal";
import type { UserViewAddressFormValues } from "./UserViewAddressModal";
import { AppConstant } from "../../lib/global/AppConstant";
import { sanitizeIndianPincodeInput } from "../../lib/user/pincodeValidation";
import { showErrorAlert, showSuccessAlert } from "../../lib/global/alertHelper";
import { openConfirmDialog } from "../CustomConfirmDialog";
import deleteIcon from "../../assets/icons/delete_red.svg";
import { showUserDetailsDialog } from "./showUserDetailsDialog";

type UserDetailsDialogProps = {
  userId: string;
  onClose: () => void;
  onRefreshData: () => void;
};

type UserAddressEntry = {
  _id?: string;
  state_id: string;
  city_id: string;
  area_id?: string;
  pincode: string;
  address: string;
  address_status: "true" | "false";
  /** Original API row (when `user.address` is an array). */
  apiRow?: Record<string, unknown>;
};

const UserDetailsDialog: React.FC<UserDetailsDialogProps> & {
  show: (userId: string, onRefreshData: () => void) => void;
} = ({ userId, onClose, onRefreshData }) => {
  const [userDetails, setUserDetails] = useState<UserModel>();
  const fetchRef = useRef(false);

  const [viewAddrModalOpen, setViewAddrModalOpen] = useState(false);
  const [viewAddrMode, setViewAddrMode] = useState<"edit" | "add">("edit");
  const [viewStates, setViewStates] = useState<
    { value: string; label: string }[]
  >([]);
  const [viewCities, setViewCities] = useState<
    { value: string; label: string }[]
  >([]);
  const [viewAreas, setViewAreas] = useState<
    { value: string; label: string; pincodes?: string[]; pincode?: string }[]
  >([]);
  const [editingAddressIndex, setEditingAddressIndex] = useState<number | null>(
    null
  );

  const fetchDataFromApi = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const { response, user } = await fetchUserById(userId);
      if (response) {
        setUserDetails(user!!);
      }
    } finally {
      fetchRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    void fetchDataFromApi();
  }, [fetchDataFromApi]);

  useEffect(() => {
    if (!userDetails || Number(userDetails.type) !== 4) return;
    let cancelled = false;

    const loadAddressNameOptions = async () => {
      const addresses = getNormalizedAddresses(userDetails);
      const stateIds = Array.from(
        new Set(addresses.map((a) => a.state_id).filter(Boolean))
      );
      const cityIds = Array.from(
        new Set(addresses.map((a) => a.city_id).filter(Boolean))
      );

      const stateOpts = await fetchStateDropDown();
      if (!cancelled) setViewStates(stateOpts);

      if (stateIds.length > 0) {
        const cityOpts = await fetchCityDropDown(stateIds);
        if (!cancelled) setViewCities(cityOpts);
      }

      if (cityIds.length > 0) {
        const allAreas = await Promise.all(
          cityIds.map(async (cityId) => {
            const stateId =
              addresses.find((x) => x.city_id === cityId)?.state_id ?? "";
            return fetchAreaViewOptionsByCity(cityId, stateId);
          })
        );
        if (!cancelled) {
          const merged = allAreas.flat();
          const unique = Array.from(
            new Map(merged.map((r) => [r.value, r])).values()
          );
          setViewAreas(unique);
        }
      }
    };

    void loadAddressNameOptions();
    return () => {
      cancelled = true;
    };
  }, [userDetails]);

  const openServices = (status: number | null) => {
    ServiceDetailsDialog.show(userId, false, status, onRefreshuser);
  };

  const onRefreshuser = async () => {
    await fetchDataFromApi();
    onRefreshData();
  };

  const loadViewCities = useCallback(async (stateId: string) => {
    if (!stateId) {
      setViewCities([]);
      return;
    }
    const opts = await fetchCityDropDown([stateId]);
    setViewCities(opts);
  }, []);
  const loadViewAreas = useCallback(async (cityId: string, stateId?: string) => {
    if (!cityId) {
      setViewAreas([]);
      return;
    }
    const opts = await fetchAreaViewOptionsByCity(cityId, stateId);
    setViewAreas(opts);
  }, []);

  /** Stable ref so `UserViewAddressModal` effects do not re-run every parent render (was causing a fetch/setState loop). */
  const onViewModalFetchCities = useCallback(
    (stateId: string) => {
      void loadViewCities(stateId);
    },
    [loadViewCities]
  );
  const onViewModalFetchAreas = useCallback(
    (cityId: string, stateId?: string) => {
      void loadViewAreas(cityId, stateId);
    },
    [loadViewAreas]
  );

  const openViewAddressModal = useCallback(
    async (mode: "edit" | "add", addressIndex?: number) => {
      if (viewStates.length === 0) {
        const s = await fetchStateDropDown();
        setViewStates(s);
      }
      if (mode === "add") {
        setViewCities([]);
        setViewAreas([]);
        setEditingAddressIndex(null);
      } else {
        const indexToEdit =
          typeof addressIndex === "number" ? addressIndex : 0;
        const addresses = getNormalizedAddresses(userDetails);
        const selected = addresses[indexToEdit];
        setEditingAddressIndex(indexToEdit);
        if (selected?.state_id) {
          await loadViewCities(selected.state_id);
        } else {
          setViewCities([]);
        }
        if (selected?.city_id) {
          await loadViewAreas(selected.city_id, selected.state_id);
        } else {
          setViewAreas([]);
        }
      }
      setViewAddrMode(mode);
      setViewAddrModalOpen(true);
    },
    [viewStates.length, userDetails, loadViewCities, loadViewAreas]
  );

  const handleViewAddressSave = useCallback(
    async (values: UserViewAddressFormValues): Promise<boolean> => {
      if (!userDetails?._id) {
        showErrorAlert("Unable to save. User data is missing.");
        return false;
      }
      const pin = sanitizeIndianPincodeInput(values.postal ?? "");
      const existingAddresses = getNormalizedAddresses(userDetails);
      const basePayload = {
        address: values.line.trim(),
        state_id: values.stateId,
        city_id: values.cityId,
        pincode: pin,
        area_id: values.areaId,
        contact_name: userDetails.name ?? "",
        contact_number: userDetails.phone_number ?? "",
      };

      let ok = false;
      if (viewAddrMode === "edit") {
        const editIndex =
          typeof editingAddressIndex === "number" ? editingAddressIndex : 0;
        const selectedAddress = existingAddresses[editIndex];
        const addressId = String(
          selectedAddress?._id ?? selectedAddress?.apiRow?._id ?? ""
        ).trim();
        if (!addressId) {
          showErrorAlert("Address id is missing. Please refresh and try again.");
          return false;
        }
        ok = await updateUserAddressById(userDetails._id, {
          address_id: addressId,
          ...basePayload,
          address_status: selectedAddress?.address_status === "false" ? false : true,
        });
      } else {
        ok = await createUserAddressExtra(userDetails._id, {
          ...basePayload,
          address_status: true,
        });
      }

      if (ok) {
        showSuccessAlert(
          viewAddrMode === "edit" ? "Address updated." : "Address added."
        );
        const refreshed = await fetchUserById(userId);
        if (refreshed.response && refreshed.user) {
          setUserDetails(refreshed.user);
        }
        onRefreshData();
        return true;
      }
      showErrorAlert("Could not save address. Please try again.");
      return false;
    },
    [userDetails, viewAddrMode, editingAddressIndex, userId, onRefreshData]
  );

  const handleDeleteAddress = useCallback(
    (index: number) => {
      if (!userDetails?._id) return;
      const addresses = getNormalizedAddresses(userDetails);
      const target = addresses[index];
      if (!target) return;
      const addressLabel =
        String(target.address ?? "").trim() || `Address ${index + 1}`;

      openConfirmDialog(
        `Are you sure to delete ${addressLabel}?`,
        "Yes",
        "Cancel",
        () => {
          void (async () => {
            const addressId = String(target._id ?? target.apiRow?._id ?? "").trim();
            if (!addressId) {
              showErrorAlert("Address id is missing. Please refresh and try again.");
              return;
            }
            const ok = await deleteMobileUserAddress(addressId);
            if (!ok) {
              showErrorAlert("Could not delete address. Please try again.");
              return;
            }
            showSuccessAlert("Address deleted.");
            const refreshed = await fetchUserById(userId);
            if (refreshed.response && refreshed.user) {
              setUserDetails(refreshed.user);
            }
            onRefreshData();
          })();
        },
        deleteIcon
      );
    },
    [userDetails, userId, onRefreshData]
  );

  const viewAddressInitial = useMemo((): UserViewAddressFormValues | null => {
    if (!userDetails) return null;
    if (viewAddrMode === "add") {
      return {
        stateId: "",
        cityId: "",
        areaId: "",
        postal: "",
        line: "",
      };
    }
    const addresses = getNormalizedAddresses(userDetails);
    const selected =
      addresses[
        typeof editingAddressIndex === "number" ? editingAddressIndex : 0
      ] ?? addresses[0];
    return {
      stateId: selected?.state_id ?? "",
      cityId: selected?.city_id ?? "",
      areaId: selected?.area_id ?? "",
      postal: selected?.pincode ?? "",
      line: selected?.address ?? "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- field-level deps avoid remounting on unrelated userDetails churn
  }, [
    viewAddrMode,
    editingAddressIndex,
    userDetails?._id,
    userDetails?.address,
    userDetails?.state_id,
    userDetails?.city_id,
    userDetails?.area_id,
    userDetails?.pincode,
    userDetails?.extra_addresses,
  ]);

  return (
    <>
      <Modal
        dialogClassName="custom-big-modal modal-vh-90"
        size="xl"
        show={true}
        onHide={onClose}
        centered
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            User Information
          </Modal.Title>
          <CustomCloseButton onClose={onClose} />
        </Modal.Header>
        <Modal.Body className="px-4 pb-4 pt-0">
          <div className="custom-info">
            <div>
              <p>Personal</p>
              <img
                src={
                  userDetails?.profile_url
                    ? `${AppConstant.IMAGE_BASE_URL}${
                        userDetails?.profile_url
                      }?t=${Date.now()}`
                    : profileIcon
                }
                alt="User profile"
                width="160px"
                height="160px"
              />
            </div>

            <div className="custom-personal-details">
              <PersonalAccountDetailsGrid
                nameLabel="User Name"
                name={userDetails?.name}
                dateOfBirth={userDetails?.date_of_birth}
                genderLabel={formatGenderLabel(userDetails?.gender)}
                email={userDetails?.email}
                phone={userDetails?.phone_number}
                registeredDate={userDetails?.created_at}
                lastServiceDate={userDetails?.last_service_date}
              />
            </div>
            <img
              src={editIcon}
              alt="edit"
              onClick={() => {
                void import("../../pages/userManagement/AddEditUserDialog").then(
                  ({ default: AddEditUserDialog }) => {
                    AddEditUserDialog.show(
                      4,
                      true,
                      userDetails!!,
                      onRefreshuser
                    );
                  }
                );
              }}
            />
          </div>
          {userDetails && Number(userDetails.type) === 4 ? (
            <section
              className="custom-other-details mt-3"
              style={{ padding: "10px" }}
            >
              <h3 className="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span>Address</span>
                <button
                  type="button"
                  className="btn btn-link p-0 text-decoration-none fw-semibold"
                  style={{ color: "var(--primary-color)", fontSize: "15px" }}
                  onClick={() => void openViewAddressModal("add")}
                >
                  + Add address
                </button>
              </h3>
              <UserAddressReadOnlyCards
                user={userDetails}
                stateOptions={viewStates}
                cityOptions={viewCities}
                areaOptions={viewAreas}
                onEdit={(index) => void openViewAddressModal("edit", index)}
                onDelete={handleDeleteAddress}
              />
            </section>
          ) : null}
          <Row className="custom-helper-row">
            <section
              className="custom-other-details"
              style={{ paddingBottom: "30px" }}
            >
              <h3 className="mb-3">Services</h3>
              <div className="user-details-service-stats">
                {(
                  [
                    {
                      label: "Total Services",
                      node: (
                        <button
                          type="button"
                          className="btn btn-link p-0 m-0 align-baseline text-decoration-underline"
                          style={{
                            fontFamily: "Inter",
                            fontSize: "16px",
                            color: "var(--primary-color)",
                          }}
                          onClick={() => openServices(null)}
                        >
                          {userDetails?.total_service ??
                            userDetails?.no_of_services ??
                            0}
                        </button>
                      ),
                    },
                    {
                      label: "Completed",
                      node: (
                        <span>{userDetails?.completed_service ?? "-"}</span>
                      ),
                    },
                    {
                      label: "In Progress",
                      node: (
                        <span>{userDetails?.in_progress_service ?? "-"}</span>
                      ),
                    },
                    {
                      label: "Cancelled",
                      node: (
                        <span>{userDetails?.cancelled_service ?? "-"}</span>
                      ),
                    },
                  ] as const
                ).map(({ label, node }) => (
                  <div
                    key={label}
                    className="d-flex align-items-baseline justify-content-between gap-3"
                    style={{ minHeight: "36px" }}
                  >
                    <span
                      className="custom-personal-row-title"
                      style={{
                        flex: "1 1 auto",
                        minWidth: 0,
                        fontSize: "16px",
                        fontWeight: 600,
                      }}
                    >
                      {label}
                    </span>
                    <span
                      className="custom-personal-row-value text-center"
                      style={{
                        flex: "0 0 8.5rem",
                        fontFamily: "Inter",
                        fontSize: "16px",
                        fontWeight: "normal",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {node}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <section className="custom-other-details">
              <h3>Payment</h3>
              <DetailsRow
                title="Total Payment"
                value={`${AppConstant.currencySymbol}${userDetails?.total_amount ?? 0}`}
              />
              <DetailsRow
                title="Paid amount"
                value={`${AppConstant.currencySymbol}${userDetails?.paid_amount ?? 0}`}
              />
              <DetailsRow
                title="Balance Amount"
                value={`${AppConstant.currencySymbol}${userDetails?.balance_amount ?? 0}`}
              />
            </section>
          </Row>
        </Modal.Body>
      </Modal>
      {userDetails ? (
        <UserViewAddressModal
          show={viewAddrModalOpen}
          title={viewAddrMode === "edit" ? "Edit address" : "Add address"}
          states={viewStates}
          cities={viewCities}
          areas={viewAreas}
          onFetchCities={onViewModalFetchCities}
          onFetchAreas={onViewModalFetchAreas}
          initial={viewAddressInitial}
          onHide={() => setViewAddrModalOpen(false)}
          onSave={handleViewAddressSave}
        />
      ) : null}
    </>
  );
};

UserDetailsDialog.show = showUserDetailsDialog;

export default UserDetailsDialog;

function isAddressActive(value: unknown): boolean {
  return value === true || String(value ?? "").toLowerCase() === "true";
}

function normalizeAddressStatus(value: unknown): "true" | "false" {
  return isAddressActive(value) ? "true" : "false";
}

function addressStatusToBoolean(status: unknown): boolean {
  return isAddressActive(status);
}

function getRawAddressArray(user: UserModel): Record<string, unknown>[] {
  const raw = (user as unknown as { address?: unknown }).address;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({ ...(item as Record<string, unknown>) }));
}

function getNormalizedAddresses(user: UserModel | undefined): UserAddressEntry[] {
  if (!user) return [];

  const toText = (value: unknown) => String(value ?? "").trim();

  const rootAddressFromFields: UserAddressEntry = {
    state_id: toText(user.state_id),
    city_id: toText(user.city_id),
    area_id: toText((user as { area_id?: unknown }).area_id),
    pincode: sanitizeIndianPincodeInput(toText(user.pincode)),
    address: toText(user.address),
    address_status: normalizeAddressStatus(
      (user as { address_status?: unknown }).address_status
    ),
  };

  const rawAddress = (user as unknown as { address?: unknown }).address;
  const addressArrayFromApi: unknown[] = Array.isArray(rawAddress)
    ? rawAddress
    : [];
  const addressRowsFromApi = addressArrayFromApi
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        _id: toText(row?._id),
        state_id: toText(row?.state_id),
        city_id: toText(row?.city_id),
        area_id: toText(row?.area_id),
        pincode: sanitizeIndianPincodeInput(toText(row?.pincode)),
        address: toText(row?.address),
        address_status: normalizeAddressStatus(row?.address_status),
        apiRow: row,
      } as UserAddressEntry;
    })
    .filter((x) => x.state_id || x.city_id || x.pincode || x.address);

  const extraRows = (user.extra_addresses ?? [])
    .map((row) => ({
      _id: String(row?._id ?? ""),
      state_id: toText(row?.state_id),
      city_id: toText(row?.city_id),
      area_id: toText((row as { area_id?: unknown })?.area_id),
      pincode: sanitizeIndianPincodeInput(toText(row?.pincode)),
      address: toText(row?.address),
      address_status: normalizeAddressStatus(
        (row as { address_status?: unknown })?.address_status
      ),
    }))
    .filter((x) => x.state_id || x.city_id || x.pincode || x.address);

  const combined: UserAddressEntry[] = (
    addressRowsFromApi.length
      ? addressRowsFromApi
      : [
          rootAddressFromFields,
          ...extraRows,
        ].filter((x) => x.state_id || x.city_id || x.pincode || x.address)
  ).map((x) => ({
    ...x,
    address_status: x.address_status === "true" ? "true" : "false",
  }));

  return enforceSingleActiveAddress(combined);
}

function mapAddressEntryToApiPayload(
  entry: UserAddressEntry,
  user: UserModel,
  rawRows: Record<string, unknown>[]
): Record<string, unknown> {
  const match =
    entry.apiRow ??
    rawRows.find((r) => String(r._id ?? "") === String(entry._id ?? ""));

  return {
    ...(match ?? {}),
    ...(entry._id ? { _id: entry._id } : {}),
    state_id: entry.state_id,
    city_id: entry.city_id,
    area_id: entry.area_id ?? "",
    pincode: entry.pincode,
    address: entry.address,
    contact_name: String(match?.contact_name ?? user.name ?? "").trim(),
    contact_number: String(match?.contact_number ?? user.phone_number ?? "").trim(),
    landmark: String(match?.landmark ?? "").trim(),
  };
}

function shouldSendAddressAsArray(
  user: UserModel,
  normalized: UserAddressEntry[]
): boolean {
  if (getRawAddressArray(user).length > 0) return true;
  return normalized.length > 1;
}

function buildAddressUpdatePayload(
  user: UserModel,
  normalized: UserAddressEntry[],
  common: Record<string, unknown>,
  options: { addNew: boolean }
): Record<string, unknown> {
  const rawRows = getRawAddressArray(user);

  if (normalized.length === 0) {
    if (shouldSendAddressAsArray(user, normalized)) {
      return {
        ...common,
        add_new_address: "false",
        address: [],
        extra_addresses: [],
      };
    }
    return {
      ...common,
      add_new_address: "false",
      address: "",
      state_id: "",
      city_id: "",
      area_id: "",
      pincode: "",
      extra_addresses: [],
    };
  }

  if (shouldSendAddressAsArray(user, normalized)) {
    return {
      ...common,
      add_new_address: options.addNew ? "true" : "false",
      address: normalized.map((entry) =>
        mapAddressEntryToApiPayload(entry, user, rawRows)
      ),
      extra_addresses: [],
    };
  }

  const root = normalized[0];
  return {
    ...common,
    add_new_address: options.addNew ? "true" : "false",
    address: root?.address ?? "",
    state_id: root?.state_id ?? "",
    city_id: root?.city_id ?? "",
    area_id: root?.area_id ?? "",
    pincode: root?.pincode ?? "",
    extra_addresses: normalized.slice(1).map((entry) => ({
      ...(entry._id ? { _id: entry._id } : {}),
      state_id: entry.state_id,
      city_id: entry.city_id,
      area_id: entry.area_id,
      pincode: entry.pincode,
      address: entry.address,
    })),
  };
}

function mergeUserWithAddresses(
  user: UserModel,
  addresses: UserAddressEntry[]
): UserModel {
  const rawAddress = (user as unknown as { address?: unknown }).address;
  const extraSlice = addresses.slice(1).map((x) => ({
    _id: x._id || undefined,
    state_id: x.state_id,
    city_id: x.city_id,
    area_id: x.area_id,
    pincode: x.pincode,
    address: x.address,
    address_status: addressStatusToBoolean(x.address_status),
  }));

  if (Array.isArray(rawAddress)) {
    if (addresses.length === 0) {
      return {
        ...user,
        address: "",
        state_id: "",
        city_id: "",
        area_id: "",
        pincode: "",
        extra_addresses: [],
      };
    }
    return {
      ...user,
      address: addresses.map((x) => ({
        _id: x._id || undefined,
        state_id: x.state_id,
        city_id: x.city_id,
        area_id: x.area_id,
        pincode: x.pincode,
        address: x.address,
        address_status: x.address_status,
      })) as unknown as string,
      state_id: addresses[0]?.state_id ?? "",
      city_id: addresses[0]?.city_id ?? "",
      area_id: addresses[0]?.area_id ?? "",
      pincode: addresses[0]?.pincode ?? "",
      extra_addresses: [],
    };
  }

  if (addresses.length === 0) {
    return {
      ...user,
      address: "",
      state_id: "",
      city_id: "",
      area_id: "",
      pincode: "",
      extra_addresses: [],
    };
  }

  const root = addresses[0];
  return {
    ...user,
    address: root.address,
    state_id: root.state_id,
    city_id: root.city_id,
    area_id: root.area_id,
    pincode: root.pincode,
    extra_addresses: extraSlice,
  };
}

/** Exactly one address may be active; optional `forceActiveIndex` when user sets Active on save. */
function enforceSingleActiveAddress(
  addresses: UserAddressEntry[],
  forceActiveIndex?: number
): UserAddressEntry[] {
  if (!addresses.length) return addresses;

  let activeIndex = -1;
  if (
    typeof forceActiveIndex === "number" &&
    forceActiveIndex >= 0 &&
    forceActiveIndex < addresses.length
  ) {
    activeIndex = forceActiveIndex;
  } else {
    activeIndex = addresses.findIndex((item) =>
      isAddressActive(item.address_status)
    );
    if (activeIndex < 0) activeIndex = 0;
  }

  return addresses.map((item, index) => ({
    ...item,
    address_status: index === activeIndex ? "true" : "false",
  }));
}
