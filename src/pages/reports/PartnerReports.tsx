import React, { useEffect, useMemo, useState } from "react";
import { Row, Col, Button, Form } from "react-bootstrap";
import CustomMultiSelect from "../../components/CustomMultiSelect";
import CustomDatePicker from "../../components/CustomDatePicker";
import { useForm, UseFormRegister } from "react-hook-form";
import { fetchCategoryDropDown } from "../../services/categoryService";
import { fetchServiceDropDown } from "../../services/servicesService";
import { fetchStateDropDown } from "../../services/stateService";
import { fetchCityDropDown } from "../../services/cityService";
import { FranchiseModel } from "../../lib/models/FranchiseModels";
import { AreaModel } from "../../lib/models/AreaModel";
import { exportData } from "../../services/exportService";
import { ApiPaths } from "../../lib/global/remote/apiPaths";
import { buildPartnerReportExportPayload } from "../../lib/reports/reportExportPayload";
import type { ReportOptionType } from "../../lib/reports/reportFilterShared";
import {
  reportAllOption as allOption,
  reportFilterLabelClass as filterLabelClass,
  reportMultiSelectChipsMaxHeight as multiSelectChipsMaxHeight,
  reportToIsoCalendarDate as toIsoCalendarDate,
  loadAllPartnerOptionsForDropdown,
  loadAllFranchiseRows,
  loadAllAreaRows,
} from "../../lib/reports/reportFilterShared";

type OptionType = ReportOptionType;

type PartnerReportsPageProps = {
  franchiseId?: string;
};

