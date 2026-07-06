import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "react-bootstrap";
import CustomHeader from "../../components/CustomHeader";
import CustomSummaryBox from "../../components/CustomSummaryBox";
import CustomUtilityBox from "../../components/CustomUtilityBox";
import { capitalizeString, statusCell } from "../../helper/utility";
import CustomTable from "../../components/CustomTable";
import AddEditStateDialog from "./AddEditStateDialog";
import AddEditCityDialog from "./AddEditCityDialog";
import { StateModel } from "../../lib/models/StateModel";
import { fetchState, deleteState } from "../../services/stateService";
import { deleteCity, fetchCity } from "../../services/cityService";
import CustomActionColumn from "../../components/CustomActionColumn";
import { openConfirmDialog } from "../../components/CustomConfirmDialog";
import { CityModel } from "../../lib/models/CityModel";
import {
  useFranchiseHeaderForm,
  useFranchiseScopedGetCount,
} from "../../lib/global/hooks/useFranchiseScopedGetCount";
import { AppConstant, UserRole } from "../../lib/global/AppConstant";
import { getLocalStorage } from "../../lib/global/localStorageHelper";
import { AreaModel } from "../../lib/models/AreaModel";
import { fetchArea, deleteArea } from "../../services/areaService";
import AddEditAreaDialog from "./AddEditAreaDialog";
import CustomFormSelect from "../../components/CustomFormSelect";
import { useForm, UseFormRegister } from "react-hook-form";
import {
  fetchFranchise,
  fetchFranchiseDropDown,
} from "../../services/franchiseService";
import type { ServerTableSortBy } from "../../lib/global/serverTableSort";

type LocationFilters = {
  name?: string;
  status?: string;
  sort?: string;
  state_id?: string;
  city_id?: string;
  franchise_id?: string;
  /** Backend area list scope (franchise admin). */
  type?: string;
};

