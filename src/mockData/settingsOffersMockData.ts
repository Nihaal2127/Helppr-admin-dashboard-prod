import type { OfferModel } from "../lib/models/SettingsModel";

export const offersMockSeed: Array<Omit<OfferModel, "id" | "createdAt">> = [
  {
    offerId: "OFF-001",
    offerName: "New User 20%",
    offerType: "percentage",
    totalOfferValue: 20,
    adminContribution: 12,
    partnerContribution: 8,
    applicableOn: "orders",
    startDate: "2026-04-01T00:00:00.000Z",
    endDate: "2026-04-30T23:59:59.999Z",
    status: "active",
  },
  {
    offerId: "OFF-002",
    offerName: "Festival Flat 500",
    offerType: "fixed",
    totalOfferValue: 500,
    adminContribution: 300,
    partnerContribution: 200,
    applicableOn: "quotes",
    startDate: "2026-03-15T00:00:00.000Z",
    endDate: "2026-04-15T23:59:59.999Z",
    status: "inactive",
  },
];
