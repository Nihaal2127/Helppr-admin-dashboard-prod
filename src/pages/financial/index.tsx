import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import CustomHeader from "../../components/CustomHeader";
import { ROUTES } from "../../routes/Routes";
import { franchiseHeaderFormDefaults } from "../../lib/franchise/headerFranchisePreference";

const Financials = () => {
  const navigate = useNavigate();
  const [tiles] = useState<{ title: string; route: string }[]>([
    { title: "Order\nPayments", route: ROUTES.ORDER_PAYMENTS.path },
    { title: "Partner\nPayout", route: ROUTES.PARTNER_PAYOUT.path },
    { title: "Refunds", route: ROUTES.FINANCIAL_REFUNDS.path },
  ]);

  const { register, setValue } = useForm({
    defaultValues: franchiseHeaderFormDefaults(),
  });

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Financials"
        register={register as any}
        setValue={setValue as any}
      />

      <div className="custom-grid-box-div">
        {tiles.map((tile) => (
          <div
            className="custom-grid-box"
            key={tile.route}
            role="button"
            tabIndex={0}
            onClick={() => navigate(tile.route)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(tile.route);
              }
            }}
          >
            {tile.title}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Financials;
