import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Modal, Col, Row, Carousel } from "react-bootstrap";
import CustomCloseButton from "../CustomCloseButton";
import { UserModel } from "../../lib/models/UserModel";
import { fetchUserById } from "../../services/userService";
import editIcon from "../../assets/icons/edit_red.svg";
import addIcon from "../../assets/icons/add.svg";
import profileIcon from "../../assets/icons/profile.svg";
import {
  DetailsRow,
  DetailsRowLink,
  DetailsRowLinkDocument,
  PersonalAccountDetailsGrid,
} from "../../helper/utility";
import { formatGenderLabel } from "../../lib/user/genderOptions";
import AddEditBankAccountDialog from "../../pages/userManagement/AddEditBankAccountDialog";
import { DocumentModel } from "../../lib/models/DocumentModel";
import { AppConstant } from "../../lib/global/AppConstant";
import CustomUploadDialog from "../CustomUpload";
import { createOrUpdateDocument } from "../../services/documentUploadService";
import { updatePartnerDocument } from "../../services/partnerDocumentService";
import { showErrorAlert } from "../../lib/global/alertHelper";
import { CustomImagePreviewDialog } from "../CustomImagePreview";
import { ServiceDetailsDialog } from "../user";
import { openDialog } from "../../lib/global/DialogManager";
import { fetchCategoryDropDown } from "../../services/categoryService";
import { fetchService } from "../../services/servicesService";
import {
  buildViewCategoryServiceGroups,
  buildViewCategoryServiceGroupsFromPartnerServices,
} from "../../lib/partner/partnerCategoryServiceView";
import EditPartnerCategoriesServicesDialog from "../../pages/userManagement/EditPartnerCategoriesServicesDialog";
import AddEditUserDialog from "../../pages/userManagement/AddEditUserDialog";
import {
  partnerBankAccountsFromUser,
  partnerDocumentDisplayTitle,
} from "../../lib/partner/partnerFormDocuments";
import { resolvePartnerFranchiseFieldsFromUser } from "../../lib/partner/partnerFranchiseDisplay";
import PartnerSubscriptionDetailsRows from "./PartnerSubscriptionDetailsRows";
import PartnerVerificationStatusModal from "./PartnerVerificationStatusModal";

type PartnerDetailsDialogProps = {
  userId: string;
  onClose: () => void;
  onRefreshData: () => void;
};

type CatalogOption = { value: string; label: string };

type CatalogServiceLite = {
  _id: string;
  name: string;
  category_id: string;
  category_name?: string;
  desc?: string;
  price?: number | null;
};

