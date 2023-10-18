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
  closeAnyCashbox,
  addCashToCashbox,
  removeCashFromCashbox,
  createNewOrganization,
  getCashboxes,
  getSpendings,
  newSpending,
  deleteSpending,
  getUsersKaspiTotals,
} from "../controllers/OrganizationController.js";

const router = new Router();

router.get("/getusers", [auth, roles], getUsers);
router.get("/getuserskaspitotals", getUsersKaspiTotals);
router.post("/neworganization", [auth], createNewOrganization);
router.get("/getinfo", [auth, roles], getOrgInfo);
router.post("/exitorg", [auth, roles], exitOrg);
router.get("/getinvcntrltype", [auth, roles], getInvCntrlType);
router.post("/editorg", [auth, roles], editOrgInfo);
router.post("/addnewuser", [auth, roles], addNewUser);
router.post("/edituser", [auth, roles], editOrgUsers);
router.post("/deleteuser", [auth, roles], deleteUserFromOrg);
router.get("/getcashbox", [auth, roles], getCashbox);
router.post("/getcashboxes", [auth, roles], getCashboxes);
router.post("/getspendings", [auth, roles], getSpendings);
router.post("/newspending", [auth, roles], newSpending);
router.post("/deletespending", [auth, roles], deleteSpending);
router.post("/newcashbox", [auth, roles], newCashbox);
router.post("/closecashbox", [auth, roles], closeCashbox);
router.post("/closeanycashbox", [auth, roles], closeAnyCashbox);
router.post("/addcashtocashbox", [auth, roles], addCashToCashbox);
router.post("/removecashfromcashbox", [auth, roles], removeCashFromCashbox);

export default router;
