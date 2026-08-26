import { onRequestGet as __competitions_api___path___ts_onRequestGet } from "/home/u/scripts/appchery/functions/competitions-api/[[path]].ts"

export const routes = [
    {
      routePath: "/competitions-api/:path*",
      mountPath: "/competitions-api",
      method: "GET",
      middlewares: [],
      modules: [__competitions_api___path___ts_onRequestGet],
    },
  ]