const LocationManagement = () => {
  const HeaderComponent: any = CustomHeader;
  const SummaryBoxComponent: any = CustomSummaryBox;
  const UtilityBoxComponent: any = CustomUtilityBox;
  const TableComponent: any = CustomTable;
  const FormSelectComponent: any = CustomFormSelect;
  const ActionColumnComponent: any = CustomActionColumn;

  const [selectedBox, setSelectedBox] = useState<string>("box-state");
  const [stateData, setStateData] = useState<{}>({});
  const [cityData, setCityData] = useState<{}>({});
  const [areaData, setAreaData] = useState<{}>({});
  const [stateList, setStateList] = useState<StateModel[]>([]);
  const [cityList, setCityList] = useState<CityModel[]>([]);
  const [areaList, setAreaList] = useState<AreaModel[]>([]);
  const [areaFranchiseOptions, setAreaFranchiseOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [franchiseAreaIdsById, setFranchiseAreaIdsById] = useState<
    Map<string, Set<string>>
  >(new Map());
  const [selectedAreaFranchiseId, setSelectedAreaFranchiseId] = useState("");
  const [activeFilters, setActiveFilters] = useState<LocationFilters>({});
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);
  const [stateTableSortBy, setStateTableSortBy] = useState<ServerTableSortBy>(
    []
  );
  const [cityTableSortBy, setCityTableSortBy] = useState<ServerTableSortBy>([]);
  const [areaTableSortBy, setAreaTableSortBy] = useState<ServerTableSortBy>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const fetchRef = useRef(false);
  const isFranchiseAdmin =
    getLocalStorage(AppConstant.userRole) === UserRole.FRANCHISE_ADMIN;
  const { register: areaFilterRegister, setValue: setAreaFilterValue } =
    useForm<{
      area_franchise_id: string;
    }>({
      defaultValues: {
        area_franchise_id: "",
      },
    });
  const {
    register: headerRegister,
    setValue: setHeaderValue,
    franchiseId: headerFranchiseId,
  } = useFranchiseHeaderForm();
  const { countModel: locationCountModel, refresh: refreshLocationCounts } =
    useFranchiseScopedGetCount({
      type: 1,
      franchiseId: headerFranchiseId,
    });

  const sanitizeFilters = (filters: LocationFilters): LocationFilters =>
    Object.entries(filters).reduce((acc, [key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        acc[key as keyof LocationFilters] = value as never;
      }
      return acc;
    }, {} as LocationFilters);

  const fetchData = useCallback(
    async (selected: string, filters: LocationFilters) => {
      if (fetchRef.current) return;
      fetchRef.current = true;
      try {
        if (selected === "box-state") {
          const { response, states, totalPages } = await fetchState(
            currentPage,
            pageSize,
            { ...filters },
            stateTableSortBy
          );
          if (response) {
            setStateList(states);
            setTotalPages(totalPages);
          } else {
            setStateList([]);
            setTotalPages(0);
          }
        } else if (selected === "box-city") {
          const { response, cities, totalPages } = await fetchCity(
            currentPage,
            pageSize,
            { ...filters },
            cityTableSortBy
          );
          if (response) {
            setCityList(cities);
            setTotalPages(totalPages);
          } else {
            setCityList([]);
            setTotalPages(0);
          }
        } else if (selected === "box-area") {
          const areaFilters: LocationFilters = { ...filters };
          const { response, areas, totalPages } = await fetchArea(
            currentPage,
            pageSize,
            areaFilters,
            areaTableSortBy
          );
          if (response && Array.isArray(areas)) {
            const selectedFranchiseId = String(
              areaFilters.franchise_id ?? ""
            ).trim();

            if (isFranchiseAdmin) {
              setAreaList(areas);
              setTotalPages(totalPages);
            } else if (selectedFranchiseId) {
              const allowedAreaIds =
                franchiseAreaIdsById.get(selectedFranchiseId);
              if (allowedAreaIds && allowedAreaIds.size > 0) {
                setAreaList(
                  areas.filter((row: any) =>
                    allowedAreaIds.has(String(row?._id ?? row?.id ?? "").trim())
                  )
                );
                setTotalPages(1);
              } else if (allowedAreaIds && allowedAreaIds.size === 0) {
                setAreaList([]);
                setTotalPages(0);
              } else {
                setAreaList(
                  areas.filter((row: any) => {
                    const rowFranchiseId = String(
                      row?.franchise_id ??
                        row?.franchiseId ??
                        row?.franchise?._id ??
                        ""
                    ).trim();
                    return rowFranchiseId
                      ? rowFranchiseId === selectedFranchiseId
                      : true;
                  })
                );
                setTotalPages(1);
              }
            } else {
              setAreaList(areas);
              setTotalPages(totalPages);
            }
          } else {
            setAreaList([]);
            setTotalPages(0);
          }
        }
      } finally {
        fetchRef.current = false;
      }
    },
    [
      areaTableSortBy,
      cityTableSortBy,
      currentPage,
      franchiseAreaIdsById,
      pageSize,
      stateTableSortBy,
      isFranchiseAdmin,
    ]
  );

  useEffect(() => {
    fetchData(selectedBox, activeFilters);
  }, [selectedBox, pageSize, currentPage, activeFilters, fetchData]);

  useEffect(() => {
    if (!locationCountModel) return;
    setStateData({
      Total: locationCountModel.total_state,
      Active: locationCountModel.active_state,
      Inactive: locationCountModel.inactive_state,
    });
    setCityData({
      Total: locationCountModel.total_city,
      Active: locationCountModel.active_city,
      Inactive: locationCountModel.inactive_city,
    });
    setAreaData({
      Total: locationCountModel.total_area,
      Active: locationCountModel.active_area,
      Inactive: locationCountModel.inactive_area,
    });
  }, [locationCountModel]);

  const refreshData = useCallback(
    async (selected: string, filters: LocationFilters = activeFilters) => {
      await refreshLocationCounts();
      await fetchData(selected, sanitizeFilters(filters));
    },
    [fetchData, activeFilters, refreshLocationCounts]
  );

  const handleFilterChange = async (
    filters: LocationFilters,
    reset = false
  ) => {
    const mergedFilters = reset
      ? {}
      : sanitizeFilters({ ...activeFilters, ...filters });
    setActiveFilters(mergedFilters);
    setCurrentPage(1);
    setTotalPages(0);
    if (reset) {
      fetchRef.current = false;
    }
  };

  useEffect(() => {
    const loadAreaDropdowns = async () => {
      if (selectedBox !== "box-area") return;
      if (isFranchiseAdmin) return;
      const franchises = await fetchFranchiseDropDown();
      setAreaFranchiseOptions(franchises);
      // Fallback map: selected franchise -> assigned area ids.
      const pageSize = 200;
      const maxPages = 30;
      const areaMap = new Map<string, Set<string>>();
      for (let page = 1; page <= maxPages; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetchFranchise(page, pageSize, {}, []);
        if (!res.response) break;
        for (const row of res.franchises ?? []) {
          const fid = String((row as any)?._id ?? "").trim();
          if (!fid) continue;
          const areaIdsRaw = Array.isArray((row as any)?.area_id)
            ? (row as any).area_id
            : (row as any)?.area_id
            ? [(row as any).area_id]
            : [];
          const ids = new Set<string>(
            areaIdsRaw.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)
          );
          areaMap.set(fid, ids);
        }
        if (!res.totalPages || page >= res.totalPages) break;
      }
      setFranchiseAreaIdsById(areaMap);
    };
    loadAreaDropdowns();
  }, [selectedBox, isFranchiseAdmin]);

  const handleAreaFranchiseFilterChange = async (franchiseId: string) => {
    setSelectedAreaFranchiseId(franchiseId);
    await handleFilterChange({ franchise_id: franchiseId });
  };

  const clearCityFilters = () => {
    handleFilterChange({ state_id: "", name: "" });
    setUtilitySearchKey((k) => k + 1);
  };

  const clearAreaFilters = () => {
    setSelectedAreaFranchiseId("");
    setAreaFilterValue("area_franchise_id", "", { shouldValidate: false });
    handleFilterChange({
      state_id: "",
      city_id: "",
      franchise_id: "",
      name: "",
    });
    setUtilitySearchKey((k) => k + 1);
  };

  const cityClearDisabled = !String(activeFilters.name ?? "").trim();
  const areaClearDisabled =
    !activeFilters.franchise_id &&
    !String(activeFilters.name ?? "").trim();

  const franchiseFilterOptions = [
    { value: "", label: "All" },
    ...areaFranchiseOptions,
  ];

  const stateColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      { Header: "Name", accessor: "name" },
      {
        Header: "Status",
        accessor: "is_active",
       
        Cell: statusCell("is_active"),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) =>
          ActionColumnComponent ? (
            <ActionColumnComponent
              row={row}
              onView={() => {
                AddEditStateDialog.show(
                  true,
                  row.original,
                  () => refreshData("box-state"),
                  true
                );
              }}
              onDelete={async () => {
                openConfirmDialog(
                  "Are you sure you want to void this state? ",
                  "Void",
                  "Cancel",
                  async () => {
                    let response = await deleteState(row.original._id);
                    if (response) {
                      refreshData("box-state");
                    }
                  }
                );
              }}
            />
          ) : (
            <span>-</span>
          ),
      },
    ],
    [currentPage, pageSize, ActionColumnComponent, refreshData]
  );

  const cityColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      { Header: "State Name", accessor: "state_name", sort: true },
      { Header: "City Name", accessor: "name", sort: true },
      {
        Header: "Status",
        accessor: "is_active",
       
        Cell: statusCell("is_active"),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) =>
          ActionColumnComponent ? (
            <ActionColumnComponent
              row={row}
              onView={() => {
                AddEditCityDialog.show(
                  true,
                  row.original,
                  () => refreshData("box-city"),
                  true
                );
              }}
              onDelete={async () => {
                openConfirmDialog(
                  "Are you sure you want to void this city? ",
                  "Void",
                  "Cancel",
                  async () => {
                    let response = await deleteCity(row.original._id);
                    if (response) {
                      refreshData("box-city");
                    }
                  }
                );
              }}
            />
          ) : (
            <span>-</span>
          ),
      },
    ],
    [currentPage, pageSize, ActionColumnComponent, refreshData]
  );

  const pinCodesCell = ({ row }: any) => {
    const rawPinCodes =
      row?.original?.pincodes ??
      row?.original?.pincode ??
      row?.original?.pin_codes ??
      [];

    const pinCodes = Array.isArray(rawPinCodes)
      ? rawPinCodes
      : typeof rawPinCodes === "string"
      ? rawPinCodes.split(",")
      : [];

    const normalized = pinCodes
      .map((p: any) => String(p).trim())
      .filter(Boolean);

    if (normalized.length === 0) return "-";

    return (
      <div className="pin-code-hover-wrapper">
        <span className="pin-code-hover-trigger">
          {normalized.length === 1 ? (
            normalized[0]
          ) : (
            <>
              {normalized[0]}...
              <span className="pin-code-more-count">
                {" "}
                +{normalized.length - 1}
              </span>
            </>
          )}
        </span>
        {normalized.length > 1 && (
          <div className="pin-code-hover-card">
            {normalized.map((p: string) => (
              <div key={p} className="pin-code-hover-item">
                {p}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const areaColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: any) => (currentPage - 1) * pageSize + row.index + 1,
      },
      {
        Header: "State",
        accessor: "state_name",
        sort: true,
        Cell: ({ row }: any) => row?.original?.state_name ?? "-",
      },
      { Header: "City", accessor: "city_name", sort: true },
      { Header: "Area", accessor: "name", sort: true },
      {
        Header: "Pin code",
        accessor: "pincodes",
        Cell: pinCodesCell,
      },
      {
        Header: "Status",
        accessor: "is_active",
       
        Cell: statusCell("is_active"),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: any) =>
          ActionColumnComponent ? (
            <ActionColumnComponent
              row={row}
              onView={() =>
                AddEditAreaDialog.show(
                  true,
                  row.original,
                  () => refreshData("box-area"),
                  true
                )
              }
              onDelete={async () => {
                openConfirmDialog(
                  "Are you sure you want to void this area?",
                  "Void",
                  "Cancel",
                  async () => {
                    let res = await deleteArea(row.original._id);
                    if (res) refreshData("box-area");
                  }
                );
              }}
            />
          ) : (
            <span>-</span>
          ),
      },
    ],
    [currentPage, pageSize, ActionColumnComponent, refreshData]
  );

  const utilityColumnLayout =
    selectedBox === "box-city" || selectedBox === "box-area";

  const utilityTitle =
    selectedBox === "box-state"
      ? "States"
      : selectedBox === "box-city"
      ? "Cities"
      : "Areas";
  const utilitySearchHint =
    selectedBox === "box-state"
      ? "Search State Name"
      : selectedBox === "box-city"
      ? "Search City or State Name"
      : "Search State, City, Area";

  const locationUtilityBox = UtilityBoxComponent ? (
    <UtilityBoxComponent
      key={`location-utility-${selectedBox}-${utilitySearchKey}`}
      title={utilityTitle}
      searchHint={utilitySearchHint}
      toolsInlineRow={
        selectedBox === "box-city" || selectedBox === "box-area"
      }
      controlSlot={
        selectedBox === "box-area" && !isFranchiseAdmin ? (
          <div style={{ minWidth: "200px" }}>
            {FormSelectComponent ? (
              <FormSelectComponent
                label="Franchise"
                controlId="area_filter_franchise"
                options={franchiseFilterOptions}
                register={
                  areaFilterRegister as unknown as UseFormRegister<any>
                }
                fieldName="area_franchise_id"
                asCol={false}
                noBottomMargin
                selectWidth="200px"
                defaultValue={selectedAreaFranchiseId}
                setValue={
                  setAreaFilterValue as (name: string, value: any) => void
                }
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  handleAreaFranchiseFilterChange(e.target.value)
                }
              />
            ) : null}
          </div>
        ) : undefined
      }
      afterSearchSlot={
        selectedBox === "box-city" ? (
          <Button
            variant="outline-secondary"
            size="sm"
            className="custom-btn-secondary partner-payout-clear-btn px-3"
            type="button"
            disabled={cityClearDisabled}
            onClick={clearCityFilters}
          >
            Clear
          </Button>
        ) : selectedBox === "box-area" ? (
          <Button
            variant="outline-secondary"
            size="sm"
            className="custom-btn-secondary partner-payout-clear-btn px-3"
            type="button"
            disabled={areaClearDisabled}
            onClick={clearAreaFilters}
          >
            Clear
          </Button>
        ) : undefined
      }
      onSearch={(value: string) => {
        void handleFilterChange({ name: value.trim() });
      }}
      syncKeyword={activeFilters.name ?? ""}
    />
  ) : null;

  return (
    <>
      {utilityColumnLayout ? (
        <style>
          {`
                    .location-management-utility-column .custom-utilty-box {
                        // flex-direction: column;
                        // align-items: stretch;
                        // justify-content: flex-start;
                    }
                    .location-management-utility-column .custom-utilty-box-title {
                        // width: 100%;
                    }
                    .location-management-utility-column .custom-utilty-tools-inline {
                        // width: 100%;
                        flex: none;
                        justify-content: flex-start;
                        align-items: flex-end;
                        flex-wrap: wrap;
                    }
                    .location-management-utility-column
                        .custom-utilty-tools-inline
                        > div.d-flex.align-items-end {
                        // margin-left: auto;
                    }
                `}
        </style>
      ) : null}
      <div className="main-page-content">
        {HeaderComponent ? (
          <HeaderComponent
            title="Location Management"
            register={headerRegister}
            setValue={setHeaderValue}
            hideFranchiseDropdown
          />
        ) : (
          <h4>Location Management</h4>
        )}

        <div className="box-container">
          {["box-state", "box-city", "box-area"].map((id) => {
            if (SummaryBoxComponent) {
              return (
                <SummaryBoxComponent
                  key={id}
                  divId={id}
                  title={capitalizeString(
                    id.replace("box-", "").replace("-", " ")
                  )}
                  data={
                    id === "box-state"
                      ? stateData
                      : id === "box-city"
                      ? cityData
                      : areaData
                  }
                  onSelect={(divId: string) => {
                    setSelectedBox(divId);
                    setSelectedAreaFranchiseId("");
                    setStateTableSortBy([]);
                    setCityTableSortBy([]);
                    setAreaTableSortBy([]);
                    void handleFilterChange({}, true);
                    setUtilitySearchKey((k) => k + 1);
                  }}
                  isSelected={selectedBox === id}
                  onFilterChange={(filter: { status?: string }) => {
                    handleFilterChange(filter);
                  }}
                  isAddShow={true}
                  addButtonLable={capitalizeString(
                    id.replace("box-", "Add ").replace("-", " ")
                  )}
                  onAddClick={() => {
                    id === "box-state"
                      ? AddEditStateDialog.show(false, null, () =>
                          refreshData(selectedBox)
                        )
                      : id === "box-area"
                      ? AddEditAreaDialog.show(false, null, () =>
                          refreshData(selectedBox)
                        )
                      : AddEditCityDialog.show(false, null, () =>
                          refreshData(selectedBox)
                        );
                  }}
                />
              );
            }
            return (
              <div key={id} className="box">
                {capitalizeString(id.replace("box-", "").replace("-", " "))}
              </div>
            );
          })}
        </div>

        {locationUtilityBox ? (
          utilityColumnLayout ? (
            <div className="location-management-utility-column">
              {locationUtilityBox}
            </div>
          ) : (
            locationUtilityBox
          )
        ) : null}

        {TableComponent ? (
          <TableComponent
            columns={
              selectedBox === "box-state"
                ? stateColumns
                : selectedBox === "box-city"
                ? cityColumns
                : areaColumns
            }
            data={
              selectedBox === "box-state"
                ? stateList
                : selectedBox === "box-city"
                ? cityList
                : areaList
            }
            pageSize={pageSize}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={(page: number) => setCurrentPage(page)}
            onLimitChange={(pageSize: number) => {
              setPageSize(pageSize);
              setCurrentPage(1);
            }}
            manualSortBy
            sortBy={
              selectedBox === "box-state"
                ? stateTableSortBy
                : selectedBox === "box-city"
                ? cityTableSortBy
                : areaTableSortBy
            }
            onSortChange={(next: ServerTableSortBy) => {
              if (selectedBox === "box-state") {
                setStateTableSortBy(next);
              } else if (selectedBox === "box-city") {
                setCityTableSortBy(next);
              } else {
                setAreaTableSortBy(next);
              }
              setCurrentPage(1);
            }}
            theadClass="table-light"
          />
        ) : null}
      </div>
    </>
  );
};

export default LocationManagement;
