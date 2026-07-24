import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Col, Row } from "react-bootstrap";
import { useForm } from "react-hook-form";
import CustomHeader from "../../../components/CustomHeader";
import CustomSummaryBox from "../../../components/CustomSummaryBox";
import CustomUtilityBox from "../../../components/CustomUtilityBox";
import CustomTable from "../../../components/CustomTable";
import ViewPortfolioManagementDialog from "./ViewPortfolioManagementDialog";
import CustomActionColumn from "../../../components/CustomActionColumn";
import CustomFormSelect from "../../../components/CustomFormSelect";
import { statusCell } from "../../../helper/utility";
import {
  fetchPortfolios,
  fetchPortfolioProfile,
} from "../../../services/partnerManagementService";
import { useFranchiseHeaderForm } from "../../../lib/global/hooks/useFranchiseScopedGetCount";
import {
  franchiseIdForScopedListApi,
  isFranchisePortalSession,
} from "../../../lib/franchise/headerFranchisePreference";

type PortfolioManagementProps = {
  onBack?: () => void;
};

const PortfolioManagement = ({ onBack }: PortfolioManagementProps) => {
  const {
    register: headerRegister,
    setValue: headerSetValue,
    franchiseId: headerFranchiseId,
  } = useFranchiseHeaderForm();
  const { register, setValue } = useForm<any>();
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);
  const [portfolioData, setPortfolioData] = useState({
    Total: 0,
    Active: 0,
    Inactive: 0,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [portfolioRows, setPortfolioRows] = useState<any[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [filters, setFilters] = useState<{
    name?: string;
    status?: string;
    sort?: string;
    category?: string;
    service?: string;
    location?: string;
  }>({});
  const fetchRef = useRef(false);
  const hideFranchiseColumn = isFranchisePortalSession();

  const listFilters = useMemo(() => {
    const fid = franchiseIdForScopedListApi(headerFranchiseId);
    return {
      ...(fid ? { franchiseId: fid } : {}),
      ...filters,
    };
  }, [headerFranchiseId, filters]);

  const fetchData = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const res = await fetchPortfolios(currentPage, pageSize, listFilters);
      if (res.response) {
        setPortfolioRows(res.records);
        setTotalPages(res.totalPages);
        setPortfolioData(res.stats);
      } else {
        setPortfolioRows([]);
        setTotalPages(0);
        setPortfolioData({ Total: 0, Active: 0, Inactive: 0 });
      }
    } finally {
      fetchRef.current = false;
    }
  }, [currentPage, pageSize, listFilters]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refreshData = useCallback(() => {
    void fetchData();
  }, [fetchData]);

  const handleFilterChange = (nextFilters: {
    name?: string;
    status?: string;
    sort?: string;
    category?: string;
    service?: string;
    location?: string;
  }) => {
    setCurrentPage(1);
    setFilters((prev) => {
      const merged = { ...prev, ...nextFilters };
      if ("status" in nextFilters && nextFilters.status == null) {
        delete merged.status;
      }
      return merged;
    });
  };

  const categoryOptions = useMemo(() => {
    const unique = Array.from(
      new Set(
        portfolioRows
          .map((row) => String(row.category || "").trim())
          .filter(Boolean)
      )
    );
    if (filters.category && !unique.includes(filters.category)) {
      unique.push(filters.category);
    }
    return [
      { value: "all", label: "All categories" },
      ...unique
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value })),
    ];
  }, [portfolioRows, filters.category]);

  const serviceOptions = useMemo(() => {
    const unique = Array.from(
      new Set(
        portfolioRows
          .map((row) => String(row.service || "").trim())
          .filter(Boolean)
      )
    );
    if (filters.service && !unique.includes(filters.service)) {
      unique.push(filters.service);
    }
    return [
      { value: "all", label: "All services" },
      ...unique
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value })),
    ];
  }, [portfolioRows, filters.service]);

  const locationOptions = useMemo(() => {
    const unique = Array.from(
      new Set(
        portfolioRows
          .map((row) => String(row.location || "").trim())
          .filter(Boolean)
      )
    );
    if (filters.location && !unique.includes(filters.location)) {
      unique.push(filters.location);
    }
    return [
      { value: "all", label: "All locations" },
      ...unique
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value })),
    ];
  }, [portfolioRows, filters.location]);

  const portfolioFilterControls = (
    <Row className="order-payments-filters-row g-3 mt-1 mb-2 align-items-end flex-nowrap">
      <Col xs="auto" className="order-payments-filter-col">
        <CustomFormSelect
          label="Category"
          controlId="portfolio_category_filter"
          options={categoryOptions}
          register={register}
          fieldName="portfolio_category_filter"
          asCol={false}
          noBottomMargin
          defaultValue={filters.category || "all"}
          setValue={setValue}
          onChange={(e) => handleFilterChange({ category: e.target.value })}
        />
      </Col>
      <Col xs="auto" className="order-payments-filter-col">
        <CustomFormSelect
          label="Service"
          controlId="portfolio_service_filter"
          options={serviceOptions}
          register={register}
          fieldName="portfolio_service_filter"
          asCol={false}
          noBottomMargin
          defaultValue={filters.service || "all"}
          setValue={setValue}
          onChange={(e) => handleFilterChange({ service: e.target.value })}
        />
      </Col>
      <Col xs="auto" className="order-payments-filter-col">
        <CustomFormSelect
          label="Location"
          controlId="portfolio_location_filter"
          options={locationOptions}
          register={register}
          fieldName="portfolio_location_filter"
          asCol={false}
          noBottomMargin
          defaultValue={filters.location || "all"}
          setValue={setValue}
          onChange={(e) => handleFilterChange({ location: e.target.value })}
        />
      </Col>
      <Col xs="auto" className="order-payments-filter-col">
        <Button
          variant="outline-secondary"
          size="sm"
          className="custom-btn-secondary px-3"
          type="button"
          disabled={
            (filters.category ?? "all") === "all" &&
            (filters.service ?? "all") === "all" &&
            (filters.location ?? "all") === "all" &&
            !filters.name?.trim()
          }
          onClick={() => {
            setFilters({});
            setCurrentPage(1);
            setUtilitySearchKey((k) => k + 1);
            setValue("portfolio_category_filter", "all", {
              shouldValidate: false,
            });
            setValue("portfolio_service_filter", "all", {
              shouldValidate: false,
            });
            setValue("portfolio_location_filter", "all", {
              shouldValidate: false,
            });
          }}
        >
          Clear
        </Button>
      </Col>
    </Row>
  );

  const portfolioColumns = useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      { Header: "Partner Name", accessor: "partner_name" },
      ...(hideFranchiseColumn
        ? []
        : [{ Header: "Franchise", accessor: "franchise_name" }]),
      // { Header: "Category", accessor: "category" },
      // { Header: "Service", accessor: "service" },
      { Header: "Total Posts", accessor: "total_posts" },
      { Header: "Total Images", accessor: "total_images" },
      { Header: "Total Videos", accessor: "total_videos" },
      { Header: "Likes Count", accessor: "likes_count" },
      // { Header: "Comments Count", accessor: "comments_count" },
      { Header: "Saves Count", accessor: "saves_count" },
      { Header: "Ratings", accessor: "ratings" },
      
      {
        Header: "Status",
        accessor: "is_active",
        Cell: statusCell("is_active"),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={() => {
              void (async () => {
                const res = await fetchPortfolioProfile(
                  String(row.original._id),
                  headerFranchiseId,
                  row.original.franchise_id
                );
                ViewPortfolioManagementDialog.show(
                  res.portfolio ?? row.original,
                  () => refreshData()
                );
              })();
            }}
            onDelete={undefined}
          />
        ),
      },
    ],
    [currentPage, pageSize, headerFranchiseId, refreshData, hideFranchiseColumn]
  );

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Portfolio Management"
        register={headerRegister}
        setValue={headerSetValue}
        titlePrefix={
          <button
            type="button"
            className="financial-subpage-back"
            onClick={() => onBack?.()}
            aria-label="Go to Partner Management"
          >
            <i className="bi bi-chevron-left text-danger"></i>
          </button>
        }
      />

      <div className="box-container">
        <CustomSummaryBox
          divId="box-portfolio-management"
          title="Portfolio Management"
          data={portfolioData}
          onSelect={() => {
            handleFilterChange({ status: undefined });
          }}
          isSelected={true}
          onFilterChange={(filter) => {
            handleFilterChange(filter);
          }}
        />
      </div>

      <CustomUtilityBox
        key={utilitySearchKey}
        title=""
        searchHint="Search Partner Name"
        onSearch={(value) => handleFilterChange({ name: value })}
        syncKeyword={filters.name ?? ""}
      />
      {/* {portfolioFilterControls} */}

      <CustomTable
        columns={portfolioColumns}
        data={portfolioRows}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page: number) => setCurrentPage(page)}
        onLimitChange={(limit: number) => {
          setCurrentPage(1);
          setPageSize(limit);
        }}
        theadClass="table-light"
      />
    </div>
  );
};

export default PortfolioManagement;
