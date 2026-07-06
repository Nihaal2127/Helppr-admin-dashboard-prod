import React, { useEffect, useState } from "react";
import classNames from "classnames";
import { Form } from "react-bootstrap";
import searchIcon from "../assets/icons/search.svg";
import downloadIcon from "../assets/icons/download.svg";
import sortIcon from "../assets/icons/sort.svg";
import actionIcon from "../assets/icons/3_dots.svg";

type CustomUtilityBoxProps = {
  /** Shown when `titleSlot` is not provided. */
  title?: string;
  /** When set, replaces the title text (e.g. primary action button). */
  titleSlot?: React.ReactNode;
  searchHint?: string;
  onDownloadClick?: () => void | Promise<void>;
  onSortClick?: (sortValue: "-1" | "1") => void;
  onMoreClick?: () => void;
  onSearch?: (value: string) => void;
  /**
   * When set, the input text is replaced whenever this value changes (e.g. parent
   * cleared filters or switched tabs). Omit for purely local search state.
   */
  syncKeyword?: string;
  hideMoreIcon?: boolean;
  /** When true, download / sort / more icons are hidden (search + optional slots only). */
  hideUtilityActions?: boolean;
  controlSlot?: React.ReactNode;
  /** Rendered after search box (same row when toolsInlineRow is true). */
  afterSearchSlot?: React.ReactNode;
  /** When true, category/subcategory (controlSlot), search, download, and sort sit on one row (wraps on small screens). */
  toolsInlineRow?: boolean;
  /** Extra class on the inline tools row (e.g. wider search on Expenses). */
  toolsInlineClassName?: string;
  /** Title row only — no search, download, sort, or more. */
  hideToolbar?: boolean;
  /** Title + search only (same layout as full toolbar, no download / sort / more). */
  searchOnlyToolbar?: boolean;
};

const CustomUtilityBox: React.FC<CustomUtilityBoxProps> = ({
  title,
  titleSlot,
  searchHint = "",
  onSearch = () => {},
  syncKeyword,
  onDownloadClick,
  onSortClick,
  onMoreClick,
  hideMoreIcon = false,
  hideUtilityActions = false,
  controlSlot,
  afterSearchSlot,
  toolsInlineRow = false,
  toolsInlineClassName,
  hideToolbar = false,
  searchOnlyToolbar = false,
}) => {
  const [searchValue, setSearchValue] = useState("");
  const [sortDirection, setSortDirection] = useState<"-1" | "1">("-1");

  useEffect(() => {
    if (syncKeyword === undefined) return;
    setSearchValue(syncKeyword);
  }, [syncKeyword]);

  const showSearchClear = searchValue.trim().length > 0;
  const clearSearch = () => {
    setSearchValue("");
    onSearch("");
  };

  const handleEnterKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSearch(searchValue);
    }
  };

  const handleUtilitySortClick = () => {
    if (!onSortClick) return;
    const next = sortDirection === "-1" ? "1" : "-1";
    setSortDirection(next);
    onSortClick(next);
  };

  const showIconRow =
    !searchOnlyToolbar &&
    !hideUtilityActions &&
    (onDownloadClick != null ||
      onSortClick != null ||
      (onMoreClick != null && !hideMoreIcon));

  if (hideToolbar) {
    return (
      <div
        className={classNames(
          "custom-utilty-box",
          "custom-utilty-box--title-only"
        )}
      >
        {titleSlot != null ? (
          <div className="custom-utilty-box-title d-flex align-items-center flex-wrap">
            {titleSlot}
          </div>
        ) : (
          <span className="custom-utilty-box-title">{title}</span>
        )}
      </div>
    );
  }

  return (
    <div className="custom-utilty-box">
      {titleSlot != null ? (
        <div className="custom-utilty-box-title d-flex align-items-center flex-wrap">
          {titleSlot}
        </div>
      ) : (
        <span className="custom-utilty-box-title">{title}</span>
      )}
      <div
        className={
          toolsInlineRow
            ? classNames("custom-utilty-tools-inline", toolsInlineClassName)
            : undefined
        }
      >
        {controlSlot != null && (
          <div className="custom-utility-control-slot">{controlSlot}</div>
        )}
        <div className="d-flex flex-column">
          <label className="fw-medium">Search</label>
          <div className="custom-search-container">
            <Form.Control
              className="custom-form-input"
              type="text"
              placeholder={searchHint}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              style={{
                width: toolsInlineRow ? "100%" : "24.25rem",
                maxWidth: toolsInlineRow ? "100%" : undefined,
                fontSize: "14px",
                fontWeight: "normal",
                fontFamily: "Inter",
                paddingRight: showSearchClear ? "4.5rem" : "2.75rem",
              }}
              onKeyDown={handleEnterKey}
            />
            {showSearchClear ? (
              <button
                type="button"
                className="custom-search-clear-btn"
                aria-label="Clear search"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearSearch();
                }}
              >
                ×
              </button>
            ) : null}
            <img
              src={searchIcon}
              alt="search"
              className="custom-search-icon"
              onClick={() => {
                onSearch(searchValue);
              }}
            />
          </div>
        </div>
        {afterSearchSlot != null && (
          <div className="d-flex align-items-end">{afterSearchSlot}</div>
        )}

        {showIconRow ? (
          <div className="custom-icon-container">
            {onDownloadClick != null ? (
              <img
                src={downloadIcon}
                alt="download"
                onClick={() => void onDownloadClick()}
              />
            ) : null}
            {onSortClick != null ? (
              <img src={sortIcon} alt="sort" onClick={handleUtilitySortClick} />
            ) : null}
            {onMoreClick != null && !hideMoreIcon ? (
              <img
                src={actionIcon}
                alt="more options"
                onClick={() => onMoreClick()}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CustomUtilityBox;
