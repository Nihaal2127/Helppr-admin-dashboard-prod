import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import loginBGLogo from "../../assets/icons/login_bg_logo.svg";
import helperLogo from "../../assets/images/helper-logo.png";
import { Card, Col, Button } from "react-bootstrap";
import { CustomFormInput } from "../../components/CustomFormInput";
import { forgotPassword } from "../../services/adminService";
import { ROUTES } from "../../routes/Routes";

const Login = () => {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const onSubmitEvent = async (data: any) => {
    const payload = {
      email: data.email,
      type: 1,
    };
    let response = await forgotPassword(payload);
    if (response) {
      navigate(ROUTES.LOGIN.path, { replace: true });
    }
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
            <img src={helperLogo} alt="Logo"
            style={{width: "90px",height: "90px",objectFit: "contain",marginBottom: "10px",}} />
            <h2 className="mb-4 title">HelpPR!</h2>
            <h5>Forgot Password</h5>
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
              <Button type="submit" className="custom-button">
                Submit
              </Button>
            </form>
          </Card.Body>
        </Card>
      </Col>
    </div>
  );
};

export default Login;
