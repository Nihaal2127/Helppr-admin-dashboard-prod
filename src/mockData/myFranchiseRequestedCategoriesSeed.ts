/** Franchise “requested category” rows (pending approval). */
export const myFranchiseRequestedCategoriesSeed = [
  {
    _id: "rc1",
    name: "Smart home bundles",
    service_ids: ["s1", "s2"],
    service_names: ["Deep Home Cleaning", "AC Service & Repair"],
    description:
      "Request to group smart-home related offerings under one category.",
    image_url: "",
    status: "pending" as const,
  },
];
