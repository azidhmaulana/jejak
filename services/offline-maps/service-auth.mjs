import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";

export function serviceAuth({
  file = process.env.BMS_SERVICE_AUTH_FILE || "/run/bms-auth/service.json",
} = {}) {
  return (req, res, next) => {
    if (
      req.method === "GET" &&
      req.url.split("?")[0] === "/api/offline-maps/health"
    )
      return next();
    try {
      const key = JSON.parse(readFileSync(file, "utf8")).internalKey;
      if (!/^[a-f0-9]{64}$/.test(key)) throw Error("Invalid service key");
      const value = req.headers["x-bms-service-key"];
      if (
        typeof value === "string" &&
        Buffer.byteLength(value) === 64 &&
        timingSafeEqual(Buffer.from(value), Buffer.from(key))
      )
        return next();
      return res.status(401).json({ error: "Service authentication required" });
    } catch {
      return res
        .status(503)
        .json({ error: "Service authentication unavailable" });
    }
  };
}
