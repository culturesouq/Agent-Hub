import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import agentsRouter from "./agents";
import knowledgeRouter from "./knowledge";
import instructionsRouter from "./instructions";
import chatRouter from "./chat";
import connectionsRouter from "./connections";
import activityRouter from "./activity";
import publicRouter from "./public";
import toolsRouter from "./tools";
import automationsRouter from "./automations";
import integrationsRouter from "./integrations";
import oauthRouter from "./oauth";
import voiceRouter from "./voice";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(agentsRouter);
router.use(knowledgeRouter);
router.use(instructionsRouter);
router.use(chatRouter);
router.use(voiceRouter);
router.use(connectionsRouter);
router.use(activityRouter);
router.use(publicRouter);
router.use(toolsRouter);
router.use(automationsRouter);
router.use(integrationsRouter);
router.use(oauthRouter);

export default router;
