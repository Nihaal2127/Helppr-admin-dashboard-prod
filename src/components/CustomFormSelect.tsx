import React, { useEffect, useMemo, useRef, useState } from "react";
import { Form, Col } from "react-bootstrap";
import Select from "react-select";
import { UseFormRegister, FieldError } from "react-hook-form";
import { FieldLabelText } from "./RequiredFieldMark";

interface CustomFormSelectProps {
  label: string;
  controlId: string;
  register: UseFormRegister<any>;
  options: { value: string; label: string }[];
  fieldName: string;
  error?: FieldError;
  requiredMessage?: string;
  defaultValue?: string;
  isValue?: boolean;
  setValue?: (
    name: string,
    value: any,
    options?: { shouldValidate?: boolean }
  ) => void;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  /** Disables the select (read-only). */
  isDisabled?: boolean;
  asCol?: boolean;
  noBottomMargin?: boolean;
  /** Fixed width (e.g. `"220px"`). Constrains the control and stops the inner search input from stretching with flex. */
  selectWidth?: string;
  /** Render menu in document.body — use inside Bootstrap modals (with enforceFocus={false}). */
  menuPortal?: boolean;
  /** Custom placeholder text for the select input. */
  placeholder?: string;
  /** When true (default), shows a clear (×) control to reset the selection. Pass `false` to hide it.
   * The × is automatically hidden when the current selection is an "All" sentinel
   * (value `""` or `"all"`) since there is nothing meaningful to clear back to. */
  isClearable?: boolean;
  /** When true, prepends `{ value: "" }` as the first option (usually unnecessary if `isClearable` is on). */
  includeEmptyOption?: boolean;
  /** Label for the empty-value row when `includeEmptyOption` is true (default: `Select`). */
  emptyOptionLabel?: string;
  /**
   * When the user clears the react-select (×), set this value instead of `""`.
   * Use `"all"` for the global franchise header so “clear” means all franchises.
   */
  clearResetsTo?: string;
  /** Show required asterisk without react-hook-form `requiredMessage`. */
  showRequiredMark?: boolean;
}

const DEFAULT_SELECT_LABEL = "Select";

