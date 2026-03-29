import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "agent-hub-secret";

router.post("/auth/login", (req, res): void => {
  const { password } = req.body as { password?: string };
  if (!password || password !== OWNER_PASSWORD) {
    req.log.warn("Failed login attempt");
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  (req.session as { authenticated: boolean }).authenticated = true;
  req.log.info("Owner logged in");
  res.json({ success: true });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy((err) => {
    if (err) {
      logger.error({ err }, "Failed to destroy session");
    }
  });
  res.json({ success: true });
});

router.get("/auth/me", (req, res): void => {
  const session = req.session as { authenticated?: boolean };
  res.json({ authenticated: !!session.authenticated });
});

export default router;
