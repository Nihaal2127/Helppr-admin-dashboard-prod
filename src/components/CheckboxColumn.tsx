import { FinancialModel } from "../lib/models/FinancialModel";

const CheckboxColumn = (
  data: FinancialModel[],
  selectedOrders: string[],
  setSelectedOrderIds: React.Dispatch<React.SetStateAction<string[]>>
) => {
  const selectAll = selectedOrders.length === data.length && data.length > 0;

  const handleSelectAll = () => {
    const ids = selectAll
      ? []
      : Array.from(new Set(data.map((item) => item._id)));
    setSelectedOrderIds(ids);
  };

  const handleSelectItem = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      let updated: string[];
      if (prev.includes(orderId)) {
        updated = prev.filter((id) => id !== orderId);
      } else {
        updated = Array.from(new Set([...prev, orderId]));
      }
      return updated;
    });
  };

  return {
    Header: () => (
      <input
        type="checkbox"
        checked={selectAll}
        onChange={() => {
          handleSelectAll();
        }}
        style={{
          width: "16px",
          height: "16px",
          cursor: "pointer",
          accentColor: "var(--bg-color)",
        }}
      />
    ),
    accessor: "check",
    Cell: ({ row }: { row: any }) => (
      <input
        type="checkbox"
        checked={selectedOrders.includes(row.original._id)}
        onChange={() => handleSelectItem(row.original._id)}
        style={{
          width: "16px",
          height: "16px",
          cursor: "pointer",
          accentColor: "var(--primary-color)",
        }}
      />
    ),
  };
};

export default CheckboxColumn;
