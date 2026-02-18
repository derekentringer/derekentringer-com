import { Link } from "react-router-dom";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Personal Finance</h1>
      <nav className={styles.nav}>
        <Link to="/accounts" className={styles.navLink}>
          Accounts
        </Link>
      </nav>
    </div>
  );
}
