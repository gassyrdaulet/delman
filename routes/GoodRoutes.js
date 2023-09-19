import { Router } from "express";
import { auth } from "../middleware/RouterSecurity.js";
import { roles } from "../middleware/RoleChecker.js";
import {
  getGoods,
  getGroups,
  editGroup,
  deleteGroup,
  newGood,
  deleteGood,
  newGroup,
  fetchGroupInfo,
  getGood,
  editGood,
  uploadXLSX,
  getBarcode,
  getRelations,
  newRelation,
  deleteRelation,
  editRelation,
  getGoodsByCode,
} from "../controllers/GoodController.js";
import formidableMiddleware from "express-formidable";
import { check } from "express-validator";

const checkForGroups = [
  check(
    "name",
    "Название группы не должно быть короче 1 и длиннее 20!"
  ).isLength({
    min: 1,
    max: 20,
  }),
];
const checksForGoods = [
  check(
    "name",
    "Название товара не должно быть короче 1 и длиннее 50!"
  ).isLength({
    min: 1,
    max: 50,
  }),
  check(
    "barcode",
    "Баркод товара не должен быть короче 1 и длиннее 50!"
  ).isLength({
    min: 1,
    max: 50,
  }),
  check("price", "Цена должна содержать только цифры!").isNumeric(),
  check(
    "unit",
    "Единица изменерения товара не должна быть короче 1 и длиннее 50!"
  ).isLength({
    min: 1,
    max: 10,
  }),
  check("series", "Неверно указана группа товаров.").isNumeric(),
  check("price", "Цена не должна быть ниже нуля!").custom((v) => {
    return v > 0;
  }),
  check("barcode", "Баркод не должен быть ниже нуля!").custom((v) => {
    return v > 0;
  }),
];
const router = new Router();

router.get("/all", [auth, roles], getGoods);
router.post("/newgood", [auth, roles, ...checksForGoods], newGood);
router.post(
  "/editGood",
  [
    auth,
    roles,
    ...checksForGoods,
    check("id", "Неверно указан номер товара.").isNumeric(),
  ],
  editGood
);
router.get("/groups", [auth, roles], getGroups);
router.post(
  "/editgroup",
  [
    auth,
    roles,
    ...checkForGroups,
    check("id", "Неверно указан номер товара.").isNumeric(),
  ],
  editGroup
);
router.post("/newgroup", [auth, roles, ...checkForGroups], newGroup);
router.post("/deletegroup", [auth, roles], deleteGroup);
router.post("/deletegood", [auth, roles], deleteGood);
router.post("/getgood", [auth, roles], getGood);
router.get("/getgoodsbycode", [auth], getGoodsByCode);
router.post("/fetchgroup", [auth, roles], fetchGroupInfo);
router.get("/getbarcode", [auth, roles], getBarcode);
router.post("/uploadxlsx", [auth, roles, formidableMiddleware()], uploadXLSX);
router.get("/getrelations", [auth, roles], getRelations);
router.post("/newrelation", [auth, roles], newRelation);
router.post("/deleterelation", [auth, roles], deleteRelation);
router.post("/editrelation", [auth, roles], editRelation);

export default router;
