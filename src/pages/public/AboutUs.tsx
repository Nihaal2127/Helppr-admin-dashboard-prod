import appLogo from "../../assets/icons/login_logo.svg";

const AboutUs = () => {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--bg-color)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          width: "100%",
          border: "none",
          borderRadius: "0",
          backgroundColor: "var(--theme-color)",
          textAlign: "center",
          padding: "20px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
          }}
        >
          <img src={appLogo} alt="logo" style={{ height: "40px" }} />
          <h1 style={{ color: "var(--bg-color)", margin: 0 }}>helper!</h1>
        </div>

        <h1 style={{ color: "var(--bg-color)", marginTop: "20px" }}>
          About Us
        </h1>
      </div>
      <section
        style={{
          padding: "30px 20px",
          color: "var(--theme-color)",
          lineHeight: "1.6",
        }}
      >
        <p>
          We are committed to protecting your privacy in accordance with the
          Australian Privacy Principles under the Privacy Act 1988 (Cth). This
          Privacy Policy outlines how we collect, use, disclose, and store your
          personal information when you visit our website, make a booking, or
          use our services.
        </p>

        <h2>1. What Personal Information We Collect</h2>
        <ul>
          <li>Full name</li>
          <li>Email address</li>
          <li>Phone number</li>
          <li>Billing and shipping address</li>
          <li>Vehicle make, model, and registration</li>
          <li>Payment details (via secure third-party providers)</li>
          <li>IP address and browser type (for website analytics)</li>
        </ul>

        <h2>2. How We Collect Personal Information</h2>
        <ul>
          <li>When you submit an enquiry via our website</li>
          <li>When you make a booking or purchase online or in-store</li>
          <li>When you contact us via phone, email, or social media</li>
          <li>Through cookies and website tracking tools (see Section 7)</li>
        </ul>

        <h2>3. Why We Collect Your Information</h2>
        <ul>
          <li>To provide our tyre products and vehicle services</li>
          <li>To confirm bookings and service appointments</li>
          <li>To process payments and issue receipts/invoices</li>
          <li>
            To send service reminders, promotions, and updates (with your
            consent)
          </li>
          <li>To comply with legal obligations</li>
        </ul>

        <h2>4. Disclosure of Personal Information</h2>
        <p>We do not sell your personal information. We may disclose it to:</p>
        <ul>
          <li>Our employees and service technicians</li>
          <li>Third-party providers</li>
          <li>Regulatory or law enforcement authorities</li>
        </ul>

        <h2>5. Data Storage and Security</h2>
        <p>We take reasonable steps to protect your personal information...</p>
        <ul>
          <li>Secure website encryption (SSL)</li>
          <li>Restricted employee access</li>
          <li>Regular data backups and security updates</li>
        </ul>

        <h2>6. Access and Correction</h2>
        <p>You have the right to access and correct your data...</p>

        <h2>7. Cookies and Analytics</h2>
        <p>
          Our website uses cookies and third-party tools such as Google
          Analytics...
        </p>

        <h2>8. Direct Marketing</h2>
        <p>
          We may send promotional materials or reminders if you have opted in...
        </p>

        <h2>9. Contact Us</h2>
        <p>
          For questions or complaints, contact: <br />
          <strong>SOS Tyres & Wheels</strong>
          <br />
          8/41 Lensworth St, Coopers Plains QLD 4108, Australia
          <br />
          Phone: <a href="tel:+61434380737">+61 434 380 737</a>
          <br />
          Email: <a href="mailto:info@sostyres.com.au">info@sostyres.com.au</a>
          <br />
          Website: <a href="https://sostyres.com.au">sostyres.com.au</a>
        </p>

        <h2>10. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time...</p>
      </section>
    </div>
  );
};

export default AboutUs;
