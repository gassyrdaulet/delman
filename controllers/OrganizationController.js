import mysql from "mysql2/promise";
import config from "config";
import * as dotenv from "dotenv";
import { getNameById } from "../service/UserService.js";
import { validationResult } from "express-validator";

dotenv.config();
const { PRODUCTION } = process.env;
const { dbConfigLocal, dbConfigProd } = config.get("dbConfig");
const dbConfig = PRODUCTION === "true" ? dbConfigProd : dbConfigLocal;
const unlockTablesSQL = `UNLOCK TABLES`;
const connUnlockSample = { query: () => {}, end: () => {} };

export const orgUserSchema = {
  id: null,
  admin: false,
  deliver: false,
  manager: false,
  pickup: false,
  goods: false,
  warehouse: false,
  operator: false,
  kaspi: false,
  editorder: false,
  returnorder: false,
};

export const getUsers = async (req, res) => {
  try {
    const { organization } = req.user;
    const getOrganizationUsersSQL = `SELECT owner, users FROM organizations WHERE ?`;
    const conn = await mysql.createConnection(dbConfig);
    const { owner, users } = (
      await conn.query(getOrganizationUsersSQL, { id: organization })
    )[0][0];
    const usersWithNames = [];
    await Promise.all(
      users.map(async (user) => {
        const name = await getNameById(user.id);
        if (user.id === owner) {
          usersWithNames.push({ ...user, name, owner });
          return;
        }
        usersWithNames.push({ ...user, name });
      })
    );
    await conn.end();
    res.send(usersWithNames);
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getOrgInfo = async (req, res) => {
  try {
    const { organization } = req.user;
    const getOrgInfoSQL = `SELECT * FROM organizations WHERE ?`;
    const conn = await mysql.createConnection(dbConfig);
    const orgInfo = (
      await conn.query(getOrgInfoSQL, { id: organization })
    )[0][0];
    await conn.end();
    res.send(orgInfo);
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const editOrgInfo = async (req, res) => {
  try {
    const { organization, owner } = req.user;
    if (!owner) {
      return res.status(403).json({ message: `Отказано в доступе!` });
    }
    const { newData } = req.body;
    const updateOrgSQL = `UPDATE organizations SET ? WHERE id = ${organization}`;
    const conn = await mysql.createConnection(dbConfig);
    await conn.query(updateOrgSQL, newData);
    conn.end();
    res.status(200).json({ message: "Настройки успешно сохранены." });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const addNewUser = async (req, res) => {
  try {
    const { organization, owner, roles } = req.user;
    const { newId, newUserInfo } = req.body;
    if (!roles.admin) {
      return res.status(403).json({ message: `Отказано в доступе!` });
    }
    if (newUserInfo.admin && !owner) {
      return res.status(403).json({
        message: `Только владелец магазина может создавать новых админов!`,
      });
    }
    const userDataSQL = `SELECT * FROM users WHERE id = '${newId}'`;
    const getOldOrgSQL = `SELECT * FROM organizations WHERE id = `;
    const getUsersSQL = `SELECT * FROM organizations WHERE id = '${organization}'`;
    const addOrgToUserSQL = `UPDATE users SET organization = "${organization}" WHERE id = "${newId}"`;
    const addUserForOrgSql = `UPDATE organizations SET ? WHERE id = "${organization}"`;
    const conn = await mysql.createConnection(dbConfig);
    const user = (await conn.query(userDataSQL))[0][0];
    if (!user) {
      await conn.end();
      return res
        .status(400)
        .json({ message: `Пользователь с таким ID (${newId}) не найден.` });
    }
    const oldOrg = (await conn.query(getOldOrgSQL + user.organization))[0][0];
    if (oldOrg) {
      for (let user of oldOrg.users) {
        if (user.id === newId) {
          await conn.end();
          return res.status(400).json({
            message: `Этот пользователь уже состоит в существующем магазине! Название: "${oldOrg.name}". ID:"${oldOrg.id}"`,
          });
        }
      }
    }
    const { users } = (await conn.query(getUsersSQL))[0][0];
    for (let user of users) {
      if (user.id === newId) {
        await conn.end();
        return res.status(400).json({
          message: `Пользователь с таким ID (${newId}) уже добавлен в этот магазин!`,
        });
      }
    }
    const parsedNewUser = { ...orgUserSchema };
    Object.keys(newUserInfo).forEach((key) => {
      parsedNewUser[key] = newUserInfo[key];
    });
    const secondlyParsedUser = {};
    Object.keys(orgUserSchema).forEach((key) => {
      secondlyParsedUser[key] = parsedNewUser[key];
    });
    users.push(secondlyParsedUser);
    await conn.query(addUserForOrgSql, { users: JSON.stringify(users) });
    await conn.query(addOrgToUserSQL);
    await conn.end();
    return res.status(200).json({
      message: `Пользователь "${newId}" успешно добавлен в магазин!`,
    });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const editOrgUsers = async (req, res) => {
  try {
    const { organization, roles, owner, id: userId } = req.user;
    const { editId, pickedUserInfo } = req.body;
    if (!roles.admin) {
      return res.status(403).json({ message: `Отказано в доступе!` });
    }
    if (!roles.admin && !pickedUserInfo.admin && editId === userId) {
      return res.status(403).json({
        message: `Ошибка! Нельзя понизить свою же роль! `,
      });
    }
    const userDataSQL = `SELECT * FROM users WHERE id = '${userId}'`;
    const orgDataSQL = `SELECT * FROM organizations WHERE id = '${organization}'`;
    const editOrgUsersSQL = `UPDATE organizations SET ? WHERE id = "${organization}"`;
    const conn = await mysql.createConnection(dbConfig);
    const user = (await conn.query(userDataSQL))[0][0];
    if (!user) {
      await conn.end();
      return res.status(400).json({
        message: `Пользователя с таким ID (${editId}) не существует. Вам следует удалить его из списка пользователей Вашей организации.`,
      });
    }
    const orgData = (await conn.query(orgDataSQL))[0][0];
    const { users: orgUsers, owner: orgOwner } = orgData;
    if (pickedUserInfo.admin) {
      let exInfo = {};
      for (let user of orgUsers) {
        if (user.id === editId) {
          exInfo = user;
          break;
        }
      }
      if (!exInfo.admin) {
        if (!owner) {
          await conn.end();
          return res.status(403).json({
            message: `Отказано в доступе! Только владельцы могут назначать админов! `,
          });
        }
      }
    }
    if (orgOwner === userId && !pickedUserInfo.admin && editId === userId) {
      await conn.end();
      return res.status(403).json({
        message: `Ошибка! Владелец не может понизить свою роль! `,
      });
    }
    for (let i = 0; i < orgUsers.length; i++) {
      const user = orgUsers[i];
      if (user.id === editId) {
        const parsedUserInfo = { ...orgUserSchema };
        Object.keys(pickedUserInfo).forEach((key) => {
          parsedUserInfo[key] = pickedUserInfo[key];
        });
        const secondlyParsedUser = {};
        Object.keys(orgUserSchema).forEach((key) => {
          secondlyParsedUser[key] = parsedUserInfo[key];
        });
        orgUsers[i] = secondlyParsedUser;
        await conn.query(editOrgUsersSQL, {
          users: JSON.stringify(orgUsers),
        });
        await conn.end();
        return res.status(200).json({
          message: `Пользователь "${editId}" успешно отредактирован!`,
        });
      }
    }
    await conn.end();
    return res.status(400).json({
      message: `Пользователь с таким ID (${editId}) не найден в списке пользовтелей организации!`,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const deleteUserFromOrg = async (req, res) => {
  try {
    const { owner, id: userId, organization } = req.user;
    const { deleteId } = req.body;
    if (!owner) {
      return res.status(403).json({
        message: `Отказано в доступе! Только владельцы могут удалять пользователей! `,
      });
    }
    if (deleteId === userId) {
      return res.status(403).json({
        message: `Ошибка! Нельзя удалить самого себя! `,
      });
    }
    const orgDataSQL = `SELECT * FROM organizations WHERE id = '${organization}'`;
    const editOrgUsersSQL = `UPDATE organizations SET ? WHERE id = "${organization}"`;
    const deleteOrgFromUserSQL = `UPDATE users SET organization = null WHERE id = "${deleteId}"`;
    const conn = await mysql.createConnection(dbConfig);
    const orgData = (await conn.query(orgDataSQL))[0][0];
    let deletedFound = false;
    const { users: orgUsers } = orgData;
    const deletedUsers = orgUsers.filter((item) => {
      if (item.id !== deleteId) {
        return true;
      } else {
        deletedFound = true;
        return false;
      }
    });
    if (!deletedFound) {
      await conn.end();
      return res.status(400).json({
        message: `Пользователь с таким ID (${deleteId}) не найден в списке сотрудников организации!`,
      });
    }
    await conn.query(editOrgUsersSQL, {
      users: JSON.stringify(deletedUsers),
    });
    await conn.query(deleteOrgFromUserSQL);
    await conn.end();
    return res.status(200).json({
      message: `Пользователь с ID (${deleteId}) успешно удален из списка.`,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const exitOrg = async (req, res) => {
  try {
    const { owner, id: deleteId, organization } = req.user;
    if (owner) {
      return res.status(403).json({
        message: `Владельцу нельзя покинуть свою организацию.`,
      });
    }
    const orgDataSQL = `SELECT * FROM organizations WHERE id = '${organization}'`;
    const editOrgUsersSQL = `UPDATE organizations SET ? WHERE id = "${organization}"`;
    const deleteOrgFromUserSQL = `UPDATE users SET organization = null WHERE id = "${deleteId}"`;
    const conn = await mysql.createConnection(dbConfig);
    const orgData = (await conn.query(orgDataSQL))[0][0];
    let deletedFound = false;
    const { users: orgUsers } = orgData;
    const deletedUsers = orgUsers.filter((item) => {
      if (item.id !== deleteId) {
        return true;
      } else {
        deletedFound = true;
        return false;
      }
    });
    if (!deletedFound) {
      await conn.end();
      return res.status(400).json({
        message: `Пользователь с таким ID (${deleteId}) не найден в списке сотрудников организации!`,
      });
    }
    await conn.query(editOrgUsersSQL, {
      users: JSON.stringify(deletedUsers),
    });
    await conn.query(deleteOrgFromUserSQL);
    await conn.end();
    return res.status(200).json({
      message: `Вы успешно покинули свою организацию.`,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getInvCntrlType = async (req, res) => {
  try {
    const { organization } = req.user;
    const orgDataSQL = `SELECT * FROM organizations WHERE id = '${organization}'`;
    const conn = await mysql.createConnection(dbConfig);
    const orgData = (await conn.query(orgDataSQL))[0][0];
    await conn.end();
    return res
      .status(200)
      .json({ inventorycontroltype: orgData?.inventorycontroltype });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getCashbox = async (req, res) => {
  try {
    const { organization, id: userId } = req.user;
    const getCashboxSQL = `SELECT * FROM cashboxes_${organization} WHERE open = true and responsible = ${userId} LIMIT 1`;
    const conn = await mysql.createConnection(dbConfig);
    const cashbox = (await conn.query(getCashboxSQL))[0][0];
    await conn.end();
    if (!cashbox) {
      return res.status(400).json({ message: "У вас нет открытых касс." });
    }
    return res
      .status(200)
      .json({ message: "Найдена открытая касса.", cashbox });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getCashboxes = async (req, res) => {
  try {
    const { organization } = req.user;
    const { firstDate, secondDate } = req.body;
    const getCashboxesSQL = `SELECT c.id, c.openeddate, c.closeddate, c.responsible, c.open, c.cash, u.name as username FROM cashboxes_${organization} c LEFT JOIN users u ON c.responsible = u.id WHERE openeddate BETWEEN '${firstDate}' AND '${secondDate}'`;
    const conn = await mysql.createConnection(dbConfig);
    const cashboxes = (await conn.query(getCashboxesSQL))[0];
    await conn.end();
    res.send(cashboxes);
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const newCashbox = async (req, res) => {
  try {
    const { organization, id: userId } = req.user;
    const getCashboxSQL = `SELECT * FROM cashboxes_${organization} WHERE open = true LIMIT 1`;
    const newCashboxSQL = `INSERT INTO cashboxes_${organization} SET ?`;
    const conn = await mysql.createConnection(dbConfig);
    const cashbox = (await conn.query(getCashboxSQL))[0][0];
    if (!cashbox) {
      await conn.query(newCashboxSQL, {
        responsible: userId,
        open: true,
        cash: JSON.stringify([]),
      });
      await conn.end();
      return res
        .status(200)
        .json({ message: "Новая касса была успешно открыта." });
    }
    await conn.end();
    const cashier = await getNameById(cashbox.responsible);
    return res.status(400).json({
      message:
        "Уже существует открытая касса у пользователя - " +
        cashier +
        ` (ID: ${cashbox.responsible})`,
    });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const closeCashbox = async (req, res) => {
  try {
    const { organization, id: userId } = req.user;
    const { cashboxId } = req.body;
    const getCashboxSQL = `SELECT * FROM cashboxes_${organization} WHERE id = ${cashboxId}`;
    const updateCashboxSQL = `UPDATE cashboxes_${organization} SET ? WHERE id = ${cashboxId}`;
    const conn = await mysql.createConnection(dbConfig);
    const cashbox = (await conn.query(getCashboxSQL))[0][0];
    if (!cashbox) {
      conn.end();
      return res.status(400).json({ message: "Касса не найдена." });
    }
    if (cashbox.responsible !== userId) {
      conn.end();
      return res.status(401).json({ message: "Нельзя закрыть чужую кассу!" });
    }
    await conn.query(updateCashboxSQL, { closeddate: new Date(), open: false });
    await conn.end();
    return res.status(200).json({ message: "Касса была успешно закрыта." });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const closeAnyCashbox = async (req, res) => {
  try {
    const { organization, owner } = req.user;
    if (!owner) {
      return res.status(401).json({
        message: "Вы должны являться владельцем чтобы закрыть чужую кассу.",
      });
    }
    const getCashboxSQL = `SELECT * FROM cashboxes_${organization} WHERE open = true LIMIT 1`;
    const updateCashboxSQL = `UPDATE cashboxes_${organization} SET ? WHERE id = `;
    const conn = await mysql.createConnection(dbConfig);
    const cashbox = (await conn.query(getCashboxSQL))[0][0];
    if (!cashbox) {
      conn.end();
      return res.status(400).json({ message: "Касса не найдена." });
    }
    await conn.query(updateCashboxSQL + cashbox.id, {
      closeddate: new Date(),
      open: false,
    });
    await conn.end();
    return res.status(200).json({ message: "Касса была успешно закрыта." });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const createNewOrganization = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { name } = req.body;
    const { id } = req.user;
    console.log(name, id);
    const conn = await mysql.createConnection(dbConfig);
    const insertOrganizationSQL = `INSERT INTO organizations SET ?`;
    const organizationInfoSQL = `SELECT * FROM organizations WHERE id = `;
    const userDataSql = `SELECT * FROM users WHERE id = ${id}`;
    const user = (await conn.query(userDataSql))[0][0];
    const organization = (
      await conn.query(organizationInfoSQL + `'${user.organization}'`)
    )[0][0];
    if (organization?.id) {
      await conn.end();
      return res.status(400).json({
        message:
          "Ошибка! Вы уже состоите в существующей организации! Обратитесь к администрации.",
      });
    }
    const users = [];
    const newUserInfo = { id, admin: true };
    const parsedNewUser = { ...orgUserSchema };
    Object.keys(newUserInfo).forEach((key) => {
      parsedNewUser[key] = newUserInfo[key];
    });
    const secondlyParsedUser = {};
    Object.keys(orgUserSchema).forEach((key) => {
      secondlyParsedUser[key] = parsedNewUser[key] ? parsedNewUser[key] : false;
    });
    users.push(secondlyParsedUser);
    const [insertInfo] = await conn.query(insertOrganizationSQL, {
      name,
      owner: user.id,
      users: JSON.stringify(users),
      inventorycontroltype: "lifo",
      paymentMethods: JSON.stringify([
        { id: 0, code: "cash", name: "Наличка", value: 0 },
      ]),
    });
    const { insertId } = insertInfo;
    await conn.query(
      `UPDATE users SET organization = '${insertId}' WHERE id = ${user.id}`
    );
    await conn.query(
      `CREATE TABLE archiveorders_${insertId} LIKE archiveorders`
    );
    await conn.query(
      `CREATE INDEX idx_wentdate ON archiveorders_${insertId} (wentdate)`
    );
    await conn.query(
      `CREATE INDEX idx_creationdate ON archiveorders_${insertId} (creationdate)`
    );
    await conn.query(
      `CREATE INDEX idx_delivereddate ON archiveorders_${insertId} (delivereddate)`
    );
    await conn.query(
      `CREATE INDEX idx_finisheddate ON archiveorders_${insertId} (finisheddate)`
    );
    await conn.query(`CREATE TABLE cashboxes_${insertId} LIKE cashboxes`);
    await conn.query(
      `CREATE INDEX idx_openeddate ON cashboxes_${insertId} (openeddate)`
    );
    await conn.query(
      `CREATE INDEX idx_closeddate ON cashboxes_${insertId} (closeddate)`
    );
    await conn.query(
      `CREATE TABLE deliveryLists_${insertId} LIKE deliveryLists`
    );
    await conn.query(
      `CREATE INDEX idx_date ON deliveryLists_${insertId} (date)`
    );
    await conn.query(`CREATE TABLE goods_${insertId} LIKE goods`);
    await conn.query(`CREATE TABLE orders_${insertId} LIKE orders`);
    await conn.query(`CREATE TABLE relations_${insertId} LIKE relations`);
    await conn.query(`CREATE TABLE series_${insertId} LIKE series`);
    await conn.query(`CREATE TABLE warehouse_${insertId} LIKE warehouse`);
    await conn.query(`CREATE INDEX idx_date ON warehouse_${insertId} (date)`);
    await conn.end();
    return res
      .json({
        message: "Организация успешно зарегистрирована.",
      })
      .status(200);
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка в сервере: " + e });
  }
};

export const addCashToCashbox = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const { organization, id: userId } = req.user;
    const { amount, comment } = req.body;
    if (isNaN(parseInt(amount))) {
      return res.status(400).json({ message: "Неверный формат суммы." });
    }
    if (parseInt(amount) < 0) {
      return res.status(400).json({ message: "Неверный формат суммы." });
    }
    const lockTableSQL = `LOCK TABLES cashboxes_${organization} WRITE`;
    const updateCashboxSQL = `UPDATE cashboxes_${organization} SET ? WHERE id = `;
    const unlockTablesSQL = `UNLOCK TABLES`;
    const getCashboxSQL = `SELECT * FROM cashboxes_${organization} WHERE open = true LIMIT 1`;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    const cashbox = (await conn.query(getCashboxSQL))[0][0];
    if (!cashbox) {
      conn.end();
      return res.status(400).json({ message: "Касса не найдена." });
    }
    if (cashbox.responsible !== userId) {
      conn.end();
      return res
        .status(401)
        .json({ message: "Нельзя добавить деньги в чужую кассу!" });
    }
    await conn.query(lockTableSQL);
    const { cash } = cashbox;
    const date = Date.now();
    cash.push({
      type: "add",
      amount: amount,
      method: "cash",
      comment,
      date,
    });
    await conn.query(updateCashboxSQL + cashbox.id, {
      cash: JSON.stringify(cash),
    });
    await conn.query(unlockTablesSQL);
    await conn.end();
    return res.status(200).json({
      message: "Наличка успешно добавлена!",
    });
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getSpendings = async (req, res) => {
  try {
    const { organization, roles } = req.user;
    if (!roles.admin) {
      return res.status(403).json({
        message: `Отказано в доступе!.`,
      });
    }
    const { firstDate, secondDate } = req.body;
    const getSpendingsSQL = `SELECT s.id, s.purpose, s.sum, s.user, s.comment, s.date, u.name as username FROM spendings_${organization} s LEFT JOIN users u ON s.user = u.id WHERE date BETWEEN '${firstDate}' AND '${secondDate}'`;
    const conn = await mysql.createConnection(dbConfig);
    const spendings = (await conn.query(getSpendingsSQL))[0];
    await conn.end();
    res.send(spendings);
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const newSpending = async (req, res) => {
  try {
    const { organization, id: userId, roles } = req.user;
    if (!roles.admin) {
      return res.status(403).json({
        message: `Отказано в доступе!.`,
      });
    }
    const { purpose, sum, comment, date } = req.body;
    if (isNaN(parseInt(sum))) {
      return res.status(400).json({ message: "Неверный формат суммы." });
    }
    if (parseInt(sum) < 0) {
      return res.status(400).json({ message: "Неверный формат суммы." });
    }
    const insertSpendingSQL = `INSERT INTO spendings_${organization} SET ?`;
    const conn = await mysql.createConnection(dbConfig);
    await conn.query(insertSpendingSQL, {
      purpose,
      sum,
      user: userId,
      comment,
      date: new Date(date),
    });
    await conn.end();
    return res.status(200).json({
      message: "Расход успешно добавлен!",
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const deleteSpending = async (req, res) => {
  try {
    const { organization, owner } = req.user;
    if (!owner) {
      return res.status(403).json({
        message: `Отказано в доступе!.`,
      });
    }
    const { id } = req.body;
    const deleteSpendingSQL = `DELETE FROM spendings_${organization} WHERE ?`;
    const conn = await mysql.createConnection(dbConfig);
    await conn.query(deleteSpendingSQL, { id });
    await conn.end();
    return res.status(200).json({
      message: "Расход успешно удален!",
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const removeCashFromCashbox = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const { organization, id: userId } = req.user;
    const { amount, comment } = req.body;
    if (isNaN(parseInt(amount))) {
      return res.status(400).json({ message: "Неверный формат суммы." });
    }
    if (parseInt(amount) < 0) {
      return res.status(400).json({ message: "Неверный формат суммы." });
    }
    const lockTableSQL = `LOCK TABLES cashboxes_${organization} WRITE`;
    const updateCashboxSQL = `UPDATE cashboxes_${organization} SET ? WHERE id = `;
    const unlockTablesSQL = `UNLOCK TABLES`;
    const getCashboxSQL = `SELECT * FROM cashboxes_${organization} WHERE open = true LIMIT 1`;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    const cashbox = (await conn.query(getCashboxSQL))[0][0];
    if (!cashbox) {
      conn.end();
      return res.status(400).json({ message: "Касса не найдена." });
    }
    if (cashbox.responsible !== userId) {
      conn.end();
      return res
        .status(401)
        .json({ message: "Нельзя снять деньги с чужой кассы!" });
    }
    await conn.query(lockTableSQL);
    const { cash } = cashbox;
    const date = Date.now();
    cash.push({
      type: "remove",
      amount: -1 * amount,
      method: "cash",
      comment,
      date,
    });
    await conn.query(updateCashboxSQL + cashbox.id, {
      cash: JSON.stringify(cash),
    });
    await conn.query(unlockTablesSQL);
    await conn.end();
    return res.status(200).json({
      message: "Наличка успешно снята!",
    });
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};
