import { Router, type IRouter } from "express";
import healthRouter from "./health";
import itemsRouter from "./items";
import fetchOgRouter from "./fetchOg";

const router: IRouter = Router();

router.use(healthRouter);
router.use(itemsRouter);
router.use(fetchOgRouter);

export default router;
