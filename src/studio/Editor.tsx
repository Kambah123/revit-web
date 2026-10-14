import { lazy } from "react";
// Keep WebGL and modelling controls out of the dashboard's initial bundle.
export const Editor = lazy(() =>
  import("../App").then(({ App }) => ({ default: App })),
);
