import mysql from "mysql2/promise";
import config from "config";
import * as dotenv from "dotenv";
import { validationResult } from "express-validator";

dotenv.config();
const { PRODUCTION } = process.env;
const { dbConfigLocal, dbConfigProd } = config.get("dbConfig");
const dbConfig = PRODUCTION === "true" ? dbConfigProd : dbConfigLocal;
const unlockTablesSQL = `UNLOCK TABLES`;
const connUnlockSample = { query: () => {}, end: () => {} };

export const newAcceptance = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { organization, roles } = req.user;
    if (!roles.warehouse) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав кладовщика!`,
      });
    }
    const { goods, date, comment } = req.body;
    if (!goods || goods.length === 0) {
      return res.status(400).json({
        message: "Нельзя создать пустой список.",
      });
    }
    const lockTableSQL = `LOCK TABLES goods_${organization} WRITE`;
    const unlockTablesSQL = `UNLOCK TABLES`;
    const insertSQL = `INSERT INTO warehouse_${organization} SET ?`;
    const getRemainderSQL = `SELECT * FROM goods_${organization} where id = `;
    const updateGoodSQL = `UPDATE goods_${organization} SET ? where id = `;
    const updateInventorySQL = `UPDATE warehouse_${organization} SET ? where id = `;
    const deleteInventorySQL = `DELETE FROM warehouse_${organization} where id = `;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    const [insertInfo] = await conn.query(insertSQL, {
      goods: JSON.stringify([]),
      date: new Date(date),
      type: "acceptance",
      comment,
    });
    const { insertId } = insertInfo;
    await conn.query(lockTableSQL);
    await Promise.all(
      goods.map(async (good) => {
        const goodInfo = (await conn.query(getRemainderSQL + good.id))[0][0];
        const remainder = goodInfo?.remainder;
        const temp = remainder?.length
          ? [
              {
                id: insertId,
                date,
                quantity: good.quantity,
                price: good.price,
              },
              ...remainder,
            ]
          : [
              {
                id: insertId,
                date,
                quantity: good.quantity,
                price: good.price,
              },
            ];
        await conn.query(updateGoodSQL + good.id, {
          remainder: JSON.stringify(temp),
        });
      })
    );
    await conn.query(unlockTablesSQL);
    const result = goods.filter((item) => item.quantity !== 0);
    if (!result || result.length === 0) {
      await conn.query(deleteInventorySQL + insertId);
      conn.end();
      return res.status(400).json({
        message: "Нельзя создать пустой список.",
      });
    }
    await conn.query(updateInventorySQL + insertId, {
      goods: JSON.stringify(result),
    });
    conn.end();
    res.status(200).json({ message: "OK" });
  } catch (e) {
    conn.query(unlockTablesSQL);
    conn.end();
    res.status(500).json({
      message: "Ошибка в сервере.",
      e,
    });
  }
};

export const getInventory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { organization } = req.user;
    const { type } = req.query;
    const getInventorySQL = `SELECT * FROM warehouse_${organization} WHERE ?`;
    const conn = await mysql.createConnection(dbConfig);
    const inventories = (await conn.query(getInventorySQL, { type }))[0];
    conn.end();
    res.send(inventories);
  } catch (e) {
    res.status(500).json({
      message: "Ошибка в сервере.",
      e,
    });
  }
};

export const getInventoryDetails = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { organization } = req.user;
    const { id } = req.query;
    const getInventorySQL = `SELECT * FROM warehouse_${organization} WHERE ?`;
    const conn = await mysql.createConnection(dbConfig);
    const inventory = (await conn.query(getInventorySQL, { id }))[0][0];
    conn.end();
    res.send(inventory);
  } catch (e) {
    res.status(500).json({
      message: "Ошибка в сервере.",
      e,
    });
  }
};

export const newWriteOff = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { organization, roles } = req.user;
    if (!roles.warehouse) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав кладовщика!`,
      });
    }
    const { goods, date, comment } = req.body;
    if (!goods || goods.length === 0) {
      return res.status(400).json({
        message: "Нельзя создать пустой список.",
      });
    }
    const lockTableSQL = `LOCK TABLES goods_${organization} WRITE`;
    const unlockTablesSQL = `UNLOCK TABLES`;
    const insertSQL = `INSERT INTO warehouse_${organization} SET ?`;
    const getRemainderSQL = `SELECT * FROM goods_${organization} where id = `;
    const updateGoodSQL = `UPDATE goods_${organization} SET ? where id = `;
    const updateInventorySQL = `UPDATE warehouse_${organization} SET ? where id = `;
    const deleteInventorySQL = `DELETE FROM warehouse_${organization} where id = `;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    const resultHeaders = await conn.query(insertSQL, {
      goods: JSON.stringify([]),
      date: new Date(date),
      type: "writeoff",
      comment,
    });
    const { insertId } = resultHeaders[0];
    await conn.query(lockTableSQL);
    await Promise.all(
      goods.map(async (good) => {
        const quantity = parseInt(good.quantity);
        const goodInfo = (await conn.query(getRemainderSQL + good.id))[0][0];
        const remainder = goodInfo?.remainder;
        if (!remainder || remainder?.length === 0) {
          good.quantity = 0;
          return;
        }
        const temp = remainder.reverse();
        const difference = parseInt(temp[0].quantity) - quantity;
        let lastDifference = 0 + difference;
        if (difference >= 0) {
          temp[0].quantity = difference;
        } else {
          temp[0].quantity = 0;
          for (let i = 1; i <= temp.length; i++) {
            if (!temp[i]) {
              if (lastDifference < 0) {
                temp.length = 0;
                good.quantity = quantity - Math.abs(lastDifference);
                break;
              }
            } else {
              lastDifference =
                parseInt(temp[i].quantity) - Math.abs(lastDifference);
              if (lastDifference >= 0) {
                temp[i].quantity = lastDifference;
                break;
              } else {
                temp[i].quantity = 0;
              }
            }
          }
        }
        const result = temp
          .filter((item) => {
            return item.quantity !== 0;
          })
          .reverse();
        await conn.query(updateGoodSQL + good.id, {
          remainder: JSON.stringify(result),
        });
      })
    );
    await conn.query(unlockTablesSQL);
    const result = goods.filter((item) => item.quantity !== 0);
    if (!result || result.length === 0) {
      conn.end();
      await conn.query(deleteInventorySQL + insertId);
      return res.status(400).json({
        message:
          "Списываемых товаров уже и так нет в наличии. А пустой список составлять нельзя.",
      });
    }
    await conn.query(updateInventorySQL + insertId, {
      goods: JSON.stringify(result),
    });
    conn.end();
    res.status(200).json({ message: "OK" });
  } catch (e) {
    conn.query(unlockTablesSQL);
    conn.end();
    res.status(500).json({
      message: "Ошибка в сервере.",
      e,
    });
  }
};
