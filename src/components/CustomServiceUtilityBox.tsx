import React, { useEffect, useState } from "react";
import { Form } from "react-bootstrap";
import searchIcon from "../assets/icons/search.svg";

type CustomServiceUtilityBoxProps = {
  searchHint: string;
  onDownloadClick?: () => void;
  onSortClick?: (sortValue: "-1" | "1") => void;
  onMoreClick?: () => void;
  onSearch: (value: string) => void;
  /** When set, input text resets whenever this value changes (parent-applied keyword). */
  syncKeyword?: string;
  /** When false, download / sort / more icons are not shown. Default true. */
  showExtraActions?: boolean;
};

const CustomServiceUtilityBox: React.FC<CustomServiceUtilityBoxProps> = ({
  searchHint,
  onDownloadClick: _onDownloadClick,
  onSortClick: _onSortClick,
  onMoreClick: _onMoreClick,
  onSearch,
  syncKeyword,
  showExtraActions: _showExtraActions = true,
}) => {
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    if (syncKeyword === undefined) return;
    setSearchValue(syncKeyword);
  }, [syncKeyword]);

  const showSearchClear = searchValue.trim().length > 0;
  const clearSearch = () => {
    setSearchValue("");
    onSearch("");
  };

  const handleEnterKey = (e: any) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSearch(searchValue);
    }
  };

  return (
    <div className="custom-utilty-box">
      <div>
        <div className="custom-search-container">
          <Form.Control
            className="custom-form-input"
            type="text"
            placeholder={searchHint}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            style={{
              width: "24.25rem",
              fontSize: "14px",
              fontWeight: "normal",
              fontFamily: "Inter",
              paddingRight: showSearchClear ? "4.5rem" : "2.75rem",
            }}
            onKeyDown={(e) => {
              handleEnterKey(e);
            }}
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
      {/* {showExtraActions ? (
                <div className="custom-icon-container">
                    <img src={downloadIcon} alt="download" onClick={() => onDownloadClick?.()} />
                    <img src={sortIcon} alt="sort" onClick={handleSortClick} />
                    <img src={actionIcon} alt="more options" onClick={() => onMoreClick?.()} />
                </div>
            ) : null} */}
    </div>
  );
};

export default CustomServiceUtilityBox;
