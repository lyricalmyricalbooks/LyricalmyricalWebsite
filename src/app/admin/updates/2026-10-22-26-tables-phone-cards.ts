import type { AppUpdate } from "../appUpdates";

export default {
  id: "tables-phone-cards",
  date: "2026-10-22",
  title: "Customers, Gift cards and Discounts read as cards on a phone",
  summary:
    "On a phone, the Customers, Gift cards and Discounts lists now show each row as a small card with every figure under its name, instead of a wide table you have to slide sideways. Tapping a row still opens it. On a computer the lists look exactly as before.",
  links: [{ label: "Open Customers", tab: "customers" }],
} satisfies AppUpdate;
