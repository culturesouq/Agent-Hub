import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET || "agent-hub-dev-secret-change-in-production";

const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });

// Ensure the sessions table exists before the session middleware uses it
pgPool.query(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid  varchar NOT NULL COLLATE "default",
    sess json    NOT NULL,
    expire timestamp(6) NOT NULL,
    CONSTRAINT sessions_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
  );
  CREATE INDEX IF NOT EXISTS "IDX_sessions_expire" ON sessions (expire);
`).catch(err => logger.warn({ err }, "Session table init warning"));

const PgSession = connectPgSimple(session);

app.use(session({
  store: new PgSession({
    pool: pgPool,
    tableName: "sessions",
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  },
}));

app.use("/api", router);

export default app;
