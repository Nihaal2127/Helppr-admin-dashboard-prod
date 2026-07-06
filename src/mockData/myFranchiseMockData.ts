export const myFranchiseEmployeesSeed = [
  {
    _id: "e1",
    employee_id: "FE-1001",
    name: "Ananya Rao Rao",
    role: "Operations Lead",
    phone: "+91 9876500101",
    email: "ananya@franchise.local",
    area_name: "Madhapur",
    is_active: true,
    chat_enabled: true,
  },
  {
    _id: "e2",
    employee_id: "FE-1002",
    name: "Vikram Singh",
    role: "Field Supervisor",
    phone: "+91 9876500102",
    email: "vikram@franchise.local",
    area_name: "Kukatpally",
    is_active: true,
    chat_enabled: false,
  },
  {
    _id: "e3",
    employee_id: "FE-1003",
    name: "Meera Iyer",
    role: "Support",
    phone: "+91 9876500103",
    email: "meera@franchise.local",
    area_name: "Banjara Hills",
    is_active: false,
    chat_enabled: false,
  },
];

export const myFranchiseAreasSeed = [
  {
    _id: "a1",
    area_name: "Madhapur",
    city_name: "Hyderabad",
    state_name: "Telangana",
    pincodes: ["500081", "500082", "500084"],
    is_active: true,
  },
  {
    _id: "a2",
    area_name: "Kukatpally",
    city_name: "Hyderabad",
    state_name: "Telangana",
    pincode: "500072",
    is_active: true,
  },
  {
    _id: "a3",
    area_name: "Banjara Hills",
    city_name: "Hyderabad",
    state_name: "Telangana",
    pincode: "500034,500035",
    is_active: true,
  },
];

export const myFranchiseServicesSeed = [
  {
    _id: "s1",
    service_id: "SVC-201",
    name: "Deep Home Cleaning",
    category_name: "Cleaning",
    is_active: true,
  },
  {
    _id: "s2",
    service_id: "SVC-202",
    name: "AC Service & Repair",
    category_name: "Appliances",
    is_active: true,
  },
  {
    _id: "s3",
    service_id: "SVC-203",
    name: "Plumbing Visit",
    category_name: "Plumbing",
    is_active: false,
  },
];

export const myFranchiseCategoriesSeed = [
  { _id: "c1", category_id: "CAT-01", name: "Cleaning", is_active: true },
  { _id: "c2", category_id: "CAT-02", name: "Appliances", is_active: true },
  { _id: "c3", category_id: "CAT-03", name: "Electrical", is_active: false },
];
