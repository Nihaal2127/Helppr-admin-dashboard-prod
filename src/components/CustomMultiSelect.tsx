import React, { createContext, useContext, useMemo, useState } from "react";
import { Form, Col } from "react-bootstrap";
import Select, {
  components,
  MultiValue,
  ActionMeta,
  MenuListProps,
  GroupBase,
} from "react-select";
import { UseFormRegister, FieldError } from "react-hook-form";
import { FieldLabelText } from "./RequiredFieldMark";

/** Passed to custom MenuList without putting unknown props on react-select's Select (TS-safe; works with menuPortal). */
const MultiSelectMenuFooterContext = createContext<React.ReactNode | undefined>(
  undefined
);

const MENU_FOOTER_RESERVE_PX = 48;

function MenuListWithStickyFooter<
  Option,
  IsMulti extends boolean,
  Group extends GroupBase<Option>
>(props: MenuListProps<Option, IsMulti, Group>) {
  const menuFooter = useContext(MultiSelectMenuFooterContext);
  if (!menuFooter) {
    return <components.MenuList {...props} />;
  }

  const { children, innerProps, innerRef, maxHeight } = props;
  const menuCap =
    typeof maxHeight === "number" && Number.isFinite(maxHeight)
      ? maxHeight
      : 280;
  const scrollMax = Math.max(0, menuCap - MENU_FOOTER_RESERVE_PX);

  const { style: incomingStyle, ...restInnerProps } = innerProps;

  const mergedScrollStyle: React.CSSProperties = {
    ...((incomingStyle && typeof incomingStyle === "object"
      ? incomingStyle
      : {}) as React.CSSProperties),
    maxHeight: scrollMax,
    overflowY: "auto",
    overflowX: "hidden",
    WebkitOverflowScrolling: "touch",
    minHeight: 0,
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        maxHeight: menuCap,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div {...restInnerProps} ref={innerRef} style={mergedScrollStyle}>
        {children}
      </div>
      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid var(--txtfld-border, #ced4da)",
          background: "var(--bg-color)",
        }}
      >
        {menuFooter}
      </div>
    </div>
  );
}

interface CustomMultiSelectProps {
  label: string;
  controlId: string;
  options: { value: string; label: string }[];
  value: { value: string; label: string }[];
  onChange: (selectedOptions: { value: string; label: string }[]) => void;
  error?: FieldError;
  register?: UseFormRegister<any>;
  fieldName?: string;
  requiredMessage?: string;
  setValue?: (name: string, value: any) => void;
  asCol?: boolean;
  /** Render menu in document.body with high z-index — use inside Bootstrap modals (with enforceFocus={false}). */
  menuPortal?: boolean;
  /** Cap height of the selected chips area and scroll (e.g. `"180px"` ≈ five chip rows). */
  selectedChipsMaxHeight?: string;
  /** Excluded from "all options selected" / menu auto-close checks (e.g. pseudo action rows). */
  logicIgnoreOptionValues?: string[];
  /** Pinned below the scrollable option list inside the dropdown menu. */
  menuFooter?: React.ReactNode;
  /** Called when the dropdown menu opens (e.g. lazy-load options). */
  onMenuOpen?: () => void;
}

