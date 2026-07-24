import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import CustomHeader from "../../components/CustomHeader";
import SubscriptionPlans from "./subscriptionPlans/subscriptionPlans";
import PortfolioManagement from "./portfolioManagement/PortfolioManagement";
import PostManagement from "./postManagement/PostManagement";

const PartnerManagement = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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

  useEffect(() => {
    const section = String(searchParams.get("section") ?? "")
      .trim()
      .toLowerCase();
    if (!section) return;

    if (section === "partners") {
      navigate("/user-management", {
        replace: true,
        state: { initialTab: "partners" },
      });
      return;
    }

    if (
      section === "subscription" ||
      section === "portfolio" ||
      section === "post"
    ) {
      setSelectedPage(section);
      const next = new URLSearchParams(searchParams);
      next.delete("section");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, navigate]);

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
