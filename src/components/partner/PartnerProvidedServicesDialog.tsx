import React, { useEffect, useRef, useState } from "react";
import { Modal, Spinner } from "react-bootstrap";
import CustomCloseButton from "../CustomCloseButton";
import { openDialog } from "../../lib/global/DialogManager";
import { fetchUserById } from "../../services/userService";
import { fetchService } from "../../services/servicesService";
import { collectPartnerProvidedServiceNames } from "../../lib/partner/partnerCategoryServiceView";

type PartnerProvidedServicesDialogProps = {
  partnerId: string;
  partnerName?: string;
  onClose: () => void;
};

const PartnerProvidedServicesDialog: React.FC<PartnerProvidedServicesDialogProps> & {
  show: (partnerId: string, partnerName?: string) => void;
} = ({ partnerId, partnerName, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<string[]>([]);
  const [loadError, setLoadError] = useState("");
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    const seq = (fetchSeqRef.current += 1);
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError("");
      const { response, user } = await fetchUserById(partnerId);
      if (cancelled || seq !== fetchSeqRef.current) return;
      if (!response || !user) {
        setLoading(false);
        setLoadError("Could not load services for this partner.");
        setNames([]);
        return;
      }

      const collected = collectPartnerProvidedServiceNames(user);
      const resolved = [...collected.names];
      const seen = new Set(resolved.map((n) => n.toLowerCase()));

      if (collected.unresolvedIds.length > 0) {
        const svcRes = await fetchService(1, 500, {});
        if (cancelled || seq !== fetchSeqRef.current) return;
        const catalog =
          svcRes?.response && Array.isArray(svcRes.services)
            ? svcRes.services
            : [];
        const byId = new Map(
          catalog.map((s) => [
            String((s as { _id?: string })._id ?? "").trim(),
            String((s as { name?: string }).name ?? "").trim(),
          ])
        );
        for (const id of collected.unresolvedIds) {
          const label = byId.get(id);
          if (!label) continue;
          const key = label.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          resolved.push(label);
        }
      }

      if (cancelled || seq !== fetchSeqRef.current) return;
      setNames(resolved);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  const titleName = String(partnerName ?? "").trim() || "Partner";

  return (
    <Modal show onHide={onClose} centered scrollable>
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          Services — {titleName}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        {loading ? (
          <div className="d-flex justify-content-center py-4">
            <Spinner animation="border" role="status" />
          </div>
        ) : loadError ? (
          <p className="text-danger mb-0">{loadError}</p>
        ) : names.length === 0 ? (
          <p className="text-muted mb-0">No services for this partner.</p>
        ) : (
          <ul className="mb-0 ps-3">
            {names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
      </Modal.Body>
    </Modal>
  );
};

PartnerProvidedServicesDialog.show = (
  partnerId: string,
  partnerName?: string
) => {
  const id = String(partnerId ?? "").trim();
  if (!id) return;
  openDialog("partner-provided-services-modal", (close) => (
    <PartnerProvidedServicesDialog
      partnerId={id}
      partnerName={partnerName}
      onClose={close}
    />
  ));
};

export default PartnerProvidedServicesDialog;
