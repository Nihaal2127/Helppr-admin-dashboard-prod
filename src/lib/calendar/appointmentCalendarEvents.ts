import type { EventInput } from "@fullcalendar/core";
import type { AppointmentModel } from "../../services/appointmentService";
import { buildAppointmentEventDateTimes } from "./appointmentScheduleTimes";

export function appointmentToCalendarEvent(
  appointment: AppointmentModel
): EventInput {
  const { start, end, startTime, endTime } = buildAppointmentEventDateTimes(
    appointment.service_date,
    appointment.start_time,
    appointment.end_time
  );

  const displayTitle =
    appointment.title?.trim() ||
    appointment.service_name?.trim() ||
    "Appointment";

  return {
    id: appointment._id,
    title: displayTitle,
    start,
    end,
    allDay: false,
    classNames: ["calendar-event--brand"],
    extendedProps: {
      uniqueId: appointment.unique_id,
      orderId: appointment.order_unique_id || appointment.order_id,
      orderMongoId: appointment.order_mongo_id || appointment.order_id,
      partner: appointment.partner_name,
      serviceName: appointment.service_name,
      serviceDate: appointment.service_date.split("T")[0],
      source: appointment.source,
      startTime,
      endTime,
      title: displayTitle,
    },
  };
}

export function appointmentsToCalendarEvents(
  appointments: AppointmentModel[]
): EventInput[] {
  return appointments.map(appointmentToCalendarEvent);
}
