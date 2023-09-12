import { Router } from "express";
import {
  login,
  ping,
  sendCode,
  changePassword,
  confirmAccount,
  registration,
  getToken,
  getUserData,
  deleteAccount,
  editAccount,
} from "../controllers/AuthController.js";
import { auth } from "../middleware/RouterSecurity.js";
import { roles } from "../middleware/RoleChecker.js";
import { check } from "express-validator";

const router = new Router();

router.post(
  "/login",
  [check("email", "Некорректный E-mail!").isEmail()],
  login
);
router.post(
  "/registration",
  [check("email", "Некорректный E-mail!").isEmail()],
  registration
);
router.post(
  "/sendcode",
  [check("email", "Некорректный E-mail!").isEmail()],
  sendCode
);
router.get("/ping", auth, ping);
router.get("/checkorg", [auth, roles], ping);
router.post("/token", [auth, roles], getToken);
router.get("/getuserdata", [auth, roles], getUserData);
router.delete("/delete", [auth, roles], deleteAccount);
router.post("/edit", [auth, roles], editAccount);
router.post(
  "/change",
  [
    check("email", "Неверный формат E-mail!").isEmail(),
    check("code", "Код не должен быть короче 1 и длиннее 8!").isLength({
      min: 1,
      max: 8,
    }),
    check("password", "Пароль не должен быть короче 9 и длиннее 20!")
      .isLength({
        min: 9,
        max: 20,
      })
      .isStrongPassword({ minLength: 0, minSymbols: 0 })
      .withMessage(
        "Пароль должен иметь как минимум одно число, одну заглавную и одну прописную букву."
      ),
  ],
  changePassword
);
router.post(
  "/confirm",
  [
    check("email", "Неверный формат E-mail!").isEmail(),
    check("code", "Код не должен быть короче 1 и длиннее 8!").isLength({
      min: 1,
      max: 8,
    }),
  ],
  confirmAccount
);

export default router;
