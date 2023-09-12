import { Router } from "express";
import { auth } from "../middleware/RouterSecurity.js";
import { roles } from "../middleware/RoleChecker.js";
import { check } from "express-validator";
import {
  getOrders,
  newOrder,
  getOrderDetails,
  sendDeliver,
  issueOrder,
  finishOrder,
  getFinishedOrders,
  cancelOrder,
  recreateOrder,
  editOrder,
  returnOrder,
  issuePickup,
  newOrderStraightToTheArchive,
  isThereOrder,
} from "../controllers/OrderController.js";

const router = new Router();

const deliveryChecks = [
  check("order.delivery", "Неверный формат информации о доставке!").custom(
    (v) => {
      try {
        if (Object.keys(v).length === 0) {
          return true;
        }
        const keys = [
          "cellphone",
          "address",
          "deliveryPriceForCustomer",
          "deliveryPriceForDeliver",
          "plannedDeliveryDate",
        ];
        for (let key of keys) {
          if (v[key] === undefined) {
            return false;
          }
        }
        return true;
      } catch {
        console.log("Error");
        return false;
      }
    }
  ),
  check("order.delivery.cellphone", "Неверный формат номера телефона!")
    .optional()
    .isLength({ min: 1 })
    .isMobilePhone("kk-KZ"),
  check("order.delivery.address", "Заполните поле адреса!")
    .optional()
    .isLength({
      min: 1,
      max: 500,
    }),
];

const isDeliveryMiddleWare = (req, res, next) => {
  try {
    const { delivery } = req.body.order;
    const isDelivery = Object.keys(delivery).length !== 0;
    req.body.order.isDelivery = isDelivery;
    next();
  } catch (e) {
    res.status(400).json({ message: "Ошибка:", e });
  }
};
router.get("/getorders", [auth, roles], getOrders);
router.get("/getdetails", [auth, roles], getOrderDetails);
router.post(
  "/neworder",
  [auth, roles, isDeliveryMiddleWare, deliveryChecks],
  newOrder
);
router.post(
  "/editorder",
  [auth, roles, isDeliveryMiddleWare, deliveryChecks],
  editOrder
);
router.post(
  "/cashorder",
  [auth, roles, isDeliveryMiddleWare, deliveryChecks],
  newOrderStraightToTheArchive
);
router.post("/senddeliver", [auth, roles], sendDeliver);
router.post("/issueorder", [auth, roles], issueOrder);
router.post("/issuepickup", [auth, roles], issuePickup);
router.post("/finishorder", [auth, roles], finishOrder);
router.post("/cancelorder", [auth, roles], cancelOrder);
router.post("/getfinished", [auth, roles], getFinishedOrders);
router.post("/recreateorder", [auth, roles], recreateOrder);
router.post("/returnorder", [auth, roles], returnOrder);
router.post("/isthereorder", [auth, roles], isThereOrder);

export default router;
