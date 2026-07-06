import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import CustomHeader from "../../components/CustomHeader";
import { ROUTES } from "../../routes/Routes";

const Settings = () => {
  const { register, setValue } = useForm<any>();
  const navigate = useNavigate();
  const [settingList] = useState<string[]>([
    "Coupons",
    "Roles",
    "Expense\nCategory",
    "User Home\nCounts",
    "General \nSettings",
  ]);

  const handleOnClick = (title: string) => {
    if (title === "Coupons") {
      navigate(ROUTES.OFFERS_MANAGEMENT.path);
    } else if (title === "Roles") {
      navigate(ROUTES.ROLE.path);
    } else if (title === "Expense\nCategory") {
      navigate(ROUTES.EXPENSE_CATEGORY_MANAGEMENT.path);
    } else if (title === "User Home\nCounts") {
      navigate(ROUTES.USER_HOME_COUNTS.path);
    } else if (title === "General \nSettings") {
      navigate(ROUTES.GENERAL_SETTINGS.path);
    }
  };

  return (
    <>
      <div className="main-page-content">
        <CustomHeader
          title="Settings"
          register={register}
          setValue={setValue}
          hideFranchiseDropdown
        />

        <div className="custom-grid-box-div">
          {settingList.map((setting, index) => (
            <div
              className="custom-grid-box"
              key={index}
              onClick={() => handleOnClick(setting)}
            >
              {setting}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default Settings;
