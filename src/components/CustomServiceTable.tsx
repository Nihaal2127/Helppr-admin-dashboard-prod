import {
  useTable,
  usePagination,
  TableState,
  UsePaginationState,
  UseTableOptions,
} from "react-table";

import classNames from "classnames";
import CustomPagination from "./CustomPagination";

interface CustomServiceTableProps {
  columns: {
    Header: string;
    accessor: string;
    sort?: boolean;
    Cell?: any;
    className?: string;
  }[];
  data: any[];
  pageSize?: number;
  currentPage?: number;
  totalPages?: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  tableClass?: string;
  theadClass?: string;
  isPagination?: boolean;
}

const CustomServiceTable = (props: CustomServiceTableProps) => {
  const currentPage = props["currentPage"] || 0;
  const totalPages = props["totalPages"] || 0;
  const onPageChange = props["onPageChange"];
  const isPagination = props.isPagination ?? true;

  const dataTable = useTable(
    {
      columns: props.columns,
      data: props.data,
      initialState: {
        pageSize: props.pageSize || 10,
        pageIndex: (props.currentPage || 1) - 1,
      } as Partial<TableState<object>> & Partial<UsePaginationState<object>>,
      manualPagination: true,
      pageCount:
        props.totalPages ||
        Math.ceil(props.data.length / (props.pageSize || 10)),
    } as UseTableOptions<object>,
    usePagination
  );

  let rows = (dataTable as unknown as { page: any[] }).page;

  return (
    <>
      <div className="table-responsive" style={{ height: "50vh" }}>
        <table
          {...dataTable.getTableProps()}
          className={classNames(
            "table table-centered react-table table-hover table-bordered",
            props["tableClass"]
          )}
          style={{
            border: "1px solid var(--txtfld-border)",
            borderCollapse: "collapse",
          }}
        >
          <thead
            className={props["theadClass"]}
            style={{ textAlign: "center", verticalAlign: "top" }}
          >
            {(dataTable.headerGroups || []).map((headerGroup: any) => (
              <tr {...headerGroup.getHeaderGroupProps()}>
                {(headerGroup.headers || []).map((column: any) => (
                  <th
                    {...column.getHeaderProps(
                      column.sort && column.getSortByToggleProps()
                    )}
                    style={{
                      backgroundColor: "var(--tr1-txt-color)",
                      color: "var(--content-txt-color)",
                      fontFamily: "Inter",
                      fontSize: "14px",
                      fontWeight: "bold",
                    }}
                    className={classNames({
                      sorting_desc: column.isSortedDesc === true,
                      sorting_asc: column.isSortedDesc === false,
                      sortable: column.sort === true,
                    })}
                  >
                    {column.render("Header")}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody
            {...dataTable.getTableBodyProps()}
            style={{ textAlign: "center" }}
          >
            {rows && rows.length > 0 ? (
              (rows || []).map((row: any, i: number) => {
                dataTable.prepareRow(row);
                return (
                  <tr {...row.getRowProps()}>
                    {(row.cells || []).map((cell: any) => {
                      return (
                        <td
                          {...cell.getCellProps([
                            {
                              className: cell.column.className,
                            },
                          ])}
                          style={{
                            backgroundColor:
                              i % 2 === 0
                                ? "var(--tr2-txt-color)"
                                : "var(--tr1-txt-color)",
                            color: "var(--content-txt-color)",
                            fontFamily: "Inter",
                            fontSize: "14px",
                            fontWeight: "normal",
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

export default CustomServiceTable;
