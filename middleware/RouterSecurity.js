import * as dotenv from "dotenv";
dotenv.config();
const { SECRET_KEY, LOGIN_TOKEN_NAME, SERVICE_ACCOUNT } = process.env;
import jwt from "jsonwebtoken";

export const auth = (req, res, next) => {
  if (req.method === "OPTIONS") {
    next();
  }
  try {
    const token = req.headers[LOGIN_TOKEN_NAME.toLowerCase()];
    const mobileToken = req.headers["authorization"];
    if (!token) {
      if (!mobileToken) {
        return res
          .status(403)
          .json({ message: "Отказано в доступе.", logout: true });
      }
    }
    if (token === SERVICE_ACCOUNT) {
      req.user = {};
      req.user.id = req.query?.userId;
      req.user.organization = req.query?.organizationId;
      return next();
    }
    const decodedData = jwt.verify(
      token ? token : mobileToken.split(" ")[1],
      SECRET_KEY
    );
    req.user = decodedData;
    next();
  } catch (e) {
    console.log(e);
    if (e.name === "JsonWebTokenError") {
      res.status(403).json({ message: "Отказано в доступе.", logout: true });
    } else {
      res.status(403).json({
        message:
          e.name === "TokenExpiredError"
            ? "Срок Вашего токена авторизации истек. Пожалуйста войдите в свой аккаунт заново."
            : e.name,
        logout: true,
      });
    }
  }
};