function PartnerDetailsDialogView({
  userId,
  onClose,
  onRefreshData,
}: PartnerDetailsDialogProps) {
  const [userDetails, setUserDetails] = useState<UserModel>();
  const [catalogServices, setCatalogServices] = useState<CatalogServiceLite[]>(
    []
  );
  const [catalogCategoryOptions, setCatalogCategoryOptions] = useState<
    CatalogOption[]
  >([]);
  const [verificationStatusModalOpen, setVerificationStatusModalOpen] =
    useState(false);
  const [partnerFranchiseFields, setPartnerFranchiseFields] = useState({
    franchiseName: "—",
    franchiseEmail: "—",
  });
  const fetchRef = useRef(false);

  const partnerBankAccounts = useMemo(
    () => partnerBankAccountsFromUser(userDetails),
    [userDetails]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await resolvePartnerFranchiseFieldsFromUser(userDetails);
      if (!cancelled) setPartnerFranchiseFields(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [userDetails]);

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

  const onRefreshuser = useCallback(async () => {
    await fetchDataFromApi();
    onRefreshData();
  }, [fetchDataFromApi, onRefreshData]);

  useEffect(() => {
    void fetchDataFromApi();
  }, [fetchDataFromApi]);

  useEffect(() => {
    if (!userDetails?.city_id) {
      setCatalogServices([]);
      setCatalogCategoryOptions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [cats, svcRes] = await Promise.all([
          fetchCategoryDropDown(userDetails.city_id ?? undefined),
          fetchService(1, 500, {}),
        ]);
        if (cancelled) return;
        const catList = Array.isArray(cats)
          ? cats.filter((c: CatalogOption) => c?.value)
          : [];
        setCatalogCategoryOptions([
          { value: "select-all", label: "Select All" },
          ...catList,
        ]);
        const list =
          svcRes?.response && Array.isArray(svcRes.services)
            ? svcRes.services
            : [];
        setCatalogServices(
          list.map((s) => ({
            _id: String((s as { _id?: string })._id ?? ""),
            name: String((s as { name?: string }).name ?? ""),
            category_id: String(
              (s as { category_id?: string }).category_id ?? ""
            ),
            category_name: (s as { category_name?: string }).category_name
              ? String((s as { category_name?: string }).category_name)
              : undefined,
            desc: String((s as { desc?: string }).desc ?? ""),
            price:
              (s as { price?: number | null }).price !== undefined &&
              (s as { price?: number | null }).price !== null
                ? Number((s as { price?: number }).price)
                : undefined,
          }))
        );
      } catch {
        if (!cancelled) {
          setCatalogCategoryOptions([
            { value: "select-all", label: "Select All" },
          ]);
          setCatalogServices([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userDetails?.city_id, userDetails?._id]);

  const viewCategoryServiceGroups = useMemo(() => {
    if (!userDetails) return [];
    const fromPartnerServices =
      buildViewCategoryServiceGroupsFromPartnerServices(
        userDetails.partner_services
      );
    if (fromPartnerServices.length > 0) return fromPartnerServices;
    return buildViewCategoryServiceGroups(
      {
        category_ids: userDetails.category_ids ?? undefined,
        service_ids: userDetails.service_ids ?? undefined,
        category_names: userDetails.category_names ?? undefined,
        service_names: userDetails.service_names ?? undefined,
      },
      catalogServices,
      catalogCategoryOptions
    );
  }, [userDetails, catalogServices, catalogCategoryOptions]);

  const openServices = (status: number | null) => {
    // `order_service/getAll?partner_id=` expects the partner document `_id` (ObjectId). Passing display id (e.g. P1029) can trigger a 500 from the API.
    ServiceDetailsDialog.show(userId, true, status, onRefreshuser);
  };

  const addDocument = (document: DocumentModel) => {
    CustomUploadDialog.show(async (files, replaceUrls) => {
      const formData = new FormData();
      formData.append("type", "1");
      files.forEach((file) => formData.append("files", file));

      let { response, fileList } = await createOrUpdateDocument(
        formData,
        false
      );

      if (response) {
        const payload = {
          image_url: fileList[0],
        };
        if (!document?._id) {
          showErrorAlert("Unable to update. ID is missing.");
          return;
        }

        let responseUpdate = await updatePartnerDocument(payload, document._id);
        if (responseUpdate) {
          onRefreshuser();
        }
      }
    });
  };

  return (
    <>
      <Modal
        show={true}
        onHide={onClose}
        centered
        scrollable
        size="xl"
        dialogClassName="custom-big-modal partner-details-dialog"
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            Partner Information
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
                width={160}
                height={160}
                className="partner-details-profile-img"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src !== profileIcon) img.src = profileIcon;
                }}
              />
            </div>

            <div className="custom-personal-details">
              <PersonalAccountDetailsGrid
                showPartnerFields
                nameLabel="Partner Name"
                name={userDetails?.name}
                dateOfBirth={userDetails?.date_of_birth}
                genderLabel={formatGenderLabel(userDetails?.gender)}
                email={userDetails?.email}
                phone={userDetails?.phone_number}
                registeredDate={userDetails?.created_at}
                lastServiceDate={userDetails?.last_service_date}
                experience={userDetails?.experience}
                stateName={userDetails?.state_name}
                cityName={userDetails?.city_name}
                areaName={userDetails?.area_name}
                pincode={userDetails?.pincode}
                isActive={userDetails?.is_active}
                address={
                  typeof userDetails?.address === "string"
                    ? userDetails.address
                    : ""
                }
                franchiseName={partnerFranchiseFields.franchiseName}
                // franchiseEmail={partnerFranchiseFields.franchiseEmail}
              />
            </div>
            <img
              src={editIcon}
              alt="edit"
              onClick={() => {
                if (!userDetails) return;
                AddEditUserDialog.show(2, true, userDetails, onRefreshuser);
              }}
            />
          </div>
          <div className="partner-details-sections-stack">
          <section className="custom-other-details">
            <h3>Subscription</h3>
            <PartnerSubscriptionDetailsRows user={userDetails} />
          </section>
          <Row className="custom-helper-row align-items-stretch partner-details-serviced-payment-row g-3">
            <Col className="d-flex flex-column">
              <section className="custom-other-details flex-grow-1 w-100 h-100">
                <h3>Serviced</h3>
                <DetailsRowLink
                  title="No of Services"
                  value={
                    (userDetails?.completed_service || 0) +
                    (userDetails?.in_progress_service || 0) +
                    (userDetails?.cancelled_service || 0)
                  }
                  onClick={() => openServices(null)}
                />
                <DetailsRowLink
                  title="Completed"
                  value={userDetails?.completed_service}
                  onClick={() => openServices(3)}
                />
                <DetailsRowLink
                  title="In Progress"
                  value={userDetails?.in_progress_service}
                  onClick={() => openServices(2)}
                />
                <DetailsRowLink
                  title="Cancelled"
                  value={userDetails?.cancelled_service}
                  onClick={() => openServices(4)}
                />
              </section>
            </Col>

            <Col className="d-flex flex-column">
              <section className="custom-other-details flex-grow-1 w-100 h-100">
                <h3>Payment</h3>
                <DetailsRow
                  title="Total Earnings"
                  value={`${AppConstant.currencySymbol}${userDetails?.total_amount ?? 0}`}
                />
                <DetailsRow
                  title="Paid Amount"
                  value={`${AppConstant.currencySymbol}${userDetails?.paid_amount ?? 0}`}
                />
                <DetailsRow
                  title="Balance Amount"
                  value={`${AppConstant.currencySymbol}${userDetails?.balance_amount ?? 0}`}
                />
              </section>
            </Col>
          </Row>
          <Row className="custom-helper-row align-items-stretch partner-details-categories-row g-3">
            <Col xs={12}>
              <section className="custom-other-details w-100">
                <div className="partner-details-section-header">
                  <h3>Categories &amp; services</h3>
                  {userDetails ? (
                      <img
                        src={editIcon}
                        alt="Edit categories and services"
                        title="Edit categories and services"
                        style={{
                          width: "15px",
                          height: "15px",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                        onClick={() => {
                          openDialog(
                            "edit-partner-categories-services",
                            (close) => (
                              <EditPartnerCategoriesServicesDialog
                                key={`${userDetails._id}-cat-svc-${Date.now()}`}
                                user={userDetails}
                                initialCategoryIds={(
                                  userDetails.category_ids ?? []
                                ).map(String)}
                                initialServiceIds={(
                                  userDetails.service_ids ?? []
                                ).map(String)}
                                onClose={close}
                                onSaved={() => {
                                  void onRefreshuser();
                                  close();
                                }}
                              />
                            )
                          );
                        }}
                      />
                  ) : null}
                </div>
                <div
                  className="rounded position-relative"
                  style={{
                    borderColor: "var(--lb1-border)",
                    background: "var(--bg-color)",
                  }}
                >
                  {viewCategoryServiceGroups.length === 0 ? (
                    <div className="text-muted small py-2">
                      No categories and services
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table
                        className="table table-sm table-bordered mb-0 align-middle"
                        style={{
                          fontSize: "13px",
                          color: "var(--content-txt-color)",
                          borderColor: "var(--lb1-border)",
                        }}
                      >
                        <thead>
                          <tr
                            className=""
                            style={{ borderColor: "var(--lb1-border)" }}
                          >
                            <th
                              scope="col"
                              className="fw-semibold py-1 ps-3 pe-0"
                              style={{
                                width: "22%",
                                minWidth: "120px",
                                color: "var(--primary-txt-color)",
                              }}
                            >
                              Category
                            </th>
                            <th
                              scope="col"
                              className="fw-semibold  py-2 ps-3 pe-0"
                              style={{ color: "var(--primary-txt-color)" }}
                            >
                              Services offered
                            </th>
                            <th
                              scope="col"
                              className="fw-semibold  py-2 ps-3 pe-0"
                              style={{ color: "var(--primary-txt-color)" }}
                            >
                              Description
                            </th>
                            <th
                              scope="col"
                              className="fw-semibold  py-2 ps-3 pe-0"
                              style={{ color: "var(--primary-txt-color)" }}
                            >
                              Price
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewCategoryServiceGroups.flatMap((g) => {
                            const rows =
                              g.rows.length > 0
                                ? g.rows
                                : [
                                    {
                                      name: "—",
                                      description: "—",
                                      price: "—",
                                    },
                                  ];
                            const rowSpan = rows.length;
                            return rows.map((row, idx) => (
                              <tr
                                key={`${g.categoryId}-${
                                  row.serviceId ?? row.name
                                }-${idx}`}
                                style={{ borderColor: "var(--lb1-border)" }}
                              >
                                {idx === 0 ? (
                                  <td
                                    className="align-middle py-2 ps-3 text-wrap fw-medium fs-6"
                                    rowSpan={rowSpan}
                                    style={{
                                      color: "#101010",
                                      verticalAlign: "middle",
                                      borderRight:
                                        "1px solid var(--lb1-border)",
                                    }}
                                  >
                                    {g.categoryLabel}
                                  </td>
                                ) : null}
                                <td className="align-top py-2 ps-3 pe-2 text-wrap fs-6">
                                  {row.name}
                                </td>
                                <td className="align-top py-2 ps-2 pe-2 text-wrap small fs-6">
                                  {row.description}
                                </td>
                                <td className="align-top py-2 ps-2 pe-3 text-nowrap fw-semibold fs-6">
                                  {row.price}
                                </td>
                              </tr>
                            ));
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            </Col>
          </Row>
          <Row className="custom-helper-row g-3 align-items-stretch partner-details-docs-bank-row">
            <Col className="d-flex flex-column">
              <section className="custom-other-details partner-details-docs-bank-panel flex-grow-1 d-flex flex-column">
                <div className="partner-details-section-header">
                  <h3>Verification &amp; Documents</h3>
                  {userDetails ? (
                    <img
                      src={editIcon}
                      alt="Edit verification status"
                      title="Edit verification status"
                      style={{
                        width: "15px",
                        height: "15px",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                      onClick={() => setVerificationStatusModalOpen(true)}
                    />
                  ) : null}
                </div>
                <div className="partner-details-docs-bank-body flex-grow-1">
                {!userDetails?.documents?.length ? (
                  <div className="text-muted small py-2">No documents</div>
                ) : (
                  userDetails.documents.map((document) => (
                    <DetailsRowLinkDocument
                      key={
                        document._id ??
                        document.document_id ??
                        document.name ??
                        ""
                      }
                      title={partnerDocumentDisplayTitle(document.name)}
                      isEditable={
                        document.document_image === "" ? false : true
                      }
                      onViewClick={() => CustomImagePreviewDialog(document)}
                      onAddClick={() => addDocument(document)}
                      // onDeleteClick={() => addDocument(document)}
                    />
                  ))
                )}
                </div>
              </section>
            </Col>

            <Col className="d-flex flex-column">
              <section className="custom-other-details partner-details-docs-bank-panel flex-grow-1 d-flex flex-column">
                <div className="partner-details-section-header">
                  <h3>Bank Accounts</h3>
                  <div
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      AddEditBankAccountDialog.show(
                        userId,
                        false,
                        null,
                        onRefreshuser
                      );
                    }}
                  >
                    <img
                      src={addIcon}
                      alt="Add bank account"
                      title="Add bank account"
                      style={{ width: "18px", height: "18px" }}
                    />
                    <span
                      style={{
                        textDecoration: "underline",
                        color: "var(--primary-txt-color)",
                      }}
                    >
                      Add
                    </span>
                  </div>
                </div>
                {/*
                                    <DetailsRow title="Account Name" value={userDetails?.bank_account?.account_holder_name} />
                                    <DetailsRow title="Account Number" value={userDetails?.bank_account?.account_number} />
                                    <DetailsRow title="IFSC Code" value={userDetails?.bank_account?.ifsc_code} />
                                    <DetailsRow title="Bank Name" value={userDetails?.bank_account?.bank_name} />
                                    */}
                <div className="partner-details-docs-bank-body flex-grow-1">
                {partnerBankAccounts.length === 0 ? (
                  <div className="text-muted small py-2">No bank info</div>
                ) : (
                <Carousel
                  key={partnerBankAccounts.map((a) => a._id).join("-")}
                  className="partner-accounts-carousel"
                  interval={null}
                  controls={partnerBankAccounts.length > 1}
                  indicators={partnerBankAccounts.length > 1}
                  prevIcon={
                    <i
                      className="bi bi-chevron-left fs-4 text-danger "
                      aria-hidden
                    />
                  }
                  nextIcon={
                    <i
                      className="bi bi-chevron-right fs-4 text-danger"
                      aria-hidden
                    />
                  }
                >
                  {partnerBankAccounts.map((acc) => (
                    <Carousel.Item key={acc._id || acc.account_number}>
                      <div
                        className="rounded border px-3 py-3 mx-3 mb-4 position-relative"
                        style={{
                          borderColor: "var(--lb1-border)",
                          background: "var(--bg-color)",
                        }}
                      >
                        <img
                          src={editIcon}
                          alt="Edit bank account"
                          title="Edit bank account"
                          className="position-absolute"
                          style={{
                            top: "0.75rem",
                            right: "0.75rem",
                            width: "15px",
                            height: "15px",
                            cursor: "pointer",
                            zIndex: 1,
                          }}
                          onClick={() => {
                            AddEditBankAccountDialog.show(
                              userId,
                              Boolean(acc._id),
                              acc,
                              onRefreshuser
                            );
                          }}
                        />
                        <DetailsRow
                          title="Account Name"
                          value={acc.account_holder_name}
                        />
                        <DetailsRow
                          title="Account Number"
                          value={acc.account_number}
                        />
                        <DetailsRow title="IFSC Code" value={acc.ifsc_code} />
                        <DetailsRow title="Bank Name" value={acc.bank_name} />
                        <DetailsRow
                          title="Branch"
                          value={acc.branch_name || "—"}
                        />
                        <DetailsRow
                          title="Account Status"
                          value={
                            <span
                              className={
                                acc.is_active !== false
                                  ? "custom-active"
                                  : "custom-inactive"
                              }
                            >
                              {acc.is_active !== false ? "Active" : "Inactive"}
                            </span>
                          }
                        />
                      </div>
                    </Carousel.Item>
                  ))}
                </Carousel>
                )}
                </div>
              </section>
            </Col>
          </Row>
          </div>
        </Modal.Body>
      </Modal>
      <PartnerVerificationStatusModal
        show={verificationStatusModalOpen}
        userId={userId}
        userDetails={userDetails}
        onClose={() => setVerificationStatusModalOpen(false)}
        onSaved={onRefreshuser}
      />
    </>
  );
}

const PartnerDetailsDialog = Object.assign(PartnerDetailsDialogView, {
  show(userId: string, onRefreshData: () => void) {
    openDialog("partner-details-modal", (close) => (
      <PartnerDetailsDialogView
        userId={userId}
        onClose={close}
        onRefreshData={onRefreshData}
      />
    ));
  },
}) as typeof PartnerDetailsDialogView & {
  show: (userId: string, onRefreshData: () => void) => void;
};

export default PartnerDetailsDialog;
