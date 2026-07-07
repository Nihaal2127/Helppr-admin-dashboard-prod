import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Modal, Row, Col, Form, Button, Carousel } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { UserModel } from "../../lib/models/UserModel";
import { DocumentModel } from "../../lib/models/DocumentModel";
import { fetchUserById, updatePartnerVerificationDecision } from "../../services/userService";
import {
  normalizePartnerVerification,
  PARTNER_VERIFICATION,
} from "../../lib/partner/partnerVerification";
import {
  DetailsRow,
  FullDetailsRow,
  PersonalAccountDetailsGrid,
} from "../../helper/utility";
import { CustomImagePreviewDialog } from "../../components/CustomImagePreview";
import { showErrorAlert, showSuccessAlert } from "../../lib/global/alertHelper";
import { openDialog } from "../../lib/global/DialogManager";
import editIcon from "../../assets/icons/edit_red.svg";
import addIcon from "../../assets/icons/add.svg";
import profileIcon from "../../assets/icons/profile.svg";
import AddEditBankAccountDialog from "./AddEditBankAccountDialog";
import { AppConstant } from "../../lib/global/AppConstant";
import {
  updatePartnerDocument,
  updateStatusDocument,
} from "../../services/partnerDocumentService";
import CustomUploadDialog from "../../components/CustomUpload";
import { createOrUpdateDocument } from "../../services/documentUploadService";
import { fetchCategoryDropDown } from "../../services/categoryService";
import { fetchService } from "../../services/servicesService";
import {
  buildViewCategoryServiceGroups,
  buildViewCategoryServiceGroupsFromPartnerServices,
} from "../../lib/partner/partnerCategoryServiceView";
import EditPartnerCategoriesServicesDialog from "./EditPartnerCategoriesServicesDialog";
import AddEditUserDialog from "./AddEditUserDialog";
import {
  partnerBankAccountsFromUser,
  PARTNER_VERIFICATION_DOCUMENT_SLOTS,
  findPartnerDocumentForSlot,
  partnerDocumentHasUploadedImage,
} from "../../lib/partner/partnerFormDocuments";
import { resolvePartnerFranchiseFieldsFromUser } from "../../lib/partner/partnerFranchiseDisplay";
import { formatGenderLabel } from "../../lib/user/genderOptions";
import PartnerSubscriptionDetailsRows from "../../components/partner/PartnerSubscriptionDetailsRows";

type CatalogOption = { value: string; label: string };

type CatalogServiceLite = {
  _id: string;
  name: string;
  category_id: string;
  category_name?: string;
  desc?: string;
  price?: number | null;
};

type PartnerVerificationReviewModalProps = {
  userId: string;
  onClose: () => void;
  onSaved: () => void;
};

