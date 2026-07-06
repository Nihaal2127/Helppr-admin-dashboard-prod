import React from "react";
import { Row, Col } from "react-bootstrap";
import type { UserModel } from "../../lib/models/UserModel";
import editIcon from "../../assets/icons/edit_red.svg";
import deleteIcon from "../../assets/icons/delete_red.svg";

const savedCardShell: React.CSSProperties = {
  borderRadius: "8px",
  padding: "8px 10px",
  backgroundColor: "var(--bg-color)",
  border: "1px dashed var(--primary-color)",
  boxShadow: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--content-txt-color, #6c757d)",
  marginBottom: "2px",
  letterSpacing: "0.02em",
};

const valueStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  fontFamily: "Inter, sans-serif",
  color: "var(--txt-color)",
  wordBreak: "break-word",
};

type RowProps = { label: string; value: string };
const DetailStack: React.FC<RowProps> = ({ label, value }) => (
  <div className="mb-1">
    <div style={labelStyle}>{label}</div>
    <div style={valueStyle}>{value}</div>
  </div>
);

export type UserAddressReadOnlyCardsProps = {
  user: UserModel;
  stateOptions?: { value: string; label: string }[];
  cityOptions?: { value: string; label: string }[];
  areaOptions?: { value: string; label: string }[];
  onEdit: (index: number) => void;
  onDelete?: (index: number) => void;
};

const UserAddressReadOnlyCards: React.FC<UserAddressReadOnlyCardsProps> = ({
  user,
  stateOptions = [],
  cityOptions = [],
  areaOptions = [],
  onEdit,
  onDelete,
}) => {
  const toText = (value: unknown) => String(value ?? "").trim();
  const normalizeAddressStatus = (value: unknown): "true" | "false" =>
    value === true || String(value ?? "").toLowerCase() === "true"
      ? "true"
      : "false";

  const findLabel = (
    options: { value: string; label: string }[],
    idLike: unknown,
    nameLike?: unknown
  ) => {
    const nameText = toText(nameLike);
    if (nameText) return nameText;
    const idText = toText(idLike);
    if (!idText) return "—";
    return options.find((x) => x.value === idText)?.label ?? idText;
  };

  const rawAddress = (user as unknown as { address?: unknown }).address;
  const addressArray = Array.isArray(rawAddress) ? rawAddress : [];
  const baseRows = addressArray.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      state: findLabel(stateOptions, row?.state_id, row?.state_name),
      city: findLabel(cityOptions, row?.city_id, row?.city_name),
      area: findLabel(areaOptions, row?.area_id, row?.area_name),
      postal: toText(row?.pincode) || "—",
      line: toText(row?.address) || "—",
      status: normalizeAddressStatus(row?.address_status),
    };
  }) as {
    state: string;
    city: string;
    area: string;
    postal: string;
    line: string;
    status: "true" | "false";
  }[];

  const fallbackRows =
    baseRows.length > 0
      ? baseRows
      : [
          {
            state: findLabel(stateOptions, user.state_id, user.state_name),
            city: findLabel(cityOptions, user.city_id, user.city_name),
            area: findLabel(
              areaOptions,
              (user as { area_id?: unknown }).area_id,
              (user as { area_name?: unknown }).area_name
            ),
            postal: toText(user.pincode) || "—",
            line: toText(user.address) || "—",
            status: "true" as const,
          },
          ...((user.extra_addresses ?? []).map((row) => ({
            state: findLabel(stateOptions, row?.state_id, row?.state_name),
            city: findLabel(cityOptions, row?.city_id, row?.city_name),
            area: findLabel(
              areaOptions,
              (row as { area_id?: unknown })?.area_id,
              row?.area_name
            ),
            postal: toText(row?.pincode) || "—",
            line: toText(row?.address) || "—",
            status: normalizeAddressStatus(
              (row as { address_status?: unknown })?.address_status
            ),
          })) as {
            state: string;
            city: string;
            area: string;
            postal: string;
            line: string;
            status: "true" | "false";
          }[]),
        ].filter(
          (row) =>
            row.state !== "—" ||
            row.city !== "—" ||
            row.area !== "—" ||
            row.postal !== "—" ||
            row.line !== "—"
        );

  const rows = fallbackRows;

  return (
    <Row className="g-2 user-address-readonly-cards-row">
      {rows.map((row, index) => (
        <Col
          key={`addr-${index}`}
          xs={12}
          sm={6}
          lg={4}
          className="user-address-readonly-card-col"
        >
          <div
            className="user-address-readonly-card"
            style={savedCardShell}
          >
            <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span
                  className="fw-semibold"
                  style={{
                    color: "var(--primary-color)",
                    fontSize: "14px",
                  }}
                >
                  {`Address ${index + 1}`}
                </span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <span
                  className="p-0 border-0 bg-transparent"
                  style={{ cursor: "pointer" }}
                  onClick={() => onEdit(index)}
                  title="Edit address"
                  aria-label="Edit address"
                >
                  <img src={editIcon} alt="" width={18} height={18} />
                </span>
                {/* {onDelete ? (
                  <span
                    className="p-0 border-0 bg-transparent"
                    style={{ cursor: "pointer" }}
                    onClick={() => onDelete(index)}
                    title="Delete address"
                    aria-label="Delete address"
                  >
                    <img src={deleteIcon} alt="" width={18} height={18} />
                  </span>
                ) : null} */}
              </div>
            </div>
            <Row className="g-1 gx-2">
              <Col xs={6}>
                <DetailStack label="State" value={row.state} />
              </Col>
              <Col xs={6}>
                <DetailStack label="City" value={row.city} />
              </Col>
              <Col xs={6}>
                <DetailStack label="Area" value={row.area} />
              </Col>
              <Col xs={6}>
                <DetailStack label="Postal Code" value={row.postal} />
              </Col>
              <Col xs={12}>
                <DetailStack label="Address" value={row.line} />
              </Col>
            </Row>
          </div>
        </Col>
      ))}
    </Row>
  );
};

export default UserAddressReadOnlyCards;
