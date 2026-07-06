import React, { useMemo } from "react";
import { Form } from "react-bootstrap";
import type { ScreenPermissionMenuItem } from "../lib/layout/screenPermissionSelection";
import {
  applyScreenPermissionSelectAll,
  isAllScreenPermissionsSelected,
  screenPermissionKeysFromItems,
  toggleScreenPermissionKey,
} from "../lib/layout/screenPermissionSelection";

type ScreenPermissionChecklistProps = {
  items: ScreenPermissionMenuItem[];
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
  idPrefix: string;
  title?: string;
  headClassName?: string;
};

export default function ScreenPermissionChecklist({
  items,
  selectedKeys,
  onChange,
  idPrefix,
  title = "Screen Permissions",
  headClassName = "fw-medium mb-1",
}: ScreenPermissionChecklistProps) {
  const allKeys = useMemo(() => screenPermissionKeysFromItems(items), [items]);
  const allSelected = isAllScreenPermissionsSelected(selectedKeys, allKeys);

  return (
    <div className="staff-permission-section">
      <div className={`staff-permission-section__head ${headClassName}`}>
        {title}
      </div>
      <div className="staff-permission-section__body">
        <Form.Check
          type="checkbox"
          id={`${idPrefix}_select_all`}
          className="custom-checkbox-check mb-2"
          label={<span className="custom-radio-text">Select All</span>}
          checked={allSelected}
          onChange={(e) => {
            onChange(applyScreenPermissionSelectAll(allKeys, e.target.checked));
          }}
        />
        <div
          className="d-grid"
          style={{
            gap: "10px 20px",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          }}
        >
          {items.map(({ key, label }) => (
            <Form.Check
              key={key}
              type="checkbox"
              id={`${idPrefix}_${key}`}
              className="custom-checkbox-check"
              label={<span className="custom-radio-text">{label}</span>}
              checked={selectedKeys.includes(key)}
              onChange={() => {
                onChange(toggleScreenPermissionKey(selectedKeys, key));
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
