import { Router, type IRouter } from "express";
import healthRouter from "./health";
import itemsRouter from "./items";
import fetchOgRouter from "./fetchOg";
import movieSearchRouter from "./movieSearch";
import placesRouter from "./places";

const router: IRouter = Router();

router.use(healthRouter);
router.use(itemsRouter);
router.use(fetchOgRouter);
router.use(movieSearchRouter);
router.use(placesRouter);

export default router;
