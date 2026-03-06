import express from "express";
import { AuthMiddleware } from "../../../../middleware/AuthMiddleware";
import ItemsService from "../service/ItemsService";

const router = express.Router();
const service = new ItemsService();

router.use(AuthMiddleware.protect);

router.get("/by-key/:key", service.getItemByKey);
router.get("/setting/:settingKey", service.getItemsForSetting);
router.get("/", service.getResources);
router.get("/:id", service.getResource);

// intentionally not exposed yet
// router.post("/", service.create);
// router.put("/:id", service.updateResource);
// router.delete("/:id", service.removeResource);

export default router;