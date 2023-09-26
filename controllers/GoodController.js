import mysql from "mysql2/promise";
import config from "config";
import * as dotenv from "dotenv";
import { validationResult } from "express-validator";
import XLSX from "xlsx";

dotenv.config();
const { PRODUCTION } = process.env;
const { dbConfigLocal, dbConfigProd } = config.get("dbConfig");
const dbConfig = PRODUCTION === "true" ? dbConfigProd : dbConfigLocal;

export const getBarcode = async (req, res) => {
  try {
    const { organization } = req.user;
    const conn = await mysql.createConnection(dbConfig);
    const { latestBarcode } = (
      await conn.query(
        `SELECT MAX(barcode) latestBarcode from goods_${organization}`
      )
    )[0][0];
    conn.end();
    res.status(200).json({
      barcode:
        latestBarcode === null || latestBarcode === undefined
          ? 1000000
          : parseInt(latestBarcode) + 1,
    });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getGoods = async (req, res) => {
  try {
    const { organization } = req.user;
    const getAllGoodsSQL = `SELECT * from goods_${organization}`;
    const conn = await mysql.createConnection(dbConfig);
    const goods = (await conn.query(getAllGoodsSQL))[0];
    conn.end();
    res.send(goods);
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getRelations = async (req, res) => {
  try {
    const { organization } = req.user;
    const getRelationsSQL = `SELECT * from relations_${organization}`;
    const getGoodSQL = `SELECT name from goods_${organization} WHERE id = `;
    const conn = await mysql.createConnection(dbConfig);
    const relations = (await conn.query(getRelationsSQL))[0];
    const relationsWithNames = [];
    await Promise.all(
      relations.map(async (relation) => {
        const { goods } = relation;
        for (let good of goods) {
          const goodInfo = (
            await conn.query(getGoodSQL + `'${good.id}'`)
          )[0][0];
          good.name = goodInfo?.name ? goodInfo.name : "Не найдено";
        }
        relation.goods = goods;
        relationsWithNames.push(relation);
      })
    );
    conn.end();
    res.send(relationsWithNames);
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const newRelation = async (req, res) => {
  try {
    const { organization, roles } = req.user;
    if (!roles.manager) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для создания и редактирования связей.`,
      });
    }
    const { code, goods } = req.body;
    const selectGoodSQL = `SELECT * FROM goods_${organization} WHERE id = `;
    const selectRelationSQL = `SELECT * FROM relations_${organization}`;
    const insertRelationSQL = `INSERT INTO relations_${organization} SET ?`;
    if (!goods || goods.length === 0) {
      return res
        .status(400)
        .json({ message: `Вы отправили пустой список товаров.` });
    }
    const conn = await mysql.createConnection(dbConfig);
    let goodNotFound = false;
    let notFoundId = 0;
    await Promise.all(
      goods.map(async (good) => {
        const goodInfo = (await conn.query(selectGoodSQL + good.id))[0][0];
        if (!goodInfo) {
          goodNotFound = true;
          notFoundId = good.id;
        }
      })
    );
    if (goodNotFound) {
      conn.end();
      return res
        .status(400)
        .json({ message: `Такого товара не существует! (ID: ${notFoundId})` });
    }
    const relations = (await conn.query(selectRelationSQL))[0];
    for (let relation of relations) {
      if (relation.code === code) {
        conn.end();
        return res
          .status(400)
          .json({ message: "Такой артикул уже существует!" });
      }
    }
    await conn.query(insertRelationSQL, {
      code,
      goods: JSON.stringify(
        goods.map((item) => {
          return { id: item.id, quantity: item.quantity };
        })
      ),
    });
    conn.end();
    res.status(200).json({ message: "Вы успешно создали новую связь!" });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const deleteRelation = async (req, res) => {
  try {
    const { organization, roles } = req.user;
    if (!roles.manager) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для создания и редактирования связей.`,
      });
    }
    const { relationId } = req.body;
    const getRelationSQL = `SELECT * FROM relations_${organization} WHERE id = ${relationId}`;
    const deleteRelationSQL = `DELETE FROM relations_${organization} WHERE id = ${relationId}`;
    const conn = await mysql.createConnection(dbConfig);
    const relation = (await conn.query(getRelationSQL))[0][0];
    if (!relation) {
      conn.end();
      return res.status(400).json({ message: "Такой связи не найдено!" });
    }
    await conn.query(deleteRelationSQL);
    conn.end();
    res.status(200).json({ message: "Вы успешно удалили связь!" });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const editRelation = async (req, res) => {
  try {
    const { organization, roles } = req.user;
    if (!roles.manager) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для создания и редактирования связей.`,
      });
    }
    const { goods, relationId } = req.body;
    const selectGoodSQL = `SELECT * FROM goods_${organization} WHERE id = `;
    const getRelationSQL = `SELECT * FROM relations_${organization} WHERE id = ${relationId}`;
    const updateRelationSQL = `UPDATE relations_${organization} SET ? WHERE id = ${relationId}`;
    if (!goods || goods.length === 0) {
      return res
        .status(400)
        .json({ message: `Вы отправили пустой список товаров.` });
    }
    const conn = await mysql.createConnection(dbConfig);
    let goodNotFound = false;
    let notFoundId = 0;
    await Promise.all(
      goods.map(async (good) => {
        const goodInfo = (await conn.query(selectGoodSQL + good.id))[0][0];
        if (!goodInfo) {
          goodNotFound = true;
        }
      })
    );
    if (goodNotFound) {
      conn.end();
      return res
        .status(400)
        .json({ message: `Такого товара не существует! (ID: ${notFoundId})` });
    }
    const relation = (await conn.query(getRelationSQL))[0][0];
    if (!relation) {
      conn.end();
      return res.status(400).json({ message: "Такой связи не найдено!" });
    }
    await conn.query(updateRelationSQL, {
      goods: JSON.stringify(
        goods.map((item) => {
          return { id: item.id, quantity: item.quantity };
        })
      ),
    });
    conn.end();
    res.status(200).json({ message: "OK" });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getGood = async (req, res) => {
  try {
    const { organization } = req.user;
    const { id } = req.body;
    const getGoodSQL = `SELECT * from goods_${organization} WHERE id = ${id}`;
    const conn = await mysql.createConnection(dbConfig);
    const good = (await conn.query(getGoodSQL))[0][0];
    conn.end();
    res.send(good);
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getGoodsByCode = async (req, res) => {
  try {
    const { organization } = req.user;
    const { code } = req.query;
    const getRelationSQL = `SELECT * from relations_${organization} WHERE code = ${code}`;
    const getGoodSQL = `SELECT * from goods_${organization} WHERE id = `;
    const conn = await mysql.createConnection(dbConfig);
    const relation = (await conn.query(getRelationSQL))[0][0];
    if (!relation) {
      conn.end();
      return res
        .status(400)
        .json({ message: `Ошибка! Связь не найдена (Артикул: ${code})!` });
    }
    let goodNotFound = false;
    let notFoundId = 0;
    const goods = [];
    await Promise.all(
      relation.goods.map(async (good) => {
        const goodInfo = (await conn.query(getGoodSQL + good.id))[0][0];
        if (!goodInfo) {
          goodNotFound = true;
          notFoundId = good.id;
          return;
        }
        goods.push({ ...goodInfo, quantity: good.quantity });
      })
    );
    conn.end();
    if (goodNotFound) {
      return res
        .status(400)
        .json({ message: `Такого товара не существует! (ID: ${notFoundId})` });
    }
    res.send(goods);
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const newGood = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { organization, roles } = req.user;
    if (!roles.goods) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для создания и редактирования товаров.`,
      });
    }
    const { barcode, name, price, unit, series } = req.body;
    const insertGoodSQL = `INSERT INTO goods_${organization} SET ?`;
    const conn = await mysql.createConnection(dbConfig);
    await conn.query(insertGoodSQL, {
      barcode,
      name,
      price,
      unit,
      series,
    });
    conn.end();
    res.status(200).json({ message: "OK" });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const editGood = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { organization, roles } = req.user;
    if (!roles.goods) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для создания и редактирования товаров.`,
      });
    }
    const { barcode, name, price, unit, series, id } = req.body;
    const updateGoodsSQL = `UPDATE goods_${organization} SET ? WHERE id = ${id}`;
    const conn = await mysql.createConnection(dbConfig);
    await conn.query(updateGoodsSQL, {
      barcode,
      name,
      price,
      unit,
      series,
    });
    conn.end();
    res.status(200).json({ message: "OK" });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const newGroup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { organization, roles } = req.user;
    if (!roles.goods) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для создания и редактирования товаров.`,
      });
    }
    const { name } = req.body;
    const insertGroupSQL = `INSERT INTO series_${organization} SET ?`;
    const conn = await mysql.createConnection(dbConfig);
    await conn.query(insertGroupSQL, { name });
    conn.end();
    res.status(200).json({ message: "OK" });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const deleteGood = async (req, res) => {
  try {
    const { id } = req.body;
    const { organization, roles } = req.user;
    if (!roles.goods) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для создания и редактирования товаров.`,
      });
    }
    const selectGoodSQL = `SELECT * FROM goods_${organization} where id = ${id}`;
    const deleteGoodSQL = `DELETE FROM goods_${organization}  where id = ${id}`;
    const conn = await mysql.createConnection(dbConfig);
    const good = (await conn.query(selectGoodSQL))[0][0];
    if (good?.remainder && good.remainder.constructor === Array) {
      for (let item of good.remainder) {
        if (item.quantity > 0) {
          conn.end();
          return res.status(400).json({
            message:
              "Нельзя удалять товар с остатком. Сперва сделайте его списание.",
          });
        }
      }
    }
    await conn.query(deleteGoodSQL);
    conn.end();
    res.status(200).json({ message: "OK" });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getGroups = async (req, res) => {
  try {
    const { organization } = req.user;
    const getGroupsSQL = `SELECT * from series_${organization}`;
    const conn = await mysql.createConnection(dbConfig);
    const groups = (await conn.query(getGroupsSQL))[0];
    conn.end();
    res.send(groups);
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const editGroup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { name, id } = req.body;
    const { organization, roles } = req.user;
    if (!roles.goods) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для создания и редактирования товаров.`,
      });
    }
    const editGroupSQL = `UPDATE series_${organization} set ? where id = ${id}`;
    const conn = await mysql.createConnection(dbConfig);
    await conn.query(editGroupSQL, { name });
    conn.end();
    res.status(200).json({ message: "OK" });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const deleteGroup = async (req, res) => {
  try {
    const { id } = req.body;
    const { organization, roles } = req.user;
    if (!roles.goods) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для создания и редактирования товаров.`,
      });
    }
    const deleteGroupSQL = `DELETE FROM series_${organization}  where id = ${id}`;
    const selectGoodsSQL = `SELECT id FROM goods_${organization} where series = ${id}`;
    const updateGoodsSQL = `UPDATE goods_${organization} SET series = null where ?`;
    const conn = await mysql.createConnection(dbConfig);
    const goods = (await conn.query(selectGoodsSQL))[0];
    for (let good of goods) {
      await conn.query(updateGoodsSQL, { id: good.id });
    }
    await conn.query(deleteGroupSQL);
    conn.end();
    res.status(200).json({ message: "OK" });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const fetchGroupInfo = async (req, res) => {
  try {
    const { id } = req.body;
    const { organization } = req.user;
    const selectGroupSQL = `SELECT * FROM series_${organization} WHERE id = ${id}`;
    const conn = await mysql.createConnection(dbConfig);
    const group = (await conn.query(selectGroupSQL))[0][0];
    conn.end();
    res.send(group);
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const uploadXLSX = async (req, res) => {
  try {
    const { file } = req.files;
    const workbook = XLSX.readFile(file.path);
    console.log(workbook);
    const { organization, roles } = req.user;
    if (!roles.goods) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для создания и редактирования товаров.`,
      });
    }
    const selectGroupSQL = `SELECT * FROM goods_${organization}`;
    const conn = await mysql.createConnection(dbConfig);
    conn.end();
    res.status(200).json({ oops: "" });
  } catch (e) {
    res.status(500).json({
      message:
        "Ошибка сервера: Проверьте соответствие Вашего файла с требованиями.",
    });
  }
};
