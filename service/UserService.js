import mysql from "mysql2/promise";
import config from "config";
import * as dotenv from "dotenv";

dotenv.config();
const { PRODUCTION } = process.env;
const { dbConfigLocal, dbConfigProd } = config.get("dbConfig");
const dbConfig = PRODUCTION === "true" ? dbConfigProd : dbConfigLocal;

export const getNameById = async (id) => {
  try {
    if (id === -1) {
      return "Магазин";
    }
    const conn = await mysql.createConnection(dbConfig);
    const { name } = (
      await conn.query(`SELECT name from users WHERE ?`, { id })
    )[0][0];
    await conn.end();
    return name;
  } catch {
    return id ? "ID: " + id : "Неизвестно";
  }
};
