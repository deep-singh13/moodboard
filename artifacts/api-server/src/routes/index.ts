import { Router, type IRouter } from "express";
import healthRouter from "./health";
import itemsRouter from "./items";
import fetchOgRouter from "./fetchOg";
import importScreenshotRouter from "./importScreenshot";

const router: IRouter = Router();

router.use(healthRouter);
router.use(itemsRouter);
router.use(fetchOgRouter);
router.use(importScreenshotRouter);

export default router;
