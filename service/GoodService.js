import mysql from "mysql2/promise";
import config from "config";
import * as dotenv from "dotenv";

dotenv.config();
const { PRODUCTION } = process.env;
const { dbConfigLocal, dbConfigProd } = config.get("dbConfig");
const dbConfig = PRODUCTION === "true" ? dbConfigProd : dbConfigLocal;

export const getRemainder = async (id, organization) => {
  try {
    const conn = await mysql.createConnection(dbConfig);
    const good = (
      await conn.query(`SELECT * from goods_${organization} WHERE ?`, { id })
    )[0][0];
    const remainder = good?.remainder ? good.remainder : [];
    if (remainder.length === 0) {
      return 0;
    }
    let quantity = 0;
    if (remainder?.length) {
      remainder.forEach((v) => {
        quantity = quantity + parseInt(v.quantity);
      });
    }
    await conn.end();
    return quantity;
  } catch (e) {
    console.log(e);
    return 0;
  }
};