const CustomFormSelect: React.FC<CustomFormSelectProps> = ({
  label,
  controlId,
  options,
  register,
  fieldName,
  error,
  requiredMessage,
  defaultValue = "",
  setValue,
  onChange,
  isValue = false,
  isDisabled = false,
  asCol = true,
  noBottomMargin = false,
  selectWidth,
  menuPortal = false,
  placeholder,
  isClearable = true,
  includeEmptyOption = false,
  emptyOptionLabel,
  clearResetsTo,
  showRequiredMark: showRequiredMarkProp,
}) => {
  const [selectedOption, setSelectedOption] = useState<{
    value: string;
    label: string;
  } | null>(null);

  // Parents often pass inline `setValue` / `options` — new references each render would re-run the
  // sync effect and reset the controlled value (e.g. clear selection when defaultValue is "").
  const setValueRef = useRef(setValue);
  setValueRef.current = setValue;

  const normalizedOptions = useMemo(() => {
    const list = Array.isArray(options) ? options : [];
    if (!includeEmptyOption) return list;
    if (list.some((o) => String(o?.value ?? "") === "")) return list;
    const emptyLabel =
      (emptyOptionLabel && emptyOptionLabel.trim()) || DEFAULT_SELECT_LABEL;
    return [{ value: "", label: emptyLabel }, ...list];
  }, [options, includeEmptyOption, emptyOptionLabel]);

  const optionsSyncKey = useMemo(
    () =>
      JSON.stringify(
        [...normalizedOptions]
          .sort((a, b) => String(a.value).localeCompare(String(b.value)))
          .map((o) => [o.value, o.label])
      ),
    [normalizedOptions]
  );

  useEffect(() => {
    const resolvedDefault =
      defaultValue === undefined || defaultValue === null
        ? ""
        : isValue
        ? String(defaultValue)
        : String(defaultValue);

    const defaultOption =
      normalizedOptions.find((option) =>
        isValue
          ? option.label === resolvedDefault
          : String(option.value) === resolvedDefault
      ) || null;
    setSelectedOption(defaultOption);
    const sync = setValueRef.current;
    if (sync && defaultOption) {
      if (isValue) {
        sync(`${fieldName}_label`, defaultOption.label, {
          shouldValidate: false,
        });
        sync(fieldName, defaultOption.label, { shouldValidate: false });
      } else {
        sync(fieldName, defaultOption.value, { shouldValidate: false });
      }
    }
    // Intentionally omit `options` / `setValue` — keyed by content and ref above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue, optionsSyncKey, fieldName, isValue]);

  const handleChange = (option: { value: string; label: string } | null) => {
    let next = option;
    if (!option && clearResetsTo !== undefined) {
      const v = String(clearResetsTo);
      next =
        normalizedOptions.find((o) => String(o.value) === v) ?? {
          value: v,
          label: v,
        };
    }
    setSelectedOption(next);
    const value = next?.value ?? "";
    const label = next?.label ?? "";
    if (setValue) {
      if (isValue) {
        setValue(`${fieldName}_label`, label);
        setValue(fieldName, label);
      } else {
        setValue(fieldName, value);
      }
    }

    const fakeEvent = { target: { value } };
    onChange?.(fakeEvent as React.ChangeEvent<HTMLSelectElement>);
  };

  const customStyles = useMemo(
    () => ({
      container: (provided: any) => ({
        ...provided,
        ...(selectWidth ? { width: "100%", maxWidth: "100%" } : {}),
      }),
      control: (provided: any) => ({
        ...provided,
        borderColor: isDisabled ? "var(--txtfld-border)" : "var(--primary-color)",
        "&:hover": { borderColor: isDisabled ? "var(--txtfld-border)" : "var(--primary-color)" },
        boxShadow: "none",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: "normal",
        cursor: 'pointer',
        width: "100%",
        ...(selectWidth ? { minWidth: 0 } : {}),
        height: "35px",
        lineHeight: "18px",
        backgroundColor: "var(--bg-color)",
        fontFamily: "'Inter'",
        color: "var(--content-txt-color)",
        marginBottom: noBottomMargin ? 0 : "10px",
      }),
      valueContainer: (provided: any, state: any) => {
        const filterText = String(state?.selectProps?.inputValue ?? "");
        const typing = Boolean(selectWidth) && filterText.length > 0;
        return {
          ...provided,
          ...(selectWidth
            ? {
                minWidth: 0,
                flexWrap: "nowrap" as const,
                ...(typing
                  ? {
                      display: "flex",
                      alignItems: "center",
                    }
                  : {}),
              }
            : {}),
        };
      },
      input: (provided: any, state: any) => {
        const filterText = String(
          state?.value ?? state?.selectProps?.inputValue ?? ""
        );
        const typing = Boolean(selectWidth) && filterText.length > 0;
        return {
          ...provided,
          ...(selectWidth
            ? typing
              ? {
                  flex: "1 1 auto",
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                }
              : {
                  flex: "0 0 auto",
                  width: "auto",
                  maxWidth: "40px",
                  minWidth: "2px",
                }
            : {}),
        };
      },
      option: (provided: any, state: any) => ({
        ...provided,
        cursor: "pointer",
        backgroundColor: state.isSelected
          ? "var(--txtfld-border)"
          : state.isFocused
          ? "var(--primary-color)"
          : "",
        // Dropdown menu item text color
        color: state.isSelected
          ? "var(--primary-color)"
          : state.isFocused
          ? "var(--bg-color)"
          : "var(--primary-color)",
        "&:hover": {
          backgroundColor: "var(--primary-color)",
          color: "var(--bg-color)",
        },
      }),
      singleValue: (provided: any) => ({
        ...provided,
        color: "var(--content-txt-color)",
        ...(selectWidth
          ? {
              maxWidth: "calc(100% - 8px)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap" as const,
            }
          : {}),
      }),
      placeholder: (provided: any) => ({
        ...provided,
        fontSize: "14px",
        color: "var(--placeholder-txt)",
        fontFamily: "Inter",
        ...(selectWidth
          ? {
              maxWidth: "calc(100% - 8px)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap" as const,
            }
          : {}),
      }),
      ...(menuPortal
        ? {
            menuPortal: (provided: any) => ({ ...provided, zIndex: 9999 }),
          }
        : {}),
    }),
    [selectWidth, noBottomMargin, menuPortal, isDisabled]
  );

  const formGroupStyle = selectWidth
    ? {
        width: selectWidth,
        maxWidth: "100%",
        flex: "0 0 auto" as const,
        minWidth: 0,
      }
    : undefined;

  /** Avoid `Form.Group` `controlId` + explicit `id` on the control (RHF / react-select) — RB warns and ignores `controlId`. */
  const selectInputId = String(controlId ?? "").trim() || fieldName;
  const rawRegister = register(
    fieldName,
    requiredMessage ? { required: requiredMessage } : {}
  ) as Record<string, unknown>;
  const { id: _registerIdOmit, ...selectRegisterProps } = rawRegister;

  return (
    <Form.Group
      as={asCol ? Col : "div"}
      {...(asCol ? { xs: 12, md: 4 } : {})}
      style={formGroupStyle}
    >
      {label?.trim() && (
        <Form.Label htmlFor={selectInputId} className="fw-medium mb-1">
          <FieldLabelText
            label={label}
            required={Boolean(showRequiredMarkProp) || !!requiredMessage}
          />
        </Form.Label>
      )}
      <Select
        className="react-select react-select-container"
        classNamePrefix="react-select"
        {...selectRegisterProps}
        inputId={selectInputId}
        options={normalizedOptions}
        value={selectedOption}
        onChange={handleChange}
        isDisabled={isDisabled}
        isClearable={
          isClearable &&
          !(
            selectedOption &&
            ["", "all"].includes(String(selectedOption.value).toLowerCase())
          )
        }
        placeholder={placeholder ?? DEFAULT_SELECT_LABEL}
        onBlur={() => {
          if (!selectedOption && setValue) {
            const fallback =
              clearResetsTo !== undefined ? String(clearResetsTo) : "";
            setValue(fieldName, fallback, { shouldValidate: false });
          }
        }}
        styles={customStyles}
        menuPortalTarget={menuPortal ? document.body : undefined}
        menuPosition={menuPortal ? "fixed" : undefined}
      />
      {error && (
        <Form.Control.Feedback type="invalid" style={{ display: "block" }}>
          {error.message}
        </Form.Control.Feedback>
      )}
    </Form.Group>
  );
};

export default CustomFormSelect;