function PartnerVerificationReviewModalView({
  userId,
  onClose,
  onSaved,
}: PartnerVerificationReviewModalProps) {
  const [userDetails, setUserDetails] = useState<UserModel>();
  const [catalogServices, setCatalogServices] = useState<CatalogServiceLite[]>(
    []
  );
  const [catalogCategoryOptions, setCatalogCategoryOptions] = useState<
    CatalogOption[]
  >([]);
  const fetchRef = useRef(false);
  const [docDecisionOpen, setDocDecisionOpen] = useState(false);
  const [docDecisionTarget, setDocDecisionTarget] =
    useState<DocumentModel | null>(null);
  const [docDecision, setDocDecision] = useState<"approve" | "reject">(
    "approve"
  );
  const [docRejectReason, setDocRejectReason] = useState("");
  const [docDecisionSubmitting, setDocDecisionSubmitting] = useState(false);
  const [partnerProfileImgFailed, setPartnerProfileImgFailed] =
    useState(false);
  const [partnerLevelModalOpen, setPartnerLevelModalOpen] = useState(false);
  const [partnerLevelDecision, setPartnerLevelDecision] = useState<
    "approve" | "reject"
  >("approve");
  const [partnerLevelRejectReason, setPartnerLevelRejectReason] =
    useState("");
  const [partnerLevelSubmitting, setPartnerLevelSubmitting] = useState(false);
  const [partnerFranchiseFields, setPartnerFranchiseFields] = useState({
    franchiseName: "—",
    franchiseEmail: "—",
  });

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
    onSaved();
  }, [fetchDataFromApi, onSaved]);

  useEffect(() => {
    void fetchDataFromApi();
  }, [fetchDataFromApi]);

  useEffect(() => {
    setPartnerProfileImgFailed(false);
  }, [userDetails?._id, userDetails?.profile_url]);

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

  const addDocument = useCallback(
    (document: DocumentModel) => {
      CustomUploadDialog.show(async (files, _replaceUrls) => {
        const formData = new FormData();
        formData.append("type", "1");
        files.forEach((file) => formData.append("files", file));

        const { response, fileList } = await createOrUpdateDocument(
          formData,
          false
        );

        if (response) {
          const payload = { image_url: fileList[0] };
          if (!document?._id) {
            showErrorAlert("Unable to update. ID is missing.");
            return;
          }

          const responseUpdate = await updatePartnerDocument(
            payload,
            document._id
          );
          if (responseUpdate) {
            void onRefreshuser();
          }
        }
      });
    },
    [onRefreshuser]
  );

  const openPartnerLevelVerificationModal = useCallback(() => {
    if (!userDetails) return;
    if (
      normalizePartnerVerification(userDetails.is_verified) ===
      PARTNER_VERIFICATION.APPROVED
    ) {
      showErrorAlert(
        "Partner verification cannot be changed after approval."
      );
      return;
    }
    const norm = normalizePartnerVerification(userDetails.is_verified);
    if (norm === PARTNER_VERIFICATION.REJECTED) {
      setPartnerLevelDecision("reject");
      setPartnerLevelRejectReason(
        String(userDetails.verification_rejection_reason ?? "").trim()
      );
    } else {
      setPartnerLevelDecision("approve");
      setPartnerLevelRejectReason("");
    }
    setPartnerLevelModalOpen(true);
  }, [userDetails]);

  const closePartnerLevelVerificationModal = useCallback(() => {
    setPartnerLevelModalOpen(false);
    setPartnerLevelDecision("approve");
    setPartnerLevelRejectReason("");
    setPartnerLevelSubmitting(false);
  }, []);

  const submitPartnerLevelVerification = useCallback(async () => {
    if (!userId.trim()) return;
    // if (
    //   userDetails &&
    //   normalizePartnerVerification(userDetails.is_verified) ===
    //     PARTNER_VERIFICATION.APPROVED
    // ) {
    //   showErrorAlert("Partner is already approved.");
    //   return;
    // }
    if (
      partnerLevelDecision === "reject" &&
      !partnerLevelRejectReason.trim()
    ) {
      showErrorAlert("Please enter a rejection reason.");
      return;
    }
    if (partnerLevelDecision === "approve") {
      const missingMandatoryDocs: string[] = [];
      for (const slotId of ["pan_card", "aadhar_card"] as const) {
        const slot = PARTNER_VERIFICATION_DOCUMENT_SLOTS.find(
          (s) => s.id === slotId
        );
        if (!slot) continue;
        const doc = findPartnerDocumentForSlot(
          userDetails?.documents,
          slot
        );
        if (!partnerDocumentHasUploadedImage(doc)) {
          missingMandatoryDocs.push(slot.title);
        }
      }
      if (missingMandatoryDocs.length > 0) {
        showErrorAlert(
          `${missingMandatoryDocs.join(" and ")} must be uploaded before approving the partner.`
        );
        return;
      }
    }
    setPartnerLevelSubmitting(true);
    try {
      const ok = await updatePartnerVerificationDecision(userId, {
        approved: partnerLevelDecision === "approve",
        ...(partnerLevelDecision === "reject"
          ? {
              verification_rejection_reason:
                partnerLevelRejectReason.trim(),
            }
          : {}),
      });
      if (ok) {
        showSuccessAlert(
          partnerLevelDecision === "approve"
            ? "Partner verified successfully."
            : "Partner verification rejected."
        );
        closePartnerLevelVerificationModal();
        await onRefreshuser();
      }
    } finally {
      setPartnerLevelSubmitting(false);
    }
  }, [
    userId,
    userDetails,
    partnerLevelDecision,
    partnerLevelRejectReason,
    closePartnerLevelVerificationModal,
    onRefreshuser,
  ]);

  const closeDocumentDecisionModal = useCallback(() => {
    setDocDecisionOpen(false);
    setDocDecisionTarget(null);
    setDocDecision("approve");
    setDocRejectReason("");
    setDocDecisionSubmitting(false);
  }, []);

  const submitDocumentDecision = useCallback(async () => {
    if (!docDecisionTarget?._id) {
      showErrorAlert("Unable to update. Document id is missing.");
      return;
    }
    if (
      userDetails &&
      normalizePartnerVerification(userDetails.is_verified) ===
        PARTNER_VERIFICATION.APPROVED
    ) {
      showErrorAlert(
        "Document verification cannot be changed after the partner is approved."
      );
      return;
    }
    if (docDecision === "reject" && !docRejectReason.trim()) {
      showErrorAlert("Please enter a rejection reason.");
      return;
    }
    setDocDecisionSubmitting(true);
    try {
      const payload: Record<string, unknown> =
        docDecision === "approve"
          ? { status: 2 }
          : {
              status: 3,
              rejected_reasone: docRejectReason.trim(),
            };
      const ok = await updateStatusDocument(payload, docDecisionTarget._id);
      if (ok) {
        showSuccessAlert(
          docDecision === "approve"
            ? "Document approved."
            : "Document rejected."
        );
        closeDocumentDecisionModal();
        await onRefreshuser();
      }
    } finally {
      setDocDecisionSubmitting(false);
    }
  }, [
    docDecisionTarget,
    docDecision,
    docRejectReason,
    closeDocumentDecisionModal,
    onRefreshuser,
    userDetails,
  ]);

  const pendingOrRejected =
    userDetails &&
    normalizePartnerVerification(userDetails.is_verified) !==
      PARTNER_VERIFICATION.APPROVED;

  const partnerVerificationRejectionReason = useMemo(
    () => String(userDetails?.verification_rejection_reason ?? "").trim(),
    [userDetails?.verification_rejection_reason]
  );

  return (
    <>
      <Modal
        show
        centered
        onHide={onClose}
        size="xl"
        scrollable
        enforceFocus={false}
        dialogClassName="custom-big-modal partner-details-dialog"
      >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          Partner verification
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        <section className="custom-other-details partner-verification-summary-block mb-3">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >
            <h3 style={{ margin: 0 }}>Partner details</h3>
            {userDetails ? (
              <img
                src={editIcon}
                alt="Edit partner details"
                title="Edit partner details"
                style={{
                  width: "15px",
                  height: "15px",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                onClick={() =>
                  AddEditUserDialog.show(2, true, userDetails, () =>
                    void onRefreshuser()
                  )
                }
              />
            ) : null}
          </div>

          <Row className="align-items-start g-3 partner-verification-details-row">
            <Col xs="auto" className="text-center">
              <img
                src={
                  userDetails &&
                  String(userDetails.profile_url ?? "").trim() &&
                  !partnerProfileImgFailed
                    ? `${AppConstant.IMAGE_BASE_URL}${String(
                        userDetails.profile_url
                      ).trim()}?t=${Date.now()}`
                    : profileIcon
                }
                alt={
                  userDetails?.name
                    ? `${userDetails.name} profile photo`
                    : "Partner profile photo"
                }
                width={140}
                height={140}
                className="partner-details-profile-img"
                onError={() => setPartnerProfileImgFailed(true)}
                style={{
                  objectFit: "cover",
                  border: "2px solid var(--lb1-border)",
                  backgroundColor: "var(--bg-color)",
                  display: "block",
                }}
              />
            </Col>
            <Col className="min-w-0">
              <PersonalAccountDetailsGrid
                showPartnerFields
                nameLabel="Partner Name"
                name={userDetails?.name}
                dateOfBirth={userDetails?.date_of_birth}
                genderLabel={formatGenderLabel(userDetails?.gender)}
                email={userDetails?.email}
                phone={userDetails?.phone_number}
                registeredDate={userDetails?.created_at}
                experience={userDetails?.experience}
                stateName={userDetails?.state_name}
                cityName={userDetails?.city_name}
                areaName={userDetails?.area_name}
                pincode={userDetails?.pincode}
                address={
                  typeof userDetails?.address === "string"
                    ? userDetails.address
                    : ""
                }
                franchiseName={partnerFranchiseFields.franchiseName}
                accountStatusMode="verification"
                partnerVerificationStatus={userDetails?.is_verified}
              />
            </Col>
          </Row>
        </section>

        <section className="custom-other-details partner-verification-summary-block mb-3">
          <h3 className="mb-2">Subscription</h3>
          <PartnerSubscriptionDetailsRows user={userDetails} />
        </section>

        <Row className="custom-helper-row">
          <Col xs={12}>
            <section
              className="custom-other-details"
              style={{ marginLeft: "0px", marginRight: "0px" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "10px",
                  paddingRight: "20px",
                  paddingBottom: "15px",
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>Categories &amp; services</h3>
                </div>
                <div>
                  {userDetails ? (
                    <img
                      src={editIcon}
                      alt="Edit categories and services"
                      title="Edit categories and services"
                      className="position-absolute"
                      style={{
                        width: "15px",
                        height: "15px",
                        cursor: "pointer",
                        zIndex: 1,
                      }}
                      onClick={() => {
                        openDialog(
                          "edit-partner-categories-services-ver",
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
              </div>
              <div
                className="rounded position-relative"
                style={{
                  borderColor: "var(--lb1-border)",
                  background: "var(--bg-color)",
                }}
              >
                {viewCategoryServiceGroups.length === 0 ? (
                  <div className="text-muted small py-1">-</div>
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
                        <tr style={{ borderColor: "var(--lb1-border)" }}>
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
                            className="fw-semibold py-2 ps-3 pe-0"
                            style={{ color: "var(--primary-txt-color)" }}
                          >
                            Services offered
                          </th>
                          <th
                            scope="col"
                            className="fw-semibold py-2 ps-3 pe-0"
                            style={{ color: "var(--primary-txt-color)" }}
                          >
                            Description
                          </th>
                          <th
                            scope="col"
                            className="fw-semibold py-2 ps-3 pe-0"
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
                                    borderRight: "1px solid var(--lb1-border)",
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

        <Row className="custom-helper-row mt-2">
          <Col xs={12} lg={6}>
            <section
              className="custom-other-details h-100"
              style={{ marginLeft: "0px", marginRight: "0px" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "10px",
                  paddingRight: "4px",
                }}
              >
                <h3 style={{ margin: 0 }}>Verification &amp; Documents</h3>
                {userDetails ? (
                  <img
                    src={editIcon}
                    alt="Edit partner verification status"
                    title="Set partner verification status"
                    style={{
                      width: "15px",
                      height: "15px",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                    onClick={() => openPartnerLevelVerificationModal()}
                  />
                ) : null}
              </div>
              <div className="d-flex flex-column gap-1 mt-2">
                {PARTNER_VERIFICATION_DOCUMENT_SLOTS.map((slot) => {
                  const doc = findPartnerDocumentForSlot(
                    userDetails?.documents,
                    slot
                  );
                  const hasFile = partnerDocumentHasUploadedImage(doc);
                  const canAct = Boolean(pendingOrRejected);

                  return (
                    <Row
                      key={slot.id}
                      className="row custom-personal-row align-items-center flex-wrap gx-2"
                    >
                      <Col className="custom-document-title" xs={6} sm={5} md={4}>
                        {slot.title}
                      </Col>
                      <Col
                        xs={6}
                        sm={7}
                        md={8}
                        className="d-flex flex-wrap align-items-center justify-content-sm-end gap-2 mt-1 mt-sm-0"
                      >
                        {!hasFile ? (
                          <label
                            className="custom-document-add mb-0"
                            style={{ cursor: "pointer" }}
                            onClick={(e) => {
                              e.preventDefault();
                              if (doc) {
                                addDocument(doc);
                              } else {
                                showErrorAlert(
                                  "No document record for this type yet."
                                );
                              }
                            }}
                          >
                            Add
                          </label>
                        ) : (
                          <>
                            <label
                              className="custom-document-view mb-0"
                              onClick={(e) => {
                                e.preventDefault();
                                if (doc) CustomImagePreviewDialog(doc);
                              }}
                            >
                              View
                            </label>
                            <span className="text-muted mx-1">|</span>
                            <label
                              className={`custom-document-delete mb-0 ${
                                !canAct || !doc?._id ? "opacity-50" : ""
                              }`}
                              style={{
                                cursor:
                                  !canAct || !doc?._id
                                    ? "not-allowed"
                                    : "pointer",
                                pointerEvents:
                                  !canAct || !doc?._id ? "none" : "auto",
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                if (!canAct || !doc?._id) return;
                                if (doc) addDocument(doc);
                              }}
                            >
                              Update
                            </label>
                          </>
                        )}
                      </Col>
                    </Row>
                  );
                })}
              </div>
              {partnerVerificationRejectionReason ? (
                <div className="mt-3">
                  <FullDetailsRow
                    title="Rejection reason"
                    value={partnerVerificationRejectionReason}
                  />
                </div>
              ) : null}
            </section>
          </Col>
          <Col xs={12} lg={6}>
            <section
              className="custom-other-details h-100"
              style={{ marginLeft: "0px", marginRight: "0px" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "10px",
                }}
              >
                <h3 style={{ margin: 0 }}>Bank Accounts</h3>
                {userDetails ? (
                  <div
                    style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
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
                        fontSize: "14px",
                      }}
                    >
                      Add
                    </span>
                  </div>
                ) : null}
              </div>
              {partnerBankAccounts.length === 0 ? (
                <div className="text-muted small py-1">No bank info</div>
              ) : (
                <Carousel
                  key={partnerBankAccounts.map((a) => a._id).join("-")}
                  className="partner-accounts-carousel"
                  interval={null}
                  controls={partnerBankAccounts.length > 1}
                  style={{ marginTop: "0.5rem" }}
                  indicators={partnerBankAccounts.length > 1}
                  prevIcon={
                    <i
                      className="bi bi-chevron-left fs-4 text-danger"
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
                        className="rounded border px-3 py-3 mx-1 mb-2 position-relative"
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
                      value={acc.account_holder_name || "—"}
                    />
                    <DetailsRow
                      title="Account Number"
                      value={acc.account_number || "—"}
                    />
                    <DetailsRow
                      title="IFSC Code"
                      value={acc.ifsc_code || "—"}
                    />
                    <DetailsRow title="Bank Name" value={acc.bank_name || "—"} />
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
            </section>
          </Col>
        </Row>
      </Modal.Body>
    </Modal>

      <Modal
        show={docDecisionOpen}
        centered
        onHide={closeDocumentDecisionModal}
        enforceFocus={false}
        backdrop="static"
        size="lg"
        dialogClassName="custom-big-modal"
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title mb-0">
            Document verification
          </Modal.Title>
          <CustomCloseButton onClose={closeDocumentDecisionModal} />
        </Modal.Header>
        <Modal.Body className="px-4 pb-4 pt-0">
          <Row className="g-3">
            <Col xs={12}>
              <DetailsRow
                title="Document"
                value={docDecisionTarget?.name ?? "—"}
              />
            </Col>
            <Col xs={12}>
              <Row className="align-items-start g-2">
                <Col xs={12} sm={4} md={3} className="pt-sm-1">
                  <label className="custom-profile-lable mb-0">
                    Verification status
                  </label>
                </Col>
                <Col xs={12} sm={8} md={9}>
                  <div className="d-flex flex-wrap gap-3 align-items-center">
                    <Form.Check
                      type="radio"
                      id={`doc-ver-approve-${docDecisionTarget?._id ?? "x"}`}
                      name="doc-verification-decision"
                      className="custom-radio-check"
                      label={
                        <span className="custom-radio-text">Approve</span>
                      }
                      checked={docDecision === "approve"}
                      onChange={() => setDocDecision("approve")}
                    />
                    <Form.Check
                      type="radio"
                      id={`doc-ver-reject-${docDecisionTarget?._id ?? "x"}`}
                      name="doc-verification-decision"
                      className="custom-radio-check"
                      label={
                        <span className="custom-radio-text">Reject</span>
                      }
                      checked={docDecision === "reject"}
                      onChange={() => setDocDecision("reject")}
                    />
                  </div>
                </Col>
              </Row>
            </Col>
            {docDecision === "reject" ? (
              <Col xs={12}>
                <Form.Group className="mb-0">
                  <Form.Label className="custom-profile-lable mb-1">
                    Rejection reason
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={4}
                    placeholder="Enter rejection reason"
                    value={docRejectReason}
                    onChange={(e) => setDocRejectReason(e.target.value)}
                  />
                </Form.Group>
              </Col>
            ) : null}
            <Col xs={12} className="d-flex justify-content-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline-secondary"
                className="custom-btn-secondary"
                disabled={docDecisionSubmitting}
                onClick={closeDocumentDecisionModal}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="custom-btn-primary"
                disabled={docDecisionSubmitting}
                onClick={() => void submitDocumentDecision()}
              >
                {docDecisionSubmitting ? "Updating..." : "Update"}
              </Button>
            </Col>
          </Row>
        </Modal.Body>
      </Modal>

      <Modal
        show={partnerLevelModalOpen}
        centered
        onHide={closePartnerLevelVerificationModal}
        enforceFocus={false}
        backdrop="static"
        dialogClassName="partner-verification-status-modal"
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title mb-0">
            Verification status
          </Modal.Title>
          <CustomCloseButton onClose={closePartnerLevelVerificationModal} />
        </Modal.Header>
        <Modal.Body className="px-4 pb-4 pt-0">
          <Row className="g-3">
            <Col xs={12}>
              <Row className="align-items-start g-2">
                <Col xs={12} sm={5} className="pt-sm-1">
                  <label className="custom-profile-lable mb-0 text-nowrap">
                    Verification status
                  </label>
                </Col>
                <Col xs={12} sm={7}>
                  <div className="d-flex flex-wrap gap-3 align-items-center">
                    <Form.Check
                      type="radio"
                      id={`pvl-approve-${userId}`}
                      name="partner-level-verification"
                      className="custom-radio-check"
                      label={
                        <span className="custom-radio-text">Approve</span>
                      }
                      checked={partnerLevelDecision === "approve"}
                      onChange={() => setPartnerLevelDecision("approve")}
                    />
                    <Form.Check
                      type="radio"
                      id={`pvl-reject-${userId}`}
                      name="partner-level-verification"
                      className="custom-radio-check"
                      label={
                        <span className="custom-radio-text">Reject</span>
                      }
                      checked={partnerLevelDecision === "reject"}
                      onChange={() => setPartnerLevelDecision("reject")}
                    />
                  </div>
                </Col>
              </Row>
            </Col>
            {partnerLevelDecision === "reject" ? (
              <Col xs={12}>
                <Form.Group className="mb-0">
                  <Form.Label className="custom-profile-lable mb-1">
                    Rejection reason
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={4}
                    placeholder="Enter rejection reason"
                    value={partnerLevelRejectReason}
                    onChange={(e) =>
                      setPartnerLevelRejectReason(e.target.value)
                    }
                  />
                </Form.Group>
              </Col>
            ) : null}
            <Col xs={12} className="d-flex justify-content-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline-secondary"
                className="custom-btn-secondary"
                disabled={partnerLevelSubmitting}
                onClick={closePartnerLevelVerificationModal}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="custom-btn-primary"
                disabled={partnerLevelSubmitting}
                onClick={() => void submitPartnerLevelVerification()}
              >
                {partnerLevelSubmitting ? "Updating..." : "Update"}
              </Button>
            </Col>
          </Row>
        </Modal.Body>
      </Modal>
    </>
  );
}

const PartnerVerificationReviewModal = Object.assign(
  PartnerVerificationReviewModalView,
  {
    show(userId: string, onSaved: () => void) {
      const id = `partner-verification-review-${String(userId).trim()}`;
      openDialog(id, (close) => (
        <PartnerVerificationReviewModalView
          userId={userId}
          onClose={close}
          onSaved={onSaved}
        />
      ));
    },
  }
) as typeof PartnerVerificationReviewModalView & {
  show: (userId: string, onSaved: () => void) => void;
};

export default PartnerVerificationReviewModal;
