import React, { useMemo } from "react";
import {
  useTable,
  usePagination,
  useSortBy,
  TableState,
  UsePaginationOptions,
  UsePaginationState,
  UseSortByOptions,
  UseTableOptions,
} from "react-table";

import classNames from "classnames";
import CustomPagination from "./CustomPagination";
import {
  nextServerSortState,
  ServerTableSortBy,
} from "../lib/global/serverTableSort";

export type { ServerTableSortBy };

const EMPTY_SERVER_SORT: ServerTableSortBy = [];

/** Narrow column for serial / index columns used across tables. */
const isSrNoColumn = (column: { id?: string; Header?: unknown }) => {
  if (column.id === "serial_no") return true;
  const h = column.Header;
  if (typeof h !== "string") return false;
  const t = h.trim();
  return t === "SR No" || t === "S.No";
};

const isCompactColumn = (column: { compact?: boolean }) =>
  column.compact === true;

function columnExplicitWidth(column: {
  width?: string | number;
}): string | undefined {
  const w = column.width;
  if (w == null) return undefined;
  if (typeof w === "number" && Number.isFinite(w)) return `${w}px`;
  const s = String(w).trim();
  return s.length > 0 ? s : undefined;
}

/** Core + usePagination + useSortBy — @types/react-table expects merging on `TableOptions` for full plugin props. */
type CustomTableOptions = UseTableOptions<object> &
  UsePaginationOptions<object> &
  UseSortByOptions<object>;

/** react-table column: use `accessor` for data fields, or `id` + `Cell` for computed columns. */
export type CustomTableColumn = {
  Header: any;
  accessor?: string;
  id?: string;
  sort?: boolean;
  Cell?: any;
  className?: string;
  /** Narrower min/max width for tag/list cells to limit horizontal overflow */
  compact?: boolean;
  /** When `layoutFixed` is true, sets column width (e.g. `"12%"`, `"140px"`). */
  width?: string | number;
};

interface CustomTableProps {
  columns: CustomTableColumn[];
  data: any[];
  pageSize?: number;
  currentPage?: number;
  totalPages?: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  tableClass?: string;
  theadClass?: string;
  isPagination?: boolean;
  /** When false, alternating row background is not applied (use row-level CSS e.g. credit/debit). Default true. */
  dynamicRowBackground?: boolean;
  /** Adds classes to each `<tr>` (e.g. wallet credit/debit styling). */
  getRowClassName?: (row: any) => string | undefined;
  /**
   * When true, wrapper scrolls horizontally and table gets a sensible min-width.
   * When omitted, horizontal scroll activates automatically for many columns (>= 8).
   */
  horizontalScroll?: boolean;
  /**
   * When true, table uses `table-layout: fixed` and `width: 100%` (no min-width unless horizontal scroll).
   * Use with per-column `width` for stable columns. Other tables keep default (false).
   */
  layoutFixed?: boolean;
  /** Optional min-width (px) when horizontal scroll is on; defaults to column-based estimate. */
  tableMinWidthPx?: number;
  /**
   * Server-side sorting: parent owns `sortBy`, refetches data, passes new rows.
   * Requires `onSortChange`. Column `accessor` string becomes the sort field id sent to the API.
   */
  manualSortBy?: boolean;
  sortBy?: ServerTableSortBy;
  onSortChange?: (next: { id: string; desc: boolean }[]) => void;
  isLoading?: boolean;
  loadingText?: string;
}

