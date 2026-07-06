import { fetchFranchise } from "../../services/franchiseService";
import { fetchArea } from "../../services/areaService";
import { FranchiseModel } from "../models/FranchiseModels";
import { AreaModel } from "../models/AreaModel";
import {
  PARTNER_USER_TYPE,
} from "./reportFilterConstants";
import type { ReportOptionType } from "./reportFilterConstants";

export type { ReportOptionType } from "./reportFilterConstants";
export {
  reportAllOption,
  reportFilterLabelClass,
  reportMultiSelectChipsMaxHeight,
  reportToIsoCalendarDate,
  CUSTOMER_USER_TYPE,
  PARTNER_USER_TYPE,
} from "./reportFilterConstants";

export async function loadAllPartnerOptionsForDropdown(): Promise<
  ReportOptionType[]
> {
  const { fetchUser } = await import("../../services/userService");
  const pageSize = 250;
  const first = await fetchUser(false, PARTNER_USER_TYPE, 1, pageSize, {
    status: "true",
  });
  if (!first.response) return [];
  let all = [...first.users];
  for (let page = 2; page <= first.totalPages; page++) {
    const next = await fetchUser(false, PARTNER_USER_TYPE, page, pageSize, {
      status: "true",
    });
    if (next.response) {
      all = all.concat(next.users);
    }
  }
  const opts = all
    .map((u) => {
      const id = String((u as { _id?: string })._id ?? "").trim();
      if (!id) return null;
      const rawName = (u.name ?? "").trim();
      const email = (u.email ?? "").trim();
      const label = rawName || email || u.phone_number || id;
      return { value: id, label: String(label) };
    })
    .filter((x): x is ReportOptionType => x != null);
  opts.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
  return opts;
}

export async function loadAllFranchiseRows(): Promise<FranchiseModel[]> {
  const acc: FranchiseModel[] = [];
  const pageSize = 200;
  let page = 1;
  for (;;) {
    const res = await fetchFranchise(page, pageSize, { status: "true" });
    if (res?.response && res.franchises?.length) {
      acc.push(...res.franchises);
    }
    if (!res?.response || !res.totalPages || page >= res.totalPages) break;
    page += 1;
    if (page > 50) break;
  }
  return acc;
}

export async function loadAllAreaRows(): Promise<AreaModel[]> {
  const acc: AreaModel[] = [];
  const pageSize = 200;
  let page = 1;
  for (;;) {
    const res = await fetchArea(page, pageSize, {});
    if (res?.response && res.areas?.length) {
      acc.push(...res.areas);
    }
    if (!res?.response || !res.totalPages || page >= res.totalPages) break;
    page += 1;
    if (page > 100) break;
  }
  return acc;
}
