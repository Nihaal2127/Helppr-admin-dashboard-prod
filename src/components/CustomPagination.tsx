import React from "react";
import classNames from "classnames";
import firstIcon from "../assets/icons/left_arrow_first.svg";
import previousIcon from "../assets/icons/left_arrow.svg";
import nextIcon from "../assets/icons/right_arrow.svg";
import lastIcon from "../assets/icons/right_arrow_last.svg";

interface CustomPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}

const CustomPagination = ({
  currentPage,
  totalPages,
  onPageChange,
}: CustomPaginationProps) => {
  const maxPages = 5;
  const startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
  const endPage = Math.min(totalPages, currentPage + Math.floor(maxPages / 2));

  const renderPageNumbers = () => {
    const pages = [];
    if (startPage > 1) {
      pages.push(
        <li key={1}>
          <a
            href="#page-1"
            onClick={(e) => {
              e.preventDefault();
              onPageChange(1);
            }}
          >
            1
          </a>
        </li>
      );
      if (startPage > 2)
        pages.push(
          <li key="startEllipsis" className="disabled">
            <span>...</span>
          </li>
        );
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <li key={i} className={classNames({ active: i === currentPage })}>
          <a
            href={`#page-${i}`}
            onClick={(e) => {
              e.preventDefault();
              onPageChange(i);
            }}
          >
            {i}
          </a>
        </li>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1)
        pages.push(
          <li key="endEllipsis" className="disabled">
            <span>...</span>
          </li>
        );
      pages.push(
        <li key={totalPages}>
          <a
            href={`#page-${totalPages}`}
            onClick={(e) => {
              e.preventDefault();
              onPageChange(totalPages);
            }}
          >
            {totalPages}
          </a>
        </li>
      );
    }

    return pages;
  };

  return (
    <ul className="custom-pagination">
      <li
        className={classNames({ disabled: currentPage === 1 })}
        onClick={() => currentPage > 1 && onPageChange(1)}
      >
        <img src={firstIcon} alt="First" />
      </li>
      <li
        className={classNames({ disabled: currentPage === 1 })}
        onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
      >
        <img src={previousIcon} alt="Previous" />
      </li>

      {renderPageNumbers()}

      <li
        className={classNames({ disabled: currentPage === totalPages })}
        onClick={() =>
          currentPage < totalPages && onPageChange(currentPage + 1)
        }
      >
        <img src={nextIcon} alt="Next" />
      </li>
      <li
        className={classNames({ disabled: currentPage === totalPages })}
        onClick={() => currentPage < totalPages && onPageChange(totalPages)}
      >
        <img src={lastIcon} alt="Last" />
      </li>
    </ul>
  );
};

export default CustomPagination;
