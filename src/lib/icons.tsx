// Central Font Awesome icon registry for the finance app. We use the SVG-core
// React component (tree-shaken: only the icons imported here ship), so the
// single-file store bundle stays lean and there's no webfont to inline.
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse,
  faArrowsRotate,
  faChartColumn,
  faChartPie,
  faMagnifyingGlass,
  faEllipsis,
  faGem,
  faTag,
  faBell,
  faTriangleExclamation,
  faGear,
  faMoneyBills,
  faMoneyBill,
  faMoneyBillWave,
  faMoneyBillTransfer,
  faBuildingColumns,
  faPiggyBank,
  faCreditCard,
  faArrowTrendUp,
  faChevronLeft,
  faChevronRight,
  faCalendarDay,
  faCartShopping,
  faUtensils,
  faCar,
  faBagShopping,
  faFileInvoiceDollar,
  faHeartPulse,
  faFilm,
  faPlane,
  faReceipt,
  faWandMagicSparkles,
  faUser,
  faSackDollar,
  faStore,
  faXmark,
  faLock,
  faArrowTrendDown,
  faArrowUp,
  faCircleExclamation,
  faCircleCheck,
  faRobot,
  faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import type { Account } from "../api/types";

export type { IconDefinition };

export {
  faHouse,
  faArrowsRotate,
  faChartColumn,
  faChartPie,
  faMagnifyingGlass,
  faEllipsis,
  faGem,
  faTag,
  faBell,
  faTriangleExclamation,
  faGear,
  faMoneyBills,
  faMoneyBill,
  faMoneyBillWave,
  faMoneyBillTransfer,
  faBuildingColumns,
  faPiggyBank,
  faCreditCard,
  faArrowTrendUp,
  faChevronLeft,
  faChevronRight,
  faCalendarDay,
  faWandMagicSparkles,
  faUser,
  faSackDollar,
  faStore,
  faXmark,
  faLock,
  faFileInvoiceDollar,
  faArrowTrendDown,
  faArrowUp,
  faCircleExclamation,
  faCircleCheck,
  faRobot,
  faLightbulb,
};

/** Thin wrapper: fixed-width by default so icons align in lists/nav. */
export function Icon({
  icon,
  className,
  style,
}: {
  icon: IconDefinition;
  className?: string;
  style?: React.CSSProperties;
}) {
  return <FontAwesomeIcon icon={icon} fixedWidth className={className} style={style} />;
}

const ACCOUNT_ICON: Record<Account["type"], IconDefinition> = {
  checking: faBuildingColumns,
  savings: faPiggyBank,
  credit: faCreditCard,
  investment: faArrowTrendUp,
  loan: faHouse,
  cash: faMoneyBill,
};
export function accountIcon(type: Account["type"]): IconDefinition {
  return ACCOUNT_ICON[type] ?? faMoneyBill;
}

// System category ids → FA glyphs (see src/api/mock/data.ts). Falls back to a tag.
const CATEGORY_ICON: Record<string, IconDefinition> = {
  cat_income: faMoneyBillWave,
  cat_groceries: faCartShopping,
  cat_dining: faUtensils,
  cat_transport: faCar,
  cat_shopping: faBagShopping,
  cat_bills: faFileInvoiceDollar,
  cat_housing: faHouse,
  cat_health: faHeartPulse,
  cat_entertainment: faFilm,
  cat_travel: faPlane,
  cat_subscriptions: faArrowsRotate,
  cat_fees: faReceipt,
};
export function categoryIcon(categoryId: string | null | undefined): IconDefinition {
  return (categoryId && CATEGORY_ICON[categoryId]) || faTag;
}