const PartnerReportsPage = ({ franchiseId = "all" }: PartnerReportsPageProps) => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const { register: reportFilterRegister, setValue: setReportFilterValue } =
    useForm<{
      partner_from_date: string;
      partner_to_date: string;
    }>({
      defaultValues: {
        partner_from_date: "",
        partner_to_date: "",
      },
    });

  const [partners, setPartners] = useState<OptionType[]>([]);
  const [services, setServices] = useState<OptionType[]>([]);
  const [categories, setCategories] = useState<OptionType[]>([]);
  const [states, setStates] = useState<OptionType[]>([]);
  const [cities, setCities] = useState<OptionType[]>([]);
  const [franchises, setFranchises] = useState<OptionType[]>([]);
  const [areas, setAreas] = useState<OptionType[]>([]);

  const [categoryOptions, setCategoryOptions] = useState<OptionType[]>([
    allOption,
  ]);
  const [serviceOptions, setServiceOptions] = useState<OptionType[]>([
    allOption,
  ]);
  const [partnerOptions, setPartnerOptions] = useState<OptionType[]>([
    allOption,
  ]);
  const [stateListOptions, setStateListOptions] = useState<OptionType[]>([
    allOption,
  ]);
  const [cityOptionsRaw, setCityOptionsRaw] = useState<
    (OptionType & { state_id?: string })[]
  >([]);
  const [allFranchiseRows, setAllFranchiseRows] = useState<FranchiseModel[]>(
    []
  );
  const [allAreaRows, setAllAreaRows] = useState<AreaModel[]>([]);

  const cityOptions = useMemo(
    (): OptionType[] => [
      allOption,
      ...cityOptionsRaw.map(({ value, label }) => ({ value, label })),
    ],
    [cityOptionsRaw]
  );

  const cityIdToStateId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cityOptionsRaw) {
      if (c.value && c.state_id) m.set(c.value, String(c.state_id));
    }
    return m;
  }, [cityOptionsRaw]);

  const franchiseSelectOptions = useMemo((): OptionType[] => {
    if (allFranchiseRows.length === 0) return [allOption];
    const sSel = new Set(
      states.filter((s) => s.value !== "all").map((s) => s.value)
    );
    const cSel = new Set(
      cities.filter((c) => c.value !== "all").map((c) => c.value)
    );
    const stActive = sSel.size > 0;
    const cActive = cSel.size > 0;
    const out: OptionType[] = [];
    for (const fr of allFranchiseRows) {
      const id = fr?._id != null ? String(fr._id) : "";
      if (!id) continue;
      const name = (fr.name && String(fr.name)) || id;
      if (stActive) {
        const st = fr.state_id != null ? String(fr.state_id) : "";
        if (st && !sSel.has(st)) continue;
      }
      if (cActive) {
        const cid = fr.city_id != null ? String(fr.city_id) : "";
        if (cid && !cSel.has(cid)) continue;
      }
      out.push({ value: id, label: name });
    }
    out.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
    return [allOption, ...out];
  }, [allFranchiseRows, states, cities]);

  const areaSelectOptions = useMemo((): OptionType[] => {
    if (allAreaRows.length === 0) return [allOption];
    const sSel = new Set(
      states.filter((s) => s.value !== "all").map((s) => s.value)
    );
    const cSel = new Set(
      cities.filter((c) => c.value !== "all").map((c) => c.value)
    );
    const fSel = new Set(
      franchises.filter((f) => f.value !== "all").map((f) => f.value)
    );
    const stActive = sSel.size > 0;
    const cActive = cSel.size > 0;
    const fActive = fSel.size > 0;
    const allowedByFr = new Set<string>();
    if (fActive) {
      for (const fr of allFranchiseRows) {
        if (!fSel.has(String(fr?._id ?? ""))) continue;
        const raw = (fr as FranchiseModel & { area_id?: string | string[] })
          .area_id;
        if (Array.isArray(raw)) {
          for (const x of raw) {
            if (x != null) allowedByFr.add(String(x));
          }
        } else if (raw) {
          allowedByFr.add(String(raw));
        }
      }
    }
    const out: OptionType[] = [];
    for (const a of allAreaRows) {
      const id = a?._id != null ? String(a._id) : "";
      if (!id) continue;
      const name = (a.name && String(a.name)) || id;
      const cityId = a.city_id != null ? String(a.city_id) : "";
      const st = (a as AreaModel & { state_id?: string | null }).state_id
        ? String((a as AreaModel & { state_id: string }).state_id)
        : cityId
        ? cityIdToStateId.get(cityId) ?? null
        : null;
      if (stActive && st && !sSel.has(st)) continue;
      if (cActive && cityId && !cSel.has(cityId)) continue;
      if (fActive) {
        if (allowedByFr.size > 0 && !allowedByFr.has(id)) continue;
      }
      out.push({ value: id, label: name });
    }
    out.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
    return [allOption, ...out];
  }, [
    allAreaRows,
    allFranchiseRows,
    cityIdToStateId,
    states,
    cities,
    franchises,
  ]);

  const handleSelectWithAll = (
    selected: OptionType[],
    setter: (val: OptionType[]) => void
  ) => {
    const hasAll = selected.some((item) => item.value === "all");
    if (hasAll) {
      setter([allOption]);
    } else {
      setter(selected.filter((item) => item.value !== "all"));
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [categories, stateRows, partnerOpts, frRows, arRows] =
          await Promise.all([
            fetchCategoryDropDown(),
            fetchStateDropDown(),
            loadAllPartnerOptionsForDropdown(),
            loadAllFranchiseRows(),
            loadAllAreaRows(),
          ]);
        if (cancelled) return;
        setCategoryOptions([
          allOption,
          ...categories
            .filter((c) => c?.value)
            .map((c) => ({ value: c.value, label: c.label })),
        ]);
        setStateListOptions([
          allOption,
          ...stateRows
            .filter((s) => s?.value)
            .map((s) => ({ value: s.value, label: s.label })),
        ]);
        setPartnerOptions([allOption, ...partnerOpts]);
        setAllFranchiseRows(frRows);
        setAllAreaRows(arRows);
      } catch {
        if (!cancelled) {
          /* keep defaults */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const hasAll =
        categories.length === 0 || categories.some((c) => c.value === "all");
      const specific = categories.filter((c) => c.value !== "all");
      let rows: { value: string; label: string; price?: number }[] = [];
      try {
        if (hasAll || specific.length === 0) {
          rows = await fetchServiceDropDown();
        } else {
          const merged = await Promise.all(
            specific.map((c) => fetchServiceDropDown(c.value))
          );
          const byId = new Map<string, (typeof rows)[0]>();
          for (const block of merged) {
            for (const s of block) {
              if (s?.value) byId.set(s.value, s);
            }
          }
          rows = Array.from(byId.values());
        }
        if (cancelled) return;
        setServiceOptions([
          allOption,
          ...rows
            .filter((s) => s?.value)
            .map((s) => ({ value: s.value, label: s.label })),
        ]);
      } catch {
        if (!cancelled) setServiceOptions([allOption]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categories]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const hasStateAll =
        states.length === 0 || states.some((s) => s.value === "all");
      const stateIds = states
        .filter((s) => s.value !== "all")
        .map((s) => s.value);
      try {
        const cityRows = hasStateAll
          ? await fetchCityDropDown()
          : await fetchCityDropDown(stateIds);
        if (cancelled) return;
        setCityOptionsRaw(
          (cityRows as { value: string; label: string; state_id?: string }[])
            .filter((c) => c?.value)
            .map((c) => ({
              value: c.value,
              label: c.label,
              state_id: c.state_id ? String(c.state_id) : undefined,
            }))
        );
      } catch {
        if (!cancelled) setCityOptionsRaw([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [states]);

  useEffect(() => {
    setServices((prev) => {
      const valid = new Set(serviceOptions.map((o) => o.value));
      if (prev.every((p) => p.value === "all" || valid.has(p.value))) {
        return prev;
      }
      return prev.filter((p) => p.value === "all" || valid.has(p.value));
    });
  }, [serviceOptions]);

  useEffect(() => {
    setCities((prev) => {
      const valid = new Set(cityOptions.map((o) => o.value));
      if (prev.every((p) => p.value === "all" || valid.has(p.value))) {
        return prev;
      }
      return prev.filter((p) => p.value === "all" || valid.has(p.value));
    });
  }, [cityOptions]);

  useEffect(() => {
    setFranchises((prev) => {
      const valid = new Set(franchiseSelectOptions.map((o) => o.value));
      if (prev.every((p) => p.value === "all" || valid.has(p.value))) {
        return prev;
      }
      return prev.filter((p) => p.value === "all" || valid.has(p.value));
    });
  }, [franchiseSelectOptions]);

  useEffect(() => {
    setAreas((prev) => {
      const valid = new Set(areaSelectOptions.map((o) => o.value));
      if (prev.every((p) => p.value === "all" || valid.has(p.value))) {
        return prev;
      }
      return prev.filter((p) => p.value === "all" || valid.has(p.value));
    });
  }, [areaSelectOptions]);

  const handleExport = async () => {
    await exportData(
      ApiPaths.EXPORT_PARTNER_REPORT,
      buildPartnerReportExportPayload({
        fromDate,
        toDate,
        franchiseId,
        partners,
        categories,
        services,
        states,
        cities,
        areas,
        franchises,
      })
    );
  };

  const handleReset = () => {
    setFromDate("");
    setToDate("");
    setReportFilterValue("partner_from_date", "");
    setReportFilterValue("partner_to_date", "");
    setPartners([]);
    setServices([]);
    setCategories([]);
    setStates([]);
    setCities([]);
    setFranchises([]);
    setAreas([]);
  };

  return (
    <div className="mt-4">
      <div className="card border-0 shadow-sm rounded-3">
        <div className="card-body p-3 p-md-4">
          <Row className="align-items-center justify-content-between g-3 mb-3">
            <Col md={5} lg={4}>
              <h5 className="custom-utilty-box-title mb-1">Partner Reports</h5>
              <small className="text-muted">
                Used to generate reports related to partner performance and
                earnings.
              </small>
            </Col>
            <Col md={6} lg={6}>
              <Row className="g-2 g-md-3">
                <Col sm={6}>
                  <Form.Label className="small fw-semibold mb-1">
                    From
                  </Form.Label>
                  <CustomDatePicker
                    label=""
                    controlId="partner_from_date"
                    selectedDate={fromDate || null}
                    onChange={(date) => setFromDate(toIsoCalendarDate(date))}
                    register={
                      reportFilterRegister as unknown as UseFormRegister<any>
                    }
                    setValue={
                      setReportFilterValue as (name: string, value: any) => void
                    }
                    asCol={false}
                    groupClassName="mb-0 w-100"
                    filterDate={() => true}
                  />
                </Col>
                <Col sm={6}>
                  <Form.Label className="small fw-semibold mb-1">To</Form.Label>
                  <CustomDatePicker
                    label=""
                    controlId="partner_to_date"
                    selectedDate={toDate || null}
                    onChange={(date) => setToDate(toIsoCalendarDate(date))}
                    register={
                      reportFilterRegister as unknown as UseFormRegister<any>
                    }
                    setValue={
                      setReportFilterValue as (name: string, value: any) => void
                    }
                    asCol={false}
                    groupClassName="mb-0 w-100"
                    filterDate={() => true}
                  />
                </Col>
              </Row>
            </Col>
          </Row>

          <div className="border rounded-3 p-3 bg-light">
            <h6
              style={{ color: "var(--primary-txt-color)" }}
              className="fw-semibold mb-3"
            >
              Partner filters
            </h6>
            <Row className="g-3">
              <Col md={6}>
                <Form.Label className={filterLabelClass}>Partner</Form.Label>
                <CustomMultiSelect
                  label=""
                  controlId="Partner"
                  options={partnerOptions}
                  value={partners}
                  onChange={(selectedOptions) =>
                    handleSelectWithAll(
                      selectedOptions as OptionType[],
                      setPartners
                    )
                  }
                  asCol={false}
                  selectedChipsMaxHeight={multiSelectChipsMaxHeight}
                />
              </Col>

              <Col md={6}>
                <Form.Label className={filterLabelClass}>Category</Form.Label>
                <CustomMultiSelect
                  label=""
                  controlId="Category"
                  options={categoryOptions}
                  value={categories}
                  onChange={(selectedOptions) =>
                    handleSelectWithAll(
                      selectedOptions as OptionType[],
                      setCategories
                    )
                  }
                  asCol={false}
                  selectedChipsMaxHeight={multiSelectChipsMaxHeight}
                />
              </Col>

              <Col md={6}>
                <Form.Label className={filterLabelClass}>Service</Form.Label>
                <CustomMultiSelect
                  label=""
                  controlId="Service"
                  options={serviceOptions}
                  value={services}
                  onChange={(selectedOptions) =>
                    handleSelectWithAll(
                      selectedOptions as OptionType[],
                      setServices
                    )
                  }
                  asCol={false}
                  selectedChipsMaxHeight={multiSelectChipsMaxHeight}
                />
              </Col>
            </Row>

            <Row className="mt-4 justify-content-end">
              <Col xs={6}>
                <div className="d-flex justify-content-end gap-2 mt-2">
                  <Button
                    size="sm"
                    className="custom-btn-secondary px-3"
                    onClick={handleReset}
                    style={{ minWidth: "30px" }}
                  >
                    Reset
                  </Button>

                  <Button
                    size="sm"
                    className="custom-btn-primary px-3"
                    style={{ width: "80px" }}
                    onClick={() => void handleExport()}
                  >
                    Export
                  </Button>
                </div>
              </Col>
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartnerReportsPage;
