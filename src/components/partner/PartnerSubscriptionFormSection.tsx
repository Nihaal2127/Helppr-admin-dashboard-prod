import React from "react";
import { Row, Col } from "react-bootstrap";
import {
  UseFormRegister,
  UseFormSetValue,
  FieldError,
  RegisterOptions,
  UseFormRegisterReturn,
} from "react-hook-form";
import CustomFormSelect from "../CustomFormSelect";
import CustomDatePicker from "../CustomDatePicker";
import type { SubscriptionPlanOption } from "../../services/partnerManagementService";
import { addPlanDurationToYmd, dateToLocalYmd } from "../../helper/dateFormat";

export type PartnerSubscriptionRegisterFn = (
  name: string,
  options?: RegisterOptions
) => UseFormRegisterReturn;

export type PartnerSubscriptionSetValueFn = (
  name: string,
  value: unknown,
  options?: { shouldValidate?: boolean; shouldDirty?: boolean }
) => void;

export type PartnerSubscriptionFormSectionProps = {
  register: PartnerSubscriptionRegisterFn;
  setValue: PartnerSubscriptionSetValueFn;
  watch: (name: string) => unknown;
  errors: Record<string, FieldError | undefined>;
  planOptions: SubscriptionPlanOption[];
  subscriptionStartStr: string | null;
  subscriptionEndStr: string | null;
  toYmdString: (v: unknown) => string | null;
  /** Update Partner: single column, no bordered section heading. */
  layout?: "default" | "stacked";
  /** Add Partner: subscription plan and dates are required (asterisk / validation). */
  subscriptionDatesRequired?: boolean;
  /** Load catalog from `GET /subscription-plan/getAll` when the plan menu opens. */
  onPlanMenuOpen?: () => void;
};

const rhfRegister = (fn: PartnerSubscriptionRegisterFn): UseFormRegister<any> =>
  fn as UseFormRegister<any>;

const rhfSetValue = (fn: PartnerSubscriptionSetValueFn): UseFormSetValue<any> =>
  fn as UseFormSetValue<any>;

export function computedSubscriptionEndDate(
  plan: SubscriptionPlanOption | undefined,
  startYmd: string
): string {
  const start = String(startYmd ?? "").trim().slice(0, 10);
  const duration = Number(plan?.duration);
  if (!start || !Number.isFinite(duration) || duration < 0) return "";
  return addPlanDurationToYmd(start, duration, plan?.duration_type);
}

const PartnerSubscriptionFormSection: React.FC<
  PartnerSubscriptionFormSectionProps
> = ({
  register,
  setValue,
  watch,
  errors,
  planOptions,
  subscriptionStartStr,
  subscriptionEndStr,
  toYmdString,
  layout = "default",
  subscriptionDatesRequired = true,
  onPlanMenuOpen,
}) => {
  const watchedPlanId = String(watch("subscription_plan_id") ?? "").trim();

  const applyEndFromPlanAndStart = (planId: string, startYmd: string) => {
    const selectedPlan = planOptions.find((plan) => plan.value === planId);
    const end = computedSubscriptionEndDate(selectedPlan, startYmd);
    setValue("subscription_end_date", end, {
      shouldValidate: false,
      shouldDirty: true,
    });
  };

 const planSelect = (
  <CustomFormSelect
    label="Subscription Plan"
    controlId="subscription_plan_id"
    options={planOptions}
    register={rhfRegister(register)}
    fieldName="subscription_plan_id"
    error={errors.subscription_plan_id}
    asCol={false}
    defaultValue={watchedPlanId}
    setValue={rhfSetValue(setValue)}
    placeholder="Select subscription plan"
    menuPortal
    onMenuOpen={onPlanMenuOpen}
    requiredMessage={
      subscriptionDatesRequired
        ? "Please select a subscription plan"
        : undefined
    }
    onChange={(e) => {
      const value = String(
        (e.target as HTMLSelectElement).value ?? ""
      );

      const selectedPlan = planOptions.find(
        (plan) => plan.value === value
      );

      const planSlug = (selectedPlan?.label ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");

      setValue("subscription_plan", planSlug, {
        shouldValidate: true,
        shouldDirty: true,
      });
      applyEndFromPlanAndStart(
        value,
        toYmdString(subscriptionStartStr) ?? ""
      );
    }}
  />
);
  const startDatePicker = (
    <CustomDatePicker
      label="Subscription Start Date"
      controlId="subscription_start_date"
      selectedDate={toYmdString(subscriptionStartStr)}
      onChange={(date) => {
        const value = date ? dateToLocalYmd(date) : "";
        setValue("subscription_start_date", value, {
          shouldValidate: true,
          shouldDirty: true,
        });
        applyEndFromPlanAndStart(watchedPlanId, value);
      }}
      register={rhfRegister(register)}
      setValue={rhfSetValue(setValue)}
      asCol={false}
      groupClassName="mb-0 w-100 fw-medium"
      placeholderText="Start date"
      filterDate={() => true}
      required={subscriptionDatesRequired}
      validation={{
        required: subscriptionDatesRequired
          ? "Subscription start date is required"
          : false,
      }}
      error={errors.subscription_start_date as string | FieldError | undefined}
    />
  );

  const endDatePicker = (
    <CustomDatePicker
      label="Subscription End Date"
      controlId="subscription_end_date"
      selectedDate={toYmdString(subscriptionEndStr)}
      onChange={() => {}}
      register={rhfRegister(register)}
      setValue={rhfSetValue(setValue)}
      asCol={false}
      groupClassName="mb-0 w-100 fw-medium"
      placeholderText="End date"
      filterDate={() => true}
      readOnly
    />
  );

  if (layout === "stacked") {
    return (
      <div className="partner-subscription-form-stacked">
        <input type="hidden" {...register("partner_subscription_id")} />
        <input type="hidden" {...register("subscription_plan")} />
        {planSelect}
        {startDatePicker}
        {endDatePicker}
      </div>
    );
  }

  return (
    <section
      className="custom-other-details mt-2"
      style={{ padding: "10px" }}
    >
      <h3 className="mb-2">Subscription</h3>
      <input type="hidden" {...register("partner_subscription_id")} />
      <input type="hidden" {...register("subscription_plan")} />
      <Row className="g-3 mb-2">
        <Col xs={12}>
          {planSelect}
        </Col>
      </Row>
      <Row className="g-3 mb-2">
        <Col xs={12} md={6}>
          {startDatePicker}
        </Col>
        <Col xs={12} md={6}>
          {endDatePicker}
        </Col>
      </Row>
    </section>
  );
};

/** Bind react-hook-form methods without deep generic checks at the call site. */
export function partnerSubscriptionFormBind(form: {
  register: PartnerSubscriptionRegisterFn;
  setValue: PartnerSubscriptionSetValueFn;
  watch: (name: string) => unknown;
  errors: Record<string, FieldError | undefined>;
}): Pick<
  PartnerSubscriptionFormSectionProps,
  "register" | "setValue" | "watch" | "errors"
> {
  return form;
}

export default PartnerSubscriptionFormSection;
