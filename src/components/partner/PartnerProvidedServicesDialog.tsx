import React, { useEffect, useRef, useState } from "react";
import { Modal, Spinner } from "react-bootstrap";
import CustomCloseButton from "../CustomCloseButton";
import { openDialog } from "../../lib/global/DialogManager";
import { fetchUserById } from "../../services/userService";
import { fetchService } from "../../services/servicesService";
import {
  collectPartnerProvidedServiceNames,
} from "../../lib/partner/partnerCategoryServiceView";
import type { PartnerProvidedServiceNameItem } from "../../lib/partner/partnerCategoryServiceView";

type PartnerProvidedServicesDialogProps = {
  partnerId: string;
  partnerName?: string;
  onClose: () => void;
};

const PartnerProvidedServicesDialog: React.FC<PartnerProvidedServicesDialogProps> & {
  show: (partnerId: string, partnerName?: string) => void;
} = ({ partnerId, partnerName, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PartnerProvidedServiceNameItem[]>([]);
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
        setItems([]);
        return;
      }

      const collected = collectPartnerProvidedServiceNames(user);
      const resolved: PartnerProvidedServiceNameItem[] = [...collected.items];
      const seen = new Set(resolved.map((n) => n.name.toLowerCase()));

      if (collected.unresolvedIds.length > 0) {
        const svcRes = await fetchService(1, 500, {});
        if (cancelled || seq !== fetchSeqRef.current) return;
        const catalog =
          svcRes?.response && Array.isArray(svcRes.services)
            ? svcRes.services
            : [];
        const byId = new Map(
          catalog.map((s) => {
            const id = String((s as { _id?: string })._id ?? "").trim();
            const name = String((s as { name?: string }).name ?? "").trim();
            const active =
              (s as { is_active?: unknown }).is_active !== false &&
              (s as { is_active?: unknown }).is_active !== 0 &&
              String((s as { is_active?: unknown }).is_active ?? "true").toLowerCase() !==
                "false";
            return [id, { name, isActive: active }] as const;
          })
        );
        for (const id of collected.unresolvedIds) {
          const catalogHit = byId.get(id);
          if (!catalogHit?.name) continue;
          const key = catalogHit.name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const partnerActive = collected.unresolvedActiveById[id] !== false;
          resolved.push({
            name: catalogHit.name,
            isActive: partnerActive && catalogHit.isActive,
          });
        }
      }

      if (cancelled || seq !== fetchSeqRef.current) return;
      setItems(resolved);
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
        ) : items.length === 0 ? (
          <p className="text-muted mb-0">No services for this partner.</p>
        ) : (
          <ul className="mb-0 ps-3">
            {items.map((item) => (
              <li key={item.name}>
                {item.isActive ? item.name : `${item.name} (inactive)`}
              </li>
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