const CustomTable = (props: CustomTableProps) => {
  const currentPage = props["currentPage"] || 0;
  const totalPages = props["totalPages"] || 0;
  const onPageChange = props["onPageChange"];
  const isPagination = props.isPagination ?? true;
  const dynamicRowBackground = props.dynamicRowBackground !== false;
  const manualSortBy = props.manualSortBy === true;
  const serverSortBy = props.sortBy ?? EMPTY_SERVER_SORT;
  const onSortChange = props.onSortChange;

  const tableOptions = useMemo((): CustomTableOptions => {
    const canonicalSortBy =
      serverSortBy.length > 0 ? serverSortBy : EMPTY_SERVER_SORT;

    const base: CustomTableOptions = {
      columns: props.columns,
      data: props.data,
      initialState: {
        pageSize: props.pageSize || 10,
        pageIndex: (props.currentPage || 1) - 1,
      } as Partial<TableState<object>> & Partial<UsePaginationState<object>>,
      manualPagination: true,
      /** Parent owns page; avoids usePagination resetting page when sort/filter deps change. */
      autoResetPage: false,
      pageCount:
        props.totalPages ||
        Math.ceil(props.data.length / (props.pageSize || 10)),
    };

    if (manualSortBy && onSortChange) {
      return {
        ...base,
        manualSortBy: true,
        /**
         * Must reuse the same `sortBy` reference when props are unchanged. Copying with
         * `[...serverSortBy]` every render gives a new array, so usePagination’s
         * useMountedLayoutEffect([..., sortBy]) runs every time → resetPage dispatch → infinite updates.
         */
        useControlledState: (state: TableState<object>) => {
          const s = state as TableState<object> & {
            sortBy?: { id: string; desc: boolean }[];
          };
          if (s.sortBy === canonicalSortBy) return state;
          return { ...state, sortBy: canonicalSortBy };
        },
      };
    }

    return base;
  }, [
    manualSortBy,
    onSortChange,
    props.columns,
    props.data,
    props.pageSize,
    props.currentPage,
    props.totalPages,
    serverSortBy,
  ]);

  const dataTable = useTable(tableOptions, useSortBy, usePagination);

  let rows = (dataTable as unknown as { page: any[] }).page;

  const needsHorizontalScroll =
    props.horizontalScroll !== undefined
      ? props.horizontalScroll
      : props.columns.length >= 8;
  const layoutFixed = props.layoutFixed === true;
  const useTableLayoutFixed = layoutFixed || needsHorizontalScroll;
  const tableMinWidthPx =
    typeof props.tableMinWidthPx === "number" &&
    Number.isFinite(props.tableMinWidthPx)
      ? props.tableMinWidthPx
      : Math.max(720, props.columns.length * 104);
  const serverSortEnabled = manualSortBy && typeof onSortChange === "function";
  const isLoading = props.isLoading === true;
  const loadingText = props.loadingText ?? "Loading...";

  return (
    <>
      <div
        className={classNames(
          "custom-table-wrapper",
          needsHorizontalScroll && "custom-table-wrapper--scroll"
        )}
      >
        <table
          {...dataTable.getTableProps()}
          className={classNames(
            "table table-centered react-table table-hover table-bordered mb-0",
            props["tableClass"]
          )}
          style={{
            borderCollapse: "collapse",
            width: "100%",
            ...(useTableLayoutFixed
              ? { tableLayout: "fixed" as const }
              : { tableLayout: "auto" as const }),
            ...(needsHorizontalScroll
              ? { minWidth: `${tableMinWidthPx}px` }
              : {}),
          }}
        >
          <thead className={props.theadClass}>
            {(dataTable.headerGroups || []).map((headerGroup: any) => {
              const { key: groupKey, ...groupProps } =
                headerGroup.getHeaderGroupProps();
              return (
                <tr key={groupKey} {...groupProps}>
                  {(headerGroup.headers || []).map((column: any) => {
                    const srNo = isSrNoColumn(column);
                    const compactCol = isCompactColumn(column);
                    const explicitW = columnExplicitWidth(column);
                    const sortToggleProps =
                      column.sort &&
                      (serverSortEnabled
                        ? {
                            onClick: (e: React.MouseEvent) => {
                              if (
                                (e.target as HTMLElement).closest(
                                  ".bi-caret-up-fill, .bi-caret-down-fill"
                                )
                              ) {
                                return;
                              }
                              e.preventDefault();
                              onSortChange!(
                                nextServerSortState(
                                  serverSortBy,
                                  column.id,
                                  column.sortDescFirst ?? false
                                )
                              );
                            },
                            style: { cursor: "pointer" as const },
                            title: "Toggle SortBy",
                          }
                        : column.getSortByToggleProps());
                    const headerProps = column.getHeaderProps([
                      sortToggleProps || {},
                      { className: column.className },
                    ]);
                    const {
                      key: thKey,
                      className: thClassName,
                      ...thRest
                    } = headerProps;

                    return (
                      <th
                        key={thKey}
                        {...thRest}
                        className={classNames(thClassName, {
                          sorting_desc: column.isSortedDesc === true,
                          sorting_asc: column.isSortedDesc === false,
                          sortable: column.sort === true,
                        })}
                        style={{
                          backgroundColor: "var(--th-color)",
                          color: "var(--th-txt-color)",
                          fontFamily: "Inter",
                          fontSize: "12px",
                          fontWeight: 600,
                          textAlign: "center",
                          verticalAlign: "top",
                          whiteSpace: layoutFixed || srNo ? "nowrap" : "normal",
                          wordBreak:
                            layoutFixed || srNo ? "normal" : "break-word",
                          lineHeight: "1.4",
                          padding: srNo ? "12px 6px" : "12px 10px",
                          position: "sticky",
                          top: 0,
                          zIndex: 2,
                          ...(srNo
                            ? {
                                width: "64px",
                                minWidth: "56px",
                                maxWidth: "80px",
                              }
                            : explicitW
                            ? { width: explicitW }
                            : { width: undefined }),
                          ...(!srNo && explicitW
                            ? {}
                            : !srNo
                            ? {
                                minWidth: compactCol ? "88px" : "120px",
                                maxWidth: compactCol ? "168px" : undefined,
                              }
                            : {}),
                          cursor: column.sort ? "pointer" : "default",
                          ...(layoutFixed
                            ? { overflow: "hidden" as const }
                            : {}),
                        }}
                      >
                        <span
                          className={classNames(
                            "d-flex flex-row align-items-center min-w-0",
                            {
                              "justify-content-center": srNo,
                              "justify-content-between": !srNo,
                            }
                          )}
                        >
                          <span
                            className={classNames({
                              "text-truncate": layoutFixed,
                              "flex-grow-1": layoutFixed && column.sort,
                              "w-100": layoutFixed && !column.sort,
                            })}
                            style={layoutFixed ? { minWidth: 0 } : undefined}
                          >
                            {column.render("Header")}
                          </span>

                          {column.sort && (
                            <span className="d-flex flex-column">
                              <i
                                className="bi bi-caret-up-fill"
                                style={{
                                  cursor: "pointer",
                                  color:
                                    column.isSorted && !column.isSortedDesc
                                      ? "white"
                                      : "#aaa",
                                  height: "11px",
                                  fontSize: "11px",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (serverSortEnabled) {
                                    onSortChange!([
                                      { id: column.id, desc: false },
                                    ]);
                                  } else {
                                    column.toggleSortBy(false);
                                  }
                                }}
                              />

                              <i
                                className="bi bi-caret-down-fill"
                                style={{
                                  cursor: "pointer",
                                  color:
                                    column.isSorted && column.isSortedDesc
                                      ? "white"
                                      : "#aaa",
                                  height: "11px",
                                  fontSize: "11px",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (serverSortEnabled) {
                                    onSortChange!([
                                      { id: column.id, desc: true },
                                    ]);
                                  } else {
                                    column.toggleSortBy(true);
                                  }
                                }}
                              />
                            </span>
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              );
            })}
          </thead>

          <tbody
            {...dataTable.getTableBodyProps()}
            style={{ textAlign: "center" }}
          >
            {isLoading ? (
              <tr>
                <td colSpan={props.columns.length} className="text-center">
                  {loadingText}
                </td>
              </tr>
            ) : rows && rows.length > 0 ? (
              rows.map((row: any, i: number) => {
                dataTable.prepareRow(row);
                const { key, ...rowProps } = row.getRowProps();
                const rowExtraClass = props.getRowClassName?.(row);
                const { className: trClass, ...trRest } = rowProps as {
                  className?: string;
                  [k: string]: unknown;
                };

                return (
                  <tr
                    key={key}
                    {...trRest}
                    className={classNames(trClass, rowExtraClass)}
                  >
                    {row.cells.map((cell: any) => {
                      const { key: cellKey, ...cellProps } = cell.getCellProps([
                        { className: cell.column.className },
                      ]);
                      const srNoCell = isSrNoColumn(cell.column);
                      const compactCell = isCompactColumn(cell.column);
                      const explicitWCell = columnExplicitWidth(cell.column);

                      return (
                        <td
                          key={cellKey}
                          {...cellProps}
                          style={{
                            ...(dynamicRowBackground
                              ? {
                                  backgroundColor:
                                    i % 2 === 0
                                      ? "var(--tr1-txt-color)"
                                      : "var(--tr2-txt-color)",
                                }
                              : {}),
                            color: "var(--content-txt-color)",
                            fontFamily: "Inter",
                            fontSize: "12px",
                            fontWeight: "normal",
                            textAlign: "center",
                            verticalAlign: "middle",
                            whiteSpace:
                              layoutFixed || srNoCell ? "nowrap" : "normal",
                            wordBreak:
                              layoutFixed || srNoCell ? "normal" : "break-word",
                            lineHeight: "1.4",
                            padding: srNoCell ? "10px 6px" : "10px",
                            ...(srNoCell
                              ? {
                                  width: "64px",
                                  minWidth: "56px",
                                  maxWidth: "80px",
                                }
                              : explicitWCell
                              ? { width: explicitWCell }
                              : { width: undefined }),
                            ...(!srNoCell && explicitWCell
                              ? {}
                              : !srNoCell
                              ? {
                                  minWidth: compactCell ? "88px" : "120px",
                                  maxWidth: compactCell ? "168px" : undefined,
                                }
                              : {}),
                            ...(layoutFixed
                              ? {
                                  overflow: "hidden" as const,
                                  textOverflow: "ellipsis" as const,
                                }
                              : {}),
                          }}
                        >
                          {cell.render("Cell")}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={props.columns.length} className="text-center">
                  No records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {isPagination && (
        <div
          id="pagination_container"
          style={{
            height: "40px",
            justifyContent: "center",
            display: "flex",
            flex: "0 0 auto",
            paddingTop: "20px",
            paddingBottom: "10px",
            boxShadow: "0 -5px 5px -5px rgba(0, 0, 0, 0.1)",
          }}
        >
          <CustomPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
      {/* {(isPagination) && (<Pagination
        tableProps={{
          state: {
            pageIndex: currentPage - 1,
            pageSize: pageSize,
          },
          pageCount: totalPages,
          gotoPage: (page: number) => onPageChange(page + 1),
          setPageSize: (size: number) => {
            onLimitChange?.(size);
          },
        }}
        sizePerPageList={[
          { text: "10", value: 10 },
          { text: "20", value: 20 },
          { text: "50", value: 50 },
          { text: "100", value: 100 },
        ]}
      />)
      } */}
    </>
  );
};

export default CustomTable;
