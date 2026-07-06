import React from "react";
import CustomCloseButton from "../CustomCloseButton";
import editIconRed from "../../assets/icons/edit_red.svg";

type OrderInfoDialogHeaderActionsProps = {
  canEditOrderAll: boolean;
  onEditAll: () => void;
  onClose: () => void;
};

/** Header edit + close controls for order view modal. */
export function OrderInfoDialogHeaderActions({
  canEditOrderAll,
  onEditAll,
  onClose,
}: OrderInfoDialogHeaderActionsProps) {
  return (
    <div className="d-flex align-items-center gap-3 ms-3">
      {canEditOrderAll ? (
        <img
          src={editIconRed}
          alt="Edit order"
          width={22}
          height={22}
          style={{ cursor: "pointer" }}
          role="button"
          onClick={onEditAll}
        />
      ) : null}
      <CustomCloseButton onClose={onClose} inline size={22} />
    </div>
  );
}
