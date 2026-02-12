import { useMemo } from "react";
import { useDocumentHead } from "../utils/useDocumentHead.ts";
import styles from "./PortfolioPage.module.css";

const META = [
  { name: "author", content: "Derek Entringer | derekentringer.com" },
  { name: "copyright", content: "copyright derekentringer.com" },
  { name: "description", content: "Director of Mobile Engineering" },
  {
    name: "keywords",
    content:
      "Derek Entringer, Android, iOS, Director, Mobile, Engineering, Chicago",
  },
  { name: "robots", content: "all" },
];

const LINKS = [
  {
    rel: "image_src",
    href: "https://derekentringer.com/img/derekentringer_logo_large.png",
  },
];

export function PortfolioPage() {
  const meta = useMemo(() => META, []);
  const links = useMemo(() => LINKS, []);

  useDocumentHead({
    title: "Derek Entringer | Director of Mobile Engineering",
    meta,
    links,
  });

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        derek entringer
        <div className={styles.subContent}>director of mobile engineering</div>
        <div className={styles.links}>
          <a href="https://www.linkedin.com/in/derekentringer/">LinkedIn</a>
        </div>
      </div>
    </div>
  );
}
