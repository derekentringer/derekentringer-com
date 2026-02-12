import { useMemo } from "react";
import { useDocumentHead } from "../utils/useDocumentHead.ts";
import styles from "./PrivacyPage.module.css";

const META = [
  { name: "description", content: "Privacy Policy for DerekEntringer.com" },
];

export function PrivacyPage() {
  const meta = useMemo(() => META, []);

  useDocumentHead({ title: "Privacy Policy | Derek Entringer", meta });

  return (
    <div className={styles.container}>
      <h1>Privacy Policy</h1>

      <p>
        This Privacy Policy governs the manner in which DerekEntringer.com
        collects, uses, maintains and discloses information collected from users
        (each, a &ldquo;User&rdquo;) of the DerekEntringer.com website
        (&ldquo;Site&rdquo;). This privacy policy applies to the Site and all
        products and services offered by DerekEntringer.com.
      </p>

      <h2>Personal identification information</h2>
      <p>
        We may collect personal identification information from Users in a
        variety of ways in connection with activities, services, features or
        resources we make available on our Site. Users may visit our Site
        anonymously. We will collect personal identification information from
        Users only if they voluntarily submit such information to us. Users can
        always refuse to supply personally identification information, except
        that it may prevent them from engaging in certain Site related
        activities.
      </p>

      <h2>Non-personal identification information</h2>
      <p>
        We may collect non-personal identification information about Users
        whenever they interact with our Site. Non-personal identification
        information may include the browser name, the type of computer and
        technical information about Users means of connection to our Site, such
        as the operating system and the Internet service providers utilized and
        other similar information.
      </p>

      <h2>Web browser cookies</h2>
      <p>
        Our Site may use &ldquo;cookies&rdquo; to enhance User experience.
        User&rsquo;s web browser places cookies on their hard drive for
        record-keeping purposes and sometimes to track information about them.
        User may choose to set their web browser to refuse cookies, or to alert
        you when cookies are being sent. If they do so, note that some parts of
        the Site may not function properly.
      </p>

      <h2>How we use collected information</h2>
      <p>
        DerekEntringer.com may collect and use Users personal information for the
        following purposes:
      </p>
      <ul>
        <li>
          <strong>To process payments</strong> &mdash; We may use the
          information Users provide about themselves when placing an order only
          to provide service to that order. We do not share this information with
          outside parties except to the extent necessary to provide the service.
        </li>
        <li>
          <strong>To send periodic emails</strong> &mdash; We may use the email
          address to respond to their inquiries, questions, and/or other
          requests.
        </li>
      </ul>

      <h2>How we protect your information</h2>
      <p>
        We adopt appropriate data collection, storage and processing practices
        and security measures to protect against unauthorized access, alteration,
        disclosure or destruction of your personal information, username,
        password, transaction information and data stored on our Site.
      </p>

      <h2>Sharing your personal information</h2>
      <p>
        We do not sell, trade, or rent Users personal identification information
        to others. We may share generic aggregated demographic information not
        linked to any personal identification information regarding visitors and
        users with our business partners, trusted affiliates and advertisers for
        the purposes outlined above.
      </p>

      <h2>Changes to this privacy policy</h2>
      <p>
        DerekEntringer.com has the discretion to update this privacy policy at
        any time. When we do, we will revise the updated date at the bottom of
        this page. We encourage Users to frequently check this page for any
        changes to stay informed about how we are helping to protect the personal
        information we collect. You acknowledge and agree that it is your
        responsibility to review this privacy policy periodically and become
        aware of modifications.
      </p>

      <h2>Your acceptance of these terms</h2>
      <p>
        By using this Site, you signify your acceptance of this policy. If you
        do not agree to this policy, please do not use our Site. Your continued
        use of the Site following the posting of changes to this policy will be
        deemed your acceptance of those changes.
      </p>

      <h2>Contacting us</h2>
      <p>
        If you have any questions about this Privacy Policy, the practices of
        this site, or your dealings with this site, please contact us at:
      </p>
      <p>
        DerekEntringer.com
        <br />
        dentringer@gmail.com
      </p>

      <p className={styles.lastUpdated}>
        This document was last updated on March 28, 2015
      </p>
    </div>
  );
}
