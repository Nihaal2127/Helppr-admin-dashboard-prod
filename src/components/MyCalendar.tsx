import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DatesSetArg, EventClickArg, EventInput } from "@fullcalendar/core";
import { Modal, Button, Form, Spinner } from "react-bootstrap";
import { useForm } from "react-hook-form";
import { CustomFormInput } from "./CustomFormInput";
import CustomFormSelect from "./CustomFormSelect";
import CustomDatePicker from "./CustomDatePicker";
import CustomUtilityBox from "./CustomUtilityBox";
import { dateToLocalYmd } from "../helper/dateFormat";
import { franchiseIdForApiQuery } from "../lib/franchise/headerFranchisePreference";
import { fetchOrder } from "../lib/order/orders";
import {
  createAppointment,
  fetchAllAppointmentsMatching,
  fetchAppointmentById,
  updateAppointment,
} from "../services/appointmentService";
import type { AppointmentModel } from "../services/appointmentService";
import { appointmentsToCalendarEvents } from "../lib/calendar/appointmentCalendarEvents";
import { parseWallClockTime } from "../lib/calendar/appointmentScheduleTimes";
import { showOrderInfoDialog } from "./order/showOrderInfoDialog";

type VisibleRange = { from_date: string; to_date: string };

type OrderOption = {
  mongoId: string;
  label: string;
};

type ViewAppointment = {
  id: string;
  uniqueId: string | null;
  title: string;
  orderId: string;
  orderMongoId: string;
  partner: string;
  serviceName: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  source: string | null;
};

type MyCalendarProps = {
  franchiseId?: string;
};

function visibleRangeFromDatesSet(arg: DatesSetArg): VisibleRange {
  const from_date = dateToLocalYmd(arg.start);
  const endExclusive = new Date(arg.end);
  endExclusive.setDate(endExclusive.getDate() - 1);
  const to_date = dateToLocalYmd(endExclusive);
  return { from_date, to_date };
}

function getDefaultVisibleRange(): VisibleRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from_date: dateToLocalYmd(start),
    to_date: dateToLocalYmd(end),
  };
}

