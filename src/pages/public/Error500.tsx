import { useEffect } from "react";
import { Card, Button } from "react-bootstrap";
import appLogo from "../../assets/icons/login_logo.svg";
import { getNavigate } from "../../helper/utility";
import { ROUTES } from "../../routes/Routes";

const ServerError = () => {
  const navigate = getNavigate();
  useEffect(() => {
    const modals = document.querySelectorAll(".modal.show");
    modals.forEach((modal) => {
      (modal as HTMLElement).classList.remove("show");
      (modal as HTMLElement).style.display = "none";
      document.body.classList.remove("modal-open");
      const backdrop = document.querySelector(".modal-backdrop");
      if (backdrop) backdrop.remove();
    });
  }, []);

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
            <h1 className="mt-3 text-error">500</h1>
            <h3 className="mt-3 mb-2">Internal Server Error</h3>
            <Button
              type="submit"
              className="custom-btn-primary mt-2"
              onClick={() => {
                // Avoid navigate(-1): the previous screen often re-fetches and hits the same 500,
                // bouncing straight back here. Same escape hatch as Error404.
                navigate?.(ROUTES.DASHBOARD.path);
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

export default ServerError;
