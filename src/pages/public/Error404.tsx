import { Card, Button } from "react-bootstrap";
import appLogo from "../../assets/icons/login_logo.svg";
import { ROUTES } from "../../routes/Routes";
import { getNavigate } from "../../helper/utility";

const Error404 = () => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <Card style={{ width: "40%" }}>
        <Card.Body className="p-4">
          <div className="text-center mt-4">
            <img src={appLogo} alt="logo" />
            <h1 className="mt-3 text-error">404</h1>
            <h3 className="mt-3 mb-2">Page Not Found</h3>
            <Button
              type="submit"
              className="custom-btn-primary mt-2"
              onClick={() => {
                getNavigate()?.(ROUTES.DASHBOARD.path);
              }}
            >
              Back to Home
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default Error404;
