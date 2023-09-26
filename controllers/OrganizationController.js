import mysql from "mysql2/promise";
import config from "config";
import * as dotenv from "dotenv";
import { getNameById } from "../service/UserService.js";

dotenv.config();
const { PRODUCTION } = process.env;
const { dbConfigLocal, dbConfigProd } = config.get("dbConfig");
const dbConfig = PRODUCTION === "true" ? dbConfigProd : dbConfigLocal;

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
      return res
        .status(400)
        .json({ message: "Нет открытых касс на этом аккаунте." });
    }
    return res
      .status(200)
      .json({ message: "Найдена открытая касса.", cashbox });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const newCashbox = async (req, res) => {
  try {
    const { organization, id: userId } = req.user;
    const newCashboxSQL = `INSERT INTO cashboxes_${organization} SET ?`;
    const conn = await mysql.createConnection(dbConfig);
    await conn.query(newCashboxSQL, { responsible: userId, open: true });
    await conn.end();
    return res
      .status(200)
      .json({ message: "Новая касса была успешно открыта." });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const closeCashbox = async (req, res) => {
  try {
    const { organization } = req.user;
    const { cashboxId } = req.body;
    const getCashboxSQL = `SELECT * FROM cashboxes_${organization} WHERE id = ${cashboxId}`;
    const updateCashboxSQL = `UPDATE cashboxes_${organization} SET ? WHERE id = ${cashboxId}`;
    const conn = await mysql.createConnection(dbConfig);
    const cashbox = (await conn.query(getCashboxSQL))[0][0];
    if (!cashbox) {
      conn.end();
      return res.status(400).json({ message: "Касса не найдена." });
    }
    await conn.query(updateCashboxSQL, { closeddate: new Date(), open: false });
    await conn.end();
    return res.status(200).json({ message: "Касса была успешно закрыта." });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};
