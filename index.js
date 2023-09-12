import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import cookieParser from "cookie-parser";
import AuthRoutes from "./routes/AuthRoutes.js";
import GoodRoutes from "./routes/GoodRoutes.js";
import OrderRoutes from "./routes/OrderRoutes.js";
import WarehouseRoutes from "./routes/WarehouseRoutes.js";
import OrganizationRoutes from "./routes/OrganizationRoutes.js";
import * as dotenv from "dotenv";

dotenv.config();
const PORT = process.env.PORT ? process.env.PORT : 951;

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
app.use(cookieParser());
app.use("/api/auth/", AuthRoutes);
app.use("/api/goods/", GoodRoutes);
app.use("/api/orders/", OrderRoutes);
app.use("/api/warehouse/", WarehouseRoutes);
app.use("/api/organization/", OrganizationRoutes);

app.listen(PORT, () => {
  console.log(`Сервер активен. Порт: ${PORT}.`);
});
