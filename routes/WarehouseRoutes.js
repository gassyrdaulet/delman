import { Router } from "express";
import { auth } from "../middleware/RouterSecurity.js";
import { roles } from "../middleware/RoleChecker.js";
import {
  newAcceptance,
  getInventory,
  getInventoryDetails,
  newWriteOff,
} from "../controllers/WareHouseController.js";
import { check } from "express-validator";

const router = new Router();

router.post("/newaccept", [auth, roles], newAcceptance);
router.post("/newwriteoff", [auth, roles], newWriteOff);
router.get("/getinventory", [auth, roles], getInventory);
router.get("/getinventorydetails", [auth, roles], getInventoryDetails);

export default router;
