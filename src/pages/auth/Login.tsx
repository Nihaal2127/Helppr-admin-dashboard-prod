import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import loginBGLogo from "../../assets/icons/login_bg_logo.svg";
import helperLogo from "../../assets/images/helper-logo.png";
import { Card, Col, Button } from "react-bootstrap";
import { CustomFormInput } from "../../components/CustomFormInput";
import { ROUTES } from "../../routes/Routes";
import { login } from "../../services/adminService";
import {
  mapWebUserTypeToSessionRole,
  menuKeysFromUserAccess,
} from "../../services/userService";
import {
  getLocalStorage,
  setLocalStorage,
} from "../../lib/global/localStorageHelper";
import { showErrorAlert } from "../../lib/global/alertHelper";
import { AppConstant, UserRole } from "../../lib/global/AppConstant";
import type { UserModel } from "../../lib/models/UserModel";

type PersistedUserRole = (typeof UserRole)[keyof typeof UserRole];

const Login = () => {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const persistSession = (user: UserModel, role: PersistedUserRole) => {
    setLocalStorage(AppConstant.authToken, user?.auth_token);
    setLocalStorage(AppConstant.isAdmin, true);
    setLocalStorage(AppConstant.adminId, user?._id);
    setLocalStorage(AppConstant.createdById, user?._id);
    setLocalStorage(AppConstant.partnerId, (user as any)?.franchise_id ?? "");
    setLocalStorage(AppConstant.userRole, role);
    const menuKeys = menuKeysFromUserAccess(
      user as unknown as Record<string, unknown>
    );
    setLocalStorage(
      AppConstant.userAccessibleMenuKeys,
      JSON.stringify(menuKeys)
    );
    navigate(ROUTES.DASHBOARD.path, { replace: true });
  };

  const onSubmitEvent = async (data: { email?: string; password?: string }) => {
    const email = (data.email ?? "").trim();
    const password = (data.password ?? "").trim();
    if (!email || !password) return;

    const device_token = getLocalStorage(AppConstant.deviceToken);
    const { admin, response } = await login({ email, password, device_token });
    if (!response || !admin) {
      return;
    }
    const role = mapWebUserTypeToSessionRole(admin.type);
    if (!role) {
      showErrorAlert("This account type cannot access the admin dashboard.");
      return;
    }
    persistSession(admin, role);
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Col>
        <img src={loginBGLogo} className="img-fluid" alt="Background Logo" />
      </Col>

      <Col className="d-flex justify-content-end pe-5">
        <Card
          className="ms-auto"
          style={{
            width: "30vw",
            aspectRatio: "528 / 491",
            padding: "20px",
            borderRadius: "16px",
            backgroundColor: "var(--bg-color)",
            boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: "50px",
          }}
        >
          <Card.Body className="d-flex flex-column align-items-center justify-content-center w-100">
            <img src={helperLogo } alt="Logo" 
            style={{width: "90px",height: "90px",objectFit: "contain",marginBottom: "10px",}}
            
            />
            <h2 className="mb-4 title">HelpPR!</h2>
            <form
              noValidate
              name="login-form"
              id="login-form"
              className="w-100"
              onSubmit={handleSubmit(onSubmitEvent)}
            >
              <CustomFormInput
                label=""
                controlId="email"
                placeholder="Enter Email"
                register={register}
                error={errors.email}
                asCol={false}
                validation={{ required: "Email is required" }}
              />
              <CustomFormInput
                label=""
                inputType="password"
                controlId="password"
                placeholder="Enter Password"
                register={register}
                error={errors.password}
                asCol={false}
                validation={{ required: "Password is required" }}
              />
              <Button type="submit" className="custom-button">
                Login
              </Button>
            </form>
            <Link to={ROUTES.FORGOT_PASSWORD.path} className="custom-link">
              Forgot Password?
            </Link>
          </Card.Body>
        </Card>
      </Col>
    </div>
  );
};

export default Login;
