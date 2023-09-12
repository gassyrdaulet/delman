import { Router } from "express";
import { auth } from "../middleware/RouterSecurity.js";
import { roles } from "../middleware/RoleChecker.js";
import {
  getOrgInfo,
  getUsers,
  editOrgInfo,
  addNewUser,
  editOrgUsers,
  deleteUserFromOrg,
  getInvCntrlType,
  getCashbox,
  newCashbox,
  closeCashbox,
  exitOrg,
} from "../controllers/OrganizationController.js";

const router = new Router();

router.get("/getusers", [auth, roles], getUsers);
router.get("/getinfo", [auth, roles], getOrgInfo);
router.post("/exitorg", [auth, roles], exitOrg);
router.get("/getinvcntrltype", [auth, roles], getInvCntrlType);
router.post("/editorg", [auth, roles], editOrgInfo);
router.post("/addnewuser", [auth, roles], addNewUser);
router.post("/edituser", [auth, roles], editOrgUsers);
router.post("/deleteuser", [auth, roles], deleteUserFromOrg);
router.get("/getcashbox", [auth, roles], getCashbox);
router.post("/newcashbox", [auth, roles], newCashbox);
router.post("/closecashbox", [auth, roles], closeCashbox);

export default router;
