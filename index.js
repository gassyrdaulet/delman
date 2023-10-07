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
import https from "https";
import fs from "fs";

const requestLogs = [];

dotenv.config();

const privateKey = fs.readFileSync("./keys/privkey.pem", "utf8");
const certificate = fs.readFileSync("./keys/cert.pem", "utf8");
const ca = fs.readFileSync("./keys/chain.pem", "utf8");

const credentials = {
  key: privateKey,
  cert: certificate,
  ca,
};

const PORT = process.env.PORT ? process.env.PORT : 951;
const SECURE_PORT = process.env.SECURE_PORT ? process.env.SECURE_PORT : 952;

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
app.get("/", (req, res) => {
  requestLogs.push({ url: req.url, date: new Date() });
  res.status(200).send(JSON.stringify(requestLogs));
});

app.listen(PORT, () => {
  console.log(`Сервер активен. Порт: ${PORT}.`);
});
const httpsServer = https.createServer(credentials, app);
httpsServer.listen(SECURE_PORT, () => {
  console.log(`HTTPS Сервер активен. Порт: ${SECURE_PORT}.`);
});