const CustomMultiSelect: React.FC<CustomMultiSelectProps> = ({
  label,
  controlId,
  options,
  value,
  onChange,
  error,
  register,
  fieldName,
  requiredMessage,
  setValue,
  asCol = true,
  menuPortal = false,
  selectedChipsMaxHeight,
  logicIgnoreOptionValues,
  menuFooter,
  onMenuOpen: onMenuOpenProp,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const customStyles = useMemo(
    () => ({
      control: (provided: any) => ({
        ...provided,
        borderColor: "var(--primary-color)",
        "&:hover": {
          borderColor: "var(--primary-color)",
        },
        boxShadow: "none",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: "normal",
        width: "100%",
        height: "auto",
        minHeight: selectedChipsMaxHeight ? "38px" : provided.minHeight,
        lineHeight: "18px",
        backgroundColor: "var(--bg-color)",
        fontFamily: "'Inter'",
        color: "var(--content-txt-color)",
        marginBottom: "10px",
        alignItems: selectedChipsMaxHeight ? "center" : provided.alignItems,
      }),
      valueContainer: (provided: any) => ({
        ...provided,
        ...(selectedChipsMaxHeight
          ? {
              maxHeight: selectedChipsMaxHeight,
              overflowY: "auto",
              overflowX: "hidden",
              flexWrap: "wrap",
              paddingTop: 4,
              paddingBottom: 4,
            }
          : {}),
      }),
      option: (provided: any, state: any) => ({
        ...provided,
        backgroundColor: state.isSelected
          ? "var(--txtfld-border)"
          : state.isFocused
          ? "var(--primary-color)"
          : "",
        color: state.isSelected
          ? "var(--bg-color)"
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
      }),
      placeholder: (provided: any) => ({
        ...provided,
        fontSize: "14px",
        color: "var(--placeholder-txt)",
        fontFamily: "Inter",
      }),
      ...(menuPortal
        ? {
            menuPortal: (provided: any) => ({ ...provided, zIndex: 9999 }),
            menu: (provided: any) => ({ ...provided, zIndex: 9999 }),
          }
        : {}),
    }),
    [menuPortal, selectedChipsMaxHeight]
  );

  const selectComponents = useMemo(
    () =>
      menuFooter
        ? { MenuList: MenuListWithStickyFooter }
        : undefined,
    [menuFooter]
  );

  const handleChange = (
    newValue: MultiValue<{ value: string; label: string }>,
    actionMeta: ActionMeta<{ value: string; label: string }>
  ) => {
    const selectedOptions = [...newValue] as { value: string; label: string }[];

    if (setValue && fieldName) {
      setValue(fieldName, selectedOptions);
    }
    onChange(selectedOptions);

    const selectedValues = new Set(selectedOptions.map((o) => String(o.value)));
    const ignoreLogic = new Set(logicIgnoreOptionValues ?? []);
    const nonSelectAllOptions = options.filter(
      (o) =>
        String(o.value) !== "select-all" && !ignoreLogic.has(String(o.value))
    );
    const hasSelectAll = selectedValues.has("select-all");
    const allConcreteSelected =
      nonSelectAllOptions.length > 0 &&
      nonSelectAllOptions.every((o) => selectedValues.has(String(o.value)));
    if (actionMeta.action === "select-option" && (hasSelectAll || allConcreteSelected)) {
      setIsMenuOpen(false);
    }
  };

  return (
    <Form.Group
      as={asCol ? Col : "div"}
      {...(asCol ? { xs: 12, md: 4 } : {})}
      controlId={controlId}
    >
      {label?.trim() && (
        <Form.Label className="fw-medium mb-1">
          <FieldLabelText label={label} required={!!requiredMessage} />
        </Form.Label>
      )}
      <MultiSelectMenuFooterContext.Provider value={menuFooter}>
        <Select
          className="react-select react-select-container"
          classNamePrefix="react-select"
          isMulti
          {...(register && fieldName
            ? register(
                fieldName,
                requiredMessage ? { required: requiredMessage } : {}
              )
            : {})}
          components={selectComponents}
          options={options}
          value={value}
          onChange={handleChange}
          styles={customStyles}
          menuPortalTarget={
            menuPortal && typeof document !== "undefined" ? document.body : null
          }
          menuPosition={menuPortal ? "fixed" : undefined}
          maxMenuHeight={280}
          menuShouldScrollIntoView={false}
          menuIsOpen={isMenuOpen}
          onMenuOpen={() => {
            setIsMenuOpen(true);
            onMenuOpenProp?.();
          }}
          onMenuClose={() => setIsMenuOpen(false)}
          closeMenuOnSelect={false}
          blurInputOnSelect={false}
          placeholder={`Select ${controlId}`}
          onBlur={() => {
            if (setValue && fieldName) {
              setValue(fieldName, value || []);
            }
          }}
        />
      </MultiSelectMenuFooterContext.Provider>
      {error && (
        <Form.Control.Feedback type="invalid" style={{ display: "block" }}>
          {error.message}
        </Form.Control.Feedback>
      )}
    </Form.Group>
  );
};

export default CustomMultiSelect;
