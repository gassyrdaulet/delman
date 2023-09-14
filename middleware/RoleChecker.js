import mysql from "mysql2/promise";
import config from "config";
import * as dotenv from "dotenv";
// console.log(await bcrypt.hash("Lolapopa12345", 5));

dotenv.config();
const { PRODUCTION, SERVICE_ACCOUNT, LOGIN_TOKEN_NAME } = process.env;
const { dbConfigLocal, dbConfigProd } = config.get("dbConfig");
const dbConfig = PRODUCTION === "true" ? dbConfigProd : dbConfigLocal;

export const roles = async (req, res, next) => {
  if (req.method === "OPTIONS") {
    next();
  }
  try {
    const token = req.headers[LOGIN_TOKEN_NAME.toLowerCase()];
    if (token === SERVICE_ACCOUNT) {
      req.user.roles = { manager: true, pickup: true, operator: true };
      return next();
    }
    const { id } = req.user;
    const conn = await mysql.createConnection(dbConfig);
    const userDataSQL = `SELECT * FROM users WHERE id = '${id}'`;
    const user = (await conn.query(userDataSQL))[0][0];
    const orgDataSQL = `SELECT * FROM organizations WHERE id = '${user.organization}'`;
    const organization = (await conn.query(orgDataSQL))[0][0];
    const orgUsers = organization?.users ? organization.users : [];
    let candidate = undefined;
    for (let item of orgUsers) {
      if (item.id === id) {
        candidate = item;
        delete candidate.id;
      }
    }
    if (!candidate) {
      await conn.end();
      return res.status(400).json({
        message:
          "Вы не состоите в какой либо организации. Пожалуйста, перезагрузите сайт.",
      });
    }
    if (organization?.id) {
      req.user.organization = user.organization;
      req.user.owner = organization.owner === id;
      req.user.roles = candidate;
      await conn.end();
      next();
    } else {
      await conn.end();
      return res.status(400).json({
        message:
          "Вы не состоите в какой либо организации. Пожалуйста, перезагрузите сайт.",
      });
    }
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: e.name });
  }
};
