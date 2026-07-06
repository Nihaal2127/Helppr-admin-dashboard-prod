import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import CustomHeader from "../../components/CustomHeader";
import SubscriptionPlans from "./subscriptionPlans/subscriptionPlans";
import PortfolioManagement from "./portfolioManagement/PortfolioManagement";
import PostManagement from "./postManagement/PostManagement";

const PartnerManagement = () => {
  const navigate = useNavigate();
  const { register, setValue } = useForm<any>();

  const [selectedPage, setSelectedPage] = useState<string>("");

  const [cardList] = useState<
    { title: string; action: "subscription" | "portfolio" | "post" | "partners" }[]
  >([
    { title: "Subscription\nPlans", action: "subscription" },
    { title: "Portfolio\nManagement", action: "portfolio" },
    { title: "Post\nManagement", action: "post" },
    { title: "Partners", action: "partners" },
  ]);

  const handleOnClick = (action: (typeof cardList)[number]["action"]) => {
    if (action === "partners") {
      navigate("/user-management", { state: { initialTab: "partners" } });
      return;
    }
    if (action === "subscription") {
      setSelectedPage("subscription");
    } else if (action === "portfolio") {
      setSelectedPage("portfolio");
    } else if (action === "post") {
      setSelectedPage("post");
    }
  };

  if (selectedPage === "subscription") {
    return <SubscriptionPlans onBack={() => setSelectedPage("")} />;
  }

  if (selectedPage === "portfolio") {
    return <PortfolioManagement onBack={() => setSelectedPage("")} />;
  }

  if (selectedPage === "post") {
    return <PostManagement onBack={() => setSelectedPage("")} />;
  }
  return (
    <div className="main-page-content">
      <CustomHeader
        title="Partner Management"
        register={register}
        setValue={setValue}
        hideFranchiseDropdown
      />

      <div className="custom-grid-box-div">
        {cardList.map((card, index) => (
          <div
            className="custom-grid-box"
            key={index}
            onClick={() => handleOnClick(card.action)}
            style={{ cursor: "pointer", whiteSpace: "pre-line" }}
          >
            {card.title}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PartnerManagement;
