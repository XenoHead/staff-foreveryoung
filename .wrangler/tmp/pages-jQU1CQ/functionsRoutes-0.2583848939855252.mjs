import { onRequestGet as __api_inventory_search_js_onRequestGet } from "C:\\Git\\staff.foreveryoung\\functions\\api\\inventory-search.js"
import { onRequestGet as __api_sales_js_onRequestGet } from "C:\\Git\\staff.foreveryoung\\functions\\api\\sales.js"
import { onRequestPost as __api_sync_js_onRequestPost } from "C:\\Git\\staff.foreveryoung\\functions\\api\\sync.js"

export const routes = [
    {
      routePath: "/api/inventory-search",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_inventory_search_js_onRequestGet],
    },
  {
      routePath: "/api/sales",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_sales_js_onRequestGet],
    },
  {
      routePath: "/api/sync",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_sync_js_onRequestPost],
    },
  ]