function formatTime12h(time: string): string {
  const t = (time || "").slice(0, 5);
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return "";
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatYmdAsDdMmYyyy(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function mapEventToView(event: EventInput): ViewAppointment | null {
  const props = event.extendedProps ?? {};
  if (!event.id) return null;
  return {
    id: String(event.id),
    uniqueId: props.uniqueId ? String(props.uniqueId) : null,
    title: String(event.title ?? ""),
    orderId: String(props.orderId ?? ""),
    orderMongoId: String(props.orderMongoId ?? props.orderId ?? ""),
    partner: String(props.partner ?? ""),
    serviceName: String(props.serviceName ?? ""),
    serviceDate: String(props.serviceDate ?? ""),
    startTime: String(props.startTime ?? ""),
    endTime: String(props.endTime ?? ""),
    source: props.source ? String(props.source) : null,
  };
}

const MyCalendar: React.FC<MyCalendarProps> = ({ franchiseId = "all" }) => {
  const [events, setEvents] = useState<EventInput[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showFormModal, setShowFormModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewAppointment, setViewAppointment] = useState<ViewAppointment | null>(
    null
  );

  const [eventTitle, setEventTitle] = useState("");
  const [orderMongoId, setOrderMongoId] = useState("");
  const [orderDisplayId, setOrderDisplayId] = useState("");
  const [partner, setPartner] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [pinnedServiceDate, setPinnedServiceDate] = useState<string | null>(null);
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [errors, setErrors] = useState({
    orderId: "",
    serviceDate: "",
    fromTime: "",
    toTime: "",
  });

  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchClearVersion, setSearchClearVersion] = useState(0);
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);

  const calendarWrapperRef = useRef<HTMLDivElement | null>(null);
  const calendarRef = useRef<FullCalendar | null>(null);
  const scrollTopRef = useRef<number | null>(null);
  const focusedDateRef = useRef<Date | null>(null);
  const loadSeqRef = useRef(0);
  const visibleRangeRef = useRef<VisibleRange>(getDefaultVisibleRange());

  const { register, setValue } = useForm<any>();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(searchKeyword.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchKeyword]);

  const loadOrders = useCallback(async (keyword?: string) => {
    const kw = keyword?.trim();
    const fid = franchiseIdForApiQuery(franchiseId);
    const { response, orders: rows } = await fetchOrder(
      1,
      100,
      {
        keyword: kw,
        ...(fid ? { franchise_id: fid } : {}),
      },
      []
    );
    if (!response) return;
    setOrders(
      rows.map((order) => ({
        mongoId: order._id,
        label: order.unique_id || order._id,
      }))
    );
  }, [franchiseId]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const loadAppointmentsForRange = useCallback(
    async (range: VisibleRange) => {
      if (!range.from_date || !range.to_date) return;

      const seq = ++loadSeqRef.current;
      setLoading(true);

      try {
        const rows = await fetchAllAppointmentsMatching(
          {
            from_date: range.from_date,
            to_date: range.to_date,
            franchise_id: franchiseId,
            keyword: debouncedKeyword || undefined,
          },
          100,
          { skipLoader: true }
        );

        if (seq !== loadSeqRef.current) return;
        setEvents(rows ? appointmentsToCalendarEvents(rows) : []);
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [franchiseId, debouncedKeyword]
  );

  const reloadAppointments = useCallback(async () => {
    await loadAppointmentsForRange(visibleRangeRef.current);
  }, [loadAppointmentsForRange]);

  useEffect(() => {
    void loadAppointmentsForRange(visibleRangeRef.current);
  }, [loadAppointmentsForRange]);

  const getMainCalendarScroller = () => {
    const scrollers = Array.from(
      calendarWrapperRef.current?.querySelectorAll(".fc-scroller") || []
    ) as HTMLElement[];
    return (
      scrollers.find((item) => item.scrollHeight > item.clientHeight) || null
    );
  };

  const preserveScrollPosition = () => {
    const scroller = getMainCalendarScroller();
    if (scroller) scrollTopRef.current = scroller.scrollTop;
    const api = calendarRef.current?.getApi?.();
    if (api) focusedDateRef.current = api.getDate();
  };

  useLayoutEffect(() => {
    if (scrollTopRef.current === null) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const api = calendarRef.current?.getApi?.();
        if (api && focusedDateRef.current) {
          api.gotoDate(focusedDateRef.current);
        }
        const scroller = getMainCalendarScroller();
        if (scroller && scrollTopRef.current !== null) {
          scroller.scrollTop = scrollTopRef.current;
        }
        scrollTopRef.current = null;
        focusedDateRef.current = null;
      });
    });
  }, [events]);

  const resetForm = () => {
    setEditingEventId(null);
    setEventTitle("");
    setOrderMongoId("");
    setOrderDisplayId("");
    setPartner("");
    setServiceName("");
    setServiceDate("");
    setPinnedServiceDate(null);
    setFromTime("");
    setToTime("");
    setErrors({ orderId: "", serviceDate: "", fromTime: "", toTime: "" });
    setValue("calendar_modal_order_id", "", { shouldValidate: false });
    setValue("calendar_modal_title", "", { shouldValidate: false });
    setValue("calendar_modal_service_date", "", { shouldValidate: false });
    setValue("calendar_modal_start_time", "", { shouldValidate: false });
    setValue("calendar_modal_end_time", "", { shouldValidate: false });
  };

  const openCreateModal = (pinDateYmd?: string) => {
    resetForm();
    if (pinDateYmd) {
      setServiceDate(pinDateYmd);
      setPinnedServiceDate(pinDateYmd);
      setValue("calendar_modal_service_date", pinDateYmd, {
        shouldValidate: false,
      });
    }
    setShowFormModal(true);
  };

  const handleDateClick = (info: { date: Date; view: { type: string } }) => {
    const isTimeGrid =
      info.view.type === "timeGridWeek" || info.view.type === "timeGridDay";

    if (isTimeGrid) {
      openCreateModal();
      return;
    }

    openCreateModal(dateToLocalYmd(info.date));
  };

  const openScheduleModal = () => {
    openCreateModal();
  };

  const applyOrderDetails = (selectedLabel: string) => {
    const selected = orders.find((item) => item.label === selectedLabel);
    if (!selected) return;

    setOrderDisplayId(selected.label);
    setOrderMongoId(selected.mongoId);
  };

  const populateFormFromAppointment = (row: AppointmentModel) => {
    setEditingEventId(row._id);
    setPinnedServiceDate(null);
    setEventTitle(row.title);
    setOrderMongoId(row.order_mongo_id || row.order_id);
    setOrderDisplayId(row.order_unique_id || row.order_id);
    setPartner(row.partner_name);
    setServiceName(row.service_name);
    setServiceDate(row.service_date.split("T")[0]);
    const startHm = parseWallClockTime(row.start_time);
    const endHm = parseWallClockTime(row.end_time);
    setFromTime(startHm);
    setToTime(endHm);
    setValue("calendar_modal_order_id", row.order_unique_id || row.order_id, {
      shouldValidate: false,
    });
    setValue("calendar_modal_title", row.title, { shouldValidate: false });
    setValue("calendar_modal_service_date", row.service_date.split("T")[0], {
      shouldValidate: false,
    });
    setValue("calendar_modal_start_time", startHm, { shouldValidate: false });
    setValue("calendar_modal_end_time", endHm, { shouldValidate: false });
    setErrors({ orderId: "", serviceDate: "", fromTime: "", toTime: "" });
  };

  const handleEditEvent = async (eventId: string) => {
    const cached = events.find((e) => e.id === eventId);
    if (cached?.extendedProps) {
      populateFormFromAppointment({
        _id: String(eventId),
        unique_id: cached.extendedProps.uniqueId ?? null,
        title: String(cached.title ?? ""),
        order_id: String(cached.extendedProps.orderMongoId ?? ""),
        order_mongo_id: String(cached.extendedProps.orderMongoId ?? ""),
        order_unique_id: String(cached.extendedProps.orderId ?? ""),
        partner_name: String(cached.extendedProps.partner ?? ""),
        service_name: String(cached.extendedProps.serviceName ?? ""),
        service_date: String(cached.extendedProps.serviceDate ?? ""),
        start_time: String(cached.extendedProps.startTime ?? ""),
        end_time: String(cached.extendedProps.endTime ?? ""),
        status: "scheduled",
        source: cached.extendedProps.source ?? null,
      });
      setShowViewModal(false);
      setShowFormModal(true);
      return;
    }

    const { response, appointment } = await fetchAppointmentById(eventId);
    if (!response || !appointment) return;
    populateFormFromAppointment(appointment);
    setShowViewModal(false);
    setShowFormModal(true);
  };

  const validateForm = () => {
    const nextErrors = {
      orderId: editingEventId || orderMongoId ? "" : "Order ID is required",
      serviceDate: serviceDate ? "" : "Service date is required",
      fromTime: "",
      toTime: "",
    };

    if (fromTime && toTime && fromTime >= toTime) {
      nextErrors.toTime = "End time must be after start time";
    }

    setErrors(nextErrors);
    return !(
      nextErrors.orderId ||
      nextErrors.serviceDate ||
      nextErrors.fromTime ||
      nextErrors.toTime
    );
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    preserveScrollPosition();

    let ok = false;

    if (editingEventId) {
      const { response } = await updateAppointment(editingEventId, {
        title: eventTitle.trim() || undefined,
        service_date: serviceDate,
        start_time: fromTime || undefined,
        end_time: toTime || undefined,
      });
      ok = response;
    } else {
      const { response } = await createAppointment({
        order_id: orderMongoId || orderDisplayId,
        service_date: serviceDate,
        title: eventTitle.trim() || undefined,
        start_time: fromTime || undefined,
        end_time: toTime || undefined,
      });
      ok = response;
    }

    setSaving(false);
    if (!ok) return;

    setShowFormModal(false);
    resetForm();
    await reloadAppointments();
  };

  const openEventViewModal = useCallback((event: EventInput) => {
    const mapped = mapEventToView(event);
    if (!mapped) return;
    setViewAppointment(mapped);
    setShowViewModal(true);
  }, []);

  const handleEventClick = (info: EventClickArg) => {
    info.jsEvent.preventDefault();
    openEventViewModal({
      id: info.event.id,
      title: info.event.title,
      extendedProps: info.event.extendedProps,
    });
  };

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      const range = visibleRangeFromDatesSet(arg);
      visibleRangeRef.current = range;
      void loadAppointmentsForRange(range);
    },
    [loadAppointmentsForRange]
  );

  const clearFiltersDisabled =
    !searchKeyword.trim() && !searchDraft.trim();

  const clearCalendarFilters = () => {
    setSearchKeyword("");
    setSearchDraft("");
    setSearchClearVersion((v) => v + 1);
    setUtilitySearchKey((k) => k + 1);
  };

  const buildEventTooltip = (event: {
    title: string;
    startStr?: string;
    endStr?: string;
    extendedProps?: Record<string, unknown>;
  }) => {
    const props = event.extendedProps ?? {};
    const startDate = String(props.serviceDate ?? "").split("T")[0];
    const startTime = String(props.startTime ?? "").slice(0, 5);
    const endTime = String(props.endTime ?? "").slice(0, 5);

    return [
      `Title: ${event.title || "-"}`,
      // `Appointment: ${props.uniqueId || "-"}`,
      `Order ID: ${props.orderId || "-"}`,
      `Partner: ${props.partner || "-"}`,
      `Service: ${props.serviceName || "-"}`,
      `Date: ${startDate || "-"}`,
      `Time: ${startTime || "-"} – ${endTime || "-"}`,
      props.source ? `Source: ${props.source}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const orderSelectOptions = useMemo(
    () =>
      orders.map((item) => ({
        value: item.label,
        label: item.label,
      })),
    [orders]
  );

  return (
    <div ref={calendarWrapperRef} className="calendar-page-root">
      <div className="mb-3 d-flex flex-wrap align-items-start justify-content-between gap-2">
        <div className="flex-grow-1" style={{ minWidth: "16rem" }}>
          <CustomUtilityBox
            key={`calendar-utility-${utilitySearchKey}`}
            searchHint="Search by Order ID or Partner"
            hideMoreIcon
            toolsInlineRow
            afterSearchSlot={
              <Button
                variant="outline-secondary"
                size="sm"
                className="custom-btn-secondary partner-payout-clear-btn px-3"
                type="button"
                disabled={clearFiltersDisabled}
                onClick={clearCalendarFilters}
              >
                Clear
              </Button>
            }
            hideUtilityActions
            onSearch={(value) => {
              setSearchKeyword(value);
              setSearchDraft(value);
            }}
            onSearchInputChange={setSearchDraft}
            syncKeyword={searchKeyword}
            searchClearVersion={searchClearVersion}
          />
        </div>
     
      </div>

      <div className="calendar-board position-relative">
        {loading && (
          <div className="calendar-loading-overlay">
            <Spinner animation="border" size="sm" role="status" />
            <span className="ms-2">Loading schedules…</span>
          </div>
        )}

        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          selectable
          scrollTimeReset={false}
          nowIndicator
          datesSet={handleDatesSet}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          events={events}
          eventDidMount={(info) => {
            info.el.setAttribute("title", buildEventTooltip(info.event));
            info.el.style.cursor = "pointer";
          }}
          eventContent={(eventInfo) => {
            const isTimeGrid =
              eventInfo.view.type === "timeGridWeek" ||
              eventInfo.view.type === "timeGridDay";

            if (isTimeGrid) {
              return (
                <div className="calendar-event-content calendar-event-content--timegrid w-100 h-100">
                  <div className="calendar-event-title calendar-event-title--timegrid">
                    {eventInfo.event.title}
                  </div>
                </div>
              );
            }

            const startTime = String(
              eventInfo.event.extendedProps.startTime ?? ""
            );
            const displayTitle = String(eventInfo.event.title || "").trim();

            return (
              <div className="calendar-event-content calendar-event-content--month w-100">
                <span className="calendar-event-month-dot" aria-hidden />
                {startTime ? (
                  <span className="calendar-event-month-time">
                    {formatTime12h(startTime)}
                  </span>
                ) : null}
                <span className="calendar-event-month-title text-truncate">
                  {displayTitle}
                </span>
              </div>
            );
          }}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          height={680}
          scrollTime="08:00:00"
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          slotDuration="01:00:00"
          views={{
            dayGridMonth: {
              fixedWeekCount: true,
              expandRows: true,
              dayMaxEvents: 1,
              moreLinkText: (num) => `+${num} Event${num === 1 ? "" : "s"}`,
              moreLinkClick: "popover",
              dayPopoverFormat: {
                weekday: "long",
                month: "long",
                day: "numeric",
              },
            },
            timeGridWeek: {
              expandRows: false,
              eventMinHeight: 28,
              slotEventOverlap: false,
              eventMaxStack: 4,
            },
            timeGridDay: {
              expandRows: false,
              eventMinHeight: 28,
              slotEventOverlap: false,
              eventMaxStack: 4,
            },
          }}
        />
      </div>

      {/* View appointment */}
      <Modal
        show={showViewModal}
        onHide={() => {
          setShowViewModal(false);
          setViewAppointment(null);
        }}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Schedule details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {viewAppointment && (
            <div className="calendar-view-details">
              <div className="calendar-view-row">
                <span className="calendar-view-label">Title</span>
                <span>{viewAppointment.title || "—"}</span>
              </div>
              {/* <div className="calendar-view-row">
                <span className="calendar-view-label">Appointment ID</span>
                <span>{viewAppointment.uniqueId || viewAppointment.id}</span>
              </div> */}
              <div className="calendar-view-row">
                <span className="calendar-view-label">Order ID</span>
                <span>{viewAppointment.orderId || "—"}</span>
              </div>
              <div className="calendar-view-row">
                <span className="calendar-view-label">Partner</span>
                <span>{viewAppointment.partner || "—"}</span>
              </div>
              <div className="calendar-view-row">
                <span className="calendar-view-label">Service</span>
                <span>{viewAppointment.serviceName || "—"}</span>
              </div>
              <div className="calendar-view-row">
                <span className="calendar-view-label">Date</span>
                <span>{viewAppointment.serviceDate || "—"}</span>
              </div>
              <div className="calendar-view-row">
                <span className="calendar-view-label">Time</span>
                <span>
                  {(viewAppointment.startTime || "—") +
                    (viewAppointment.endTime
                      ? ` – ${viewAppointment.endTime}`
                      : "")}
                </span>
              </div>
              {viewAppointment.source && (
                <div className="calendar-view-row">
                  <span className="calendar-view-label">Source</span>
                  <span className="text-capitalize">
                    {viewAppointment.source}
                  </span>
                </div>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="d-flex flex-wrap gap-2 justify-content-between">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => {
              if (!viewAppointment?.orderMongoId) return;
              showOrderInfoDialog(viewAppointment.orderMongoId, () => {
                void reloadAppointments();
              });
            }}
            disabled={!viewAppointment?.orderMongoId}
          >
            View order
          </Button>
          <div className="d-flex gap-2">
            <Button
              className="btn-danger"
              size="sm"
              onClick={() =>
                viewAppointment && handleEditEvent(viewAppointment.id)
              }
            >
              Edit
            </Button>
          </div>
        </Modal.Footer>
      </Modal>

      {/* Create / Edit */}
      <Modal
        show={showFormModal}
        onHide={() => {
          setShowFormModal(false);
          resetForm();
        }}
        size="lg"
        centered
        enforceFocus={false}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {editingEventId ? "Edit schedule" : "Schedule appointment"}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <div className="row g-2">
            <div className="col-md-12">
              <CustomFormInput
                label="Title"
                controlId="calendar_modal_title"
                placeholder={
                  editingEventId
                    ? "Appointment title"
                    : "Optional — leave blank to use service + order"
                }
                register={register}
                asCol={false}
                value={eventTitle}
                onChange={(value) => setEventTitle(value)}
              />
            </div>
          </div>

          <div className="row g-2">
            <div className="col-md-12">
              <Form.Label className="fw-medium mb-1">
                Order ID <span className="text-danger">*</span>
              </Form.Label>
              <CustomFormSelect
                label=""
                controlId="calendar_modal_order_id"
                options={orderSelectOptions}
                register={register}
                fieldName="calendar_modal_order_id"
                asCol={false}
                defaultValue={orderDisplayId}
                setValue={setValue}
                isDisabled={Boolean(editingEventId)}
                onChange={(e) => {
                  const value = e.target.value;
                  setOrderDisplayId(value);
                  if (errors.orderId) {
                    setErrors((prev) => ({ ...prev, orderId: "" }));
                  }
                  void applyOrderDetails(value);
                }}
                selectWidth="100%"
                placeholder="Search or select order"
                menuPortal
              />
              {errors.orderId && (
                <Form.Text className="text-danger d-block">
                  {errors.orderId}
                </Form.Text>
              )}
            </div>
          </div>

          {editingEventId ? (
            <div className="row g-2">
              <div className="col-md-6">
                <CustomFormInput
                  label="Partner"
                  controlId="calendar_modal_partner"
                  placeholder=""
                  register={register}
                  asCol={false}
                  value={partner}
                  isEditable={false}
                  inputClassName="custom-form-input--read-only"
                  inputStyle={{ borderColor: "var(--txtfld-border)" }}
                  onChange={() => undefined}
                />
              </div>
              <div className="col-md-6">
                <CustomFormInput
                  label="Service name"
                  controlId="calendar_modal_service_name"
                  placeholder=""
                  register={register}
                  asCol={false}
                  value={serviceName}
                  isEditable={false}
                  inputClassName="custom-form-input--read-only"
                  inputStyle={{ borderColor: "var(--txtfld-border)" }}
                  onChange={() => undefined}
                />
              </div>
            </div>
          ) : null}

          <div className="row g-2">
            <div className="col-md-12">
              {pinnedServiceDate ? (
                <Form.Group
                  controlId="calendar_modal_service_date"
                  className="mb-0 w-100"
                >
                  <Form.Label className="fw-medium mb-1">Service date</Form.Label>
                  <Form.Control
                    readOnly
                    value={formatYmdAsDdMmYyyy(serviceDate)}
                    className="custom-form-input custom-form-input--read-only"
                    style={{
                      borderColor: "var(--txtfld-border)",
                      boxShadow: "none",
                    }}
                  />
                </Form.Group>
              ) : (
                <CustomDatePicker
                  label="Service date"
                  controlId="calendar_modal_service_date"
                  selectedDate={serviceDate || null}
                  onChange={(date) => {
                    const value = date ? dateToLocalYmd(date) : "";
                    setServiceDate(value);
                    if (errors.serviceDate) {
                      setErrors((prev) => ({ ...prev, serviceDate: "" }));
                    }
                  }}
                  placeholderText="Service date"
                  register={register}
                  setValue={setValue}
                  asCol={false}
                  groupClassName="mb-0 w-100 fw-medium"
                  error={errors.serviceDate}
                />
              )}
            </div>
          </div>

          <div className="row g-2">
            <div className="col-md-6">
              <CustomFormInput
                label="Start time"
                controlId="calendar_modal_start_time"
                placeholder="09:00"
                register={register}
                asCol={false}
                inputType="time"
                value={fromTime}
                onChange={(value) => {
                  setFromTime(value);
                  if (errors.toTime) {
                    setErrors((prev) => ({ ...prev, toTime: "" }));
                  }
                }}
              />
              {errors.fromTime && (
                <Form.Text className="text-danger">{errors.fromTime}</Form.Text>
              )}
            </div>
            <div className="col-md-6">
              <CustomFormInput
                label="End time"
                controlId="calendar_modal_end_time"
                placeholder="11:00"
                register={register}
                asCol={false}
                inputType="time"
                value={toTime}
                onChange={(value) => {
                  setToTime(value);
                  if (errors.toTime) {
                    setErrors((prev) => ({ ...prev, toTime: "" }));
                  }
                }}
              />
              {errors.toTime && (
                <Form.Text className="text-danger">{errors.toTime}</Form.Text>
              )}
            </div>
          </div>
        </Modal.Body>

        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => {
              setShowFormModal(false);
              resetForm();
            }}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button className="btn-danger" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Saving…
              </>
            ) : editingEventId ? (
              "Update"
            ) : (
              "Save"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <button
        type="button"
        style={{ display: "none" }}
        onClick={openScheduleModal}
        id="openScheduleModalBtn"
        aria-hidden
      />
    </div>
  );
};

export default MyCalendar;
