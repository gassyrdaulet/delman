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
import { networkInterfaces } from "os";

const getIPAddress = () => {
  const nets = networkInterfaces();
  const results = {};

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Retrieve only IPv4 addresses
      if (net.family === "IPv4" && !net.internal) {
        if (!results[name]) {
          results[name] = [];
        }
        results[name].push(net.address);
      }
    }
  }

  // Return the first IP address for the first NIC found
  const nicNames = Object.keys(results);
  if (nicNames.length > 0) {
    const firstNICAddresses = results[nicNames[0]];
    if (firstNICAddresses.length > 0) {
      return firstNICAddresses[0];
    }
  }

  // No IP address found
  return null;
};

const ipAddress = getIPAddress();

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
app.use("/fonts", express.static("./public"));
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
  console.log(`\n\nLocal: http://${ipAddress}:${PORT}/`);
});
const httpsServer = https.createServer(credentials, app);
httpsServer.listen(SECURE_PORT, () => {
  console.log(`HTTPS Сервер активен: https://domper.kz:${SECURE_PORT}/\n\n`);
});
