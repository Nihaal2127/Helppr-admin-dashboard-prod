const PrivacyPolicy = () => {
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
          <h1 style={{ color: "var(--bg-color)", margin: 0 }}>Helppr</h1>
        </div>

        <h1 style={{ color: "var(--bg-color)", marginTop: "20px" }}>
          Privacy Policy
        </h1>
      </div>
      <section
        style={{
          padding: "30px 20px",
          color: "var(--content-txt-color)",
          lineHeight: "1.6",
        }}
      >
        <p>
          Helppr, owned by HELPPR (registered at Unit 601, 6th Floor, Manjeera
          Majestic Commercial, KPHB, Hyderabad-500072), acts as the data
          fiduciary (controller) for your personal data under the Digital
          Personal Data Protection Act, 2023 (DPDP Act). This Privacy Policy
          explains how we collect, process, store, and protect your personal
          data when you use the Helppr website, mobile application, or services
          (collectively, the “Platform”). By using the Platform, you provide
          explicit and verifiable consent to this Policy, in compliance with
          Indian laws. Please read it carefully.
        </p>

        <h2>1. Personal Information We Collect</h2>

        <p>
          We collect the following personal data to provide, improve, and
          personalize our services:
        </p>
        <p>
          <strong>Device Information:</strong> Automatically collected when you
          access the Platform, including IP address, web browser type, device
          type, time zone, cookies, and usage data (e.g., pages viewed, search
          terms, and interactions). This information helps us enhance user
          experience, detect abuse, and generate anonymized analytics.
        </p>
        <p>
          <strong>User-Provided Information : </strong>When you register, book
          services, or interact with the Platform, we may collect:
          <ul>
            <li>Name, email, phone number, address, and city of residence.</li>
            <li>
              Payment information (processed via RBI-authorized gateways;
              sensitive data like CVV is not stored).
            </li>
            <li>
              {" "}
              Optional details (e.g., organization, preferences) for enhanced
              services or marketing.
            </li>
            <li>Feedback, reviews, or communications with us or Helpers.</li>
          </ul>
        </p>
        <p>
          <strong>Consent for Collection : </strong>We collect only data
          necessary for specified purposes, with explicit consent obtained via
          unchecked consent boxes at registration or booking, as per DPDP Rules,
          2025, and CCPA guidelines on dark patterns. You may choose not to
          provide certain data, which may limit access to some features (e.g.,
          bookings, newsletters).
        </p>

        <h2>2. Why We Process Your Data</h2>

        <p>
          We process your personal data for the following lawful purposes under
          the DPDP Act, 2023:
        </p>
        <p>
          <strong>Platform Improvement : </strong>To analyze usage patterns,
          optimize functionality, and enhance user experience using anonymized
          data.
        </p>
        <p>
          <strong>Marketing and Personalization : </strong>To send promotional
          offers, newsletters, or tailored recommendations, with your explicit
          consent (opt-out available).
        </p>
        <p>
          <strong>Security and Fraud Prevention: </strong>To detect and prevent
          abuse, fraud, or unauthorized access.
        </p>
        <p>
          <strong>Legal Compliance: </strong>To comply with Indian laws, such as
          tax obligations or regulatory requests.
        </p>
        <p>
          <strong>Legitimate Business Interests: </strong>To conduct analytics,
          improve services, and develop new features, ensuring minimal data
          usage and anonymization where possible.
        </p>

        <h2>3. How We Use and Share Your Data</h2>
        <p>
          Internal Use: Data is used to provide services, process payments,
          communicate with you, and improve the Platform.
        </p>
        <p>
          <strong>Sharing with Third Parties:</strong>
        </p>
        <ul>
          <li>
            <p>
              <strong>Service Providers:</strong> We share necessary data with
              Helpers to fulfill bookings (e.g., name, address).
            </p>
          </li>
          <li>
            <p>
              <strong>Payment Processors:</strong> RBI-authorized gateways
              securely process payments, with data stored in India as per RBI
              guidelines.
            </p>
          </li>
          <li>
            <p>
              <strong>Analytics and Marketing Partners:</strong> Anonymized or
              consented data may be shared for analytics or targeted
              advertising.
            </p>
          </li>
          <li>
            <p>
              <strong>Cross-Border Transfers:</strong> Data may be transferred
              to servers outside India (e.g., for cloud storage) only to
              jurisdictions approved under DPDP Rules, 2025, with your consent
              and equivalent data protection standards.
            </p>
          </li>
        </ul>

        <p>
          <strong>Consent and Control:</strong> You may withdraw consent for
          non-essential data processing (e.g., marketing) via settings or by
          emailing info@helppr.in. Withdrawal does not affect lawful processing
          already completed.
        </p>

        <h2>4. Data Retention</h2>
        <p>
          We retain personal data for up to 3 years after your last interaction,
          as required for large digital platforms under DPDP Rules, 2025, or
          longer if mandated by law (e.g., tax records under GST laws).
        </p>
        <p>Anonymized data may be retained indefinitely for analytics.</p>
        <p>
          You may request deletion of non-mandatory data, subject to legal
          obligations, via grievance@helppr.in.
        </p>

        <h2>5. Your Rights</h2>
        <p>
          Under the DPDP Act, 2023, and CPA, 2019, you have the following
          rights:
        </p>
        <p>
          <strong>Access:</strong> Request details of your data being processed.
        </p>
        <p>
          <strong>Correction:</strong> Request correction of inaccurate data.
        </p>
        <p>
          <strong>Deletion:</strong> Request deletion of non-essential data,
          subject to retention obligations.
        </p>
        <p>
          <strong>Portability:</strong> Request a copy of your data in a
          portable format.
        </p>
        <p>
          <strong>Withdraw Consent:</strong> Opt out of non-essential processing
          (e.g., marketing).
        </p>
        <p>
          <strong>Grievance Redressal:</strong> Escalate concerns to our
          Grievance Officer or the Data Protection Board of India.
        </p>
        <p>
          To exercise these rights, contact our Data Protection Officer at
          dpo@helppr.in.
        </p>

        <h2>6. Links to Other Websites</h2>
        <p>
          Our Platform may contain links to third-party websites not owned or
          controlled by Helppr. We are not responsible for their privacy
          practices. Please review their policies before sharing data.
        </p>

        <h2>7. Information Security</h2>
        <p>
          We implement reasonable administrative, technical, and physical
          safeguards (e.g., encryption, access controls) to protect your data,
          in compliance with IT Rules, 2021, and DPDP Act requirements.
        </p>
        <p>
          All payment data is processed via RBI-authorized gateways, with
          sensitive data stored in India.
        </p>
        <p>
          While we strive to secure your data, no internet transmission is fully
          secure. You acknowledge this risk when using the Platform.
        </p>

        <h2>8. Legal Disclosure</h2>
        <p>We may disclose your data if required by Indian law, including:</p>
        <p>
          To comply with court orders, subpoenas, or regulatory requests (e.g.,
          under the IT Act, 2000).
        </p>
        <p>
          To protect Helppr’s rights, safety, or property, or those of users or
          Helpers.
        </p>
        <p>
          To investigate fraud or respond to government inquiries, with minimal
          disclosure.
        </p>

        <h2>9. Grievance Redressal</h2>
        <p>
          <strong>Grievance Officer:</strong> [Name/Designation], contactable at
          grievance@helppr.in or +91 6301981170.
        </p>
        <p>
          <strong>Data Protection Officer:</strong> [Name/Designation],
          contactable at dpo@helppr.in for data-related concerns.
        </p>
        <p>
          Grievances will be acknowledged within 24 hours and resolved within 15
          days, as per CPA and DPDP Rules. You can escalate unresolved issues to
          the Central Consumer Protection Authority or Data Protection Board of
          India.
        </p>

        <h2>10. Changes to Privacy Policy</h2>
        <p>
          We may update this Policy with at least 15 days’ notice via the
          Platform or email, as per CPA transparency requirements.
        </p>
        <p>
          Continued use after changes constitutes consent. If you disagree,
          please stop using the Platform.
        </p>

        <h2>11. Contact Information</h2>
        <p>
          For questions or concerns about this Policy or your data, please
          contact us:
        </p>
        <p>
          <strong>Email:</strong>{" "}
          <a href="mailto:info@helppr.in">info@helppr.in</a>
        </p>
        <p>
          <strong>Phone:</strong> <a href="tel:+916301981170">+91 6301981170</a>
        </p>
        <p>
          <strong>Address:</strong> Unit 601, 6th Floor, Manjeera Majestic
          Commercial, KPHB, Hyderabad-500072
        </p>
        <p>
          <strong>Website:</strong>{" "}
          <a href="https://helppr.in">https://helppr.in</a>
        </p>
      </section>
    </div>
  );
};

export default PrivacyPolicy;
