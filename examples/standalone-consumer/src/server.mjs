import { renderToStaticMarkup } from "react-dom/server";

import { renderDashboard } from "./dashboard.mjs";

process.stdout.write(renderToStaticMarkup(renderDashboard()));
