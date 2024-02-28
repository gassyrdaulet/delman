import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import config from "config";
import * as dotenv from "dotenv";
import { customAlphabet } from "nanoid";
import nodemailer from "nodemailer";
import { validationResult } from "express-validator";
// console.log(await bcrypt.hash("Dauletov234567!", 5));

dotenv.config();
const {
  PRODUCTION,
  LOGIN_TOKEN_LT,
  LOGIN_TOKEN_LT_MS,
  SECRET_KEY,
  CODE_EVERY_MS,
  EMAIL_SENDER,
  EMAIL_PASSWORD,
} = process.env;
const { dbConfigLocal, dbConfigProd } = config.get("dbConfig");
const dbConfig = PRODUCTION === "true" ? dbConfigProd : dbConfigLocal;
const codeEveryMs = parseInt(CODE_EVERY_MS);

const transport = nodemailer.createTransport({
  service: "Mail.ru",
  auth: {
    user: EMAIL_SENDER,
    pass: EMAIL_PASSWORD,
  },
});

const generateAccesToken = (id, user_uid) => {
  const payload = {
    id,
    user_uid,
  };
  return jwt.sign(payload, SECRET_KEY, {
    expiresIn: LOGIN_TOKEN_LT,
  });
};

const sendConfirmationEmail = (name, email, confirmationCode) => {
  transport
    .sendMail({
      from: EMAIL_SENDER,
      to: email,
      subject: "Код для подтверждения аккаунта /  Смены пароля",
      html: `<h1>Подтверждение E-mail</h1>
          <h2>Привет, ${name}!</h2>
          <p>Пожалуйста, подтвердите код!</p>
          <center><h1>${confirmationCode}</h1></center>
          </div>`,
    })
    .catch((err) => console.log(err));
};

export const ping = async (req, res) => {
  try {
    res.status(200).json({ message: "OK" });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const conn = await mysql.createConnection(dbConfig);
    const { email, password } = req.body;
    const SQL = `SELECT * FROM users WHERE email = '${email}'`;
    const user = (await conn.query(SQL))[0][0];
    if (!user) {
      await conn.end();
      return res
        .status(400)
        .json({ message: "Пользователь с таким E-mail не найден." });
    }
    if (user.activated === 0) {
      await conn.end();
      return res
        .status(200)
        .json({ message: "Пожалуйста, подтвердите ваш E-mail!", email });
    }
    const isPassValid = bcrypt.compareSync(password, user.password);
    if (!isPassValid) {
      await conn.end();
      return res.status(400).json({ message: "Неверный пароль." });
    }
    conn.end();
    const token = generateAccesToken(user.id, user.uid);
    delete user.password;
    delete user.confirmCode;
    return res.send({
      cookie: {
        name: "X-Auth-Token",
        value: token,
        maxAge: parseInt(LOGIN_TOKEN_LT_MS),
      },
      user,
    });
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const registration = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { email, name, password } = req.body;
    const getUserSQL = `SELECT * FROM users WHERE email = '${email}'`;
    const insertUserSQL = `INSERT INTO users SET ?`;
    const conn = await mysql.createConnection(dbConfig);
    const candidate = (await conn.query(getUserSQL))[0][0];
    if (candidate) {
      await conn.end();
      return res
        .status(400)
        .json({ message: "Пользователь с таким e-mail уже существует." });
    } else {
      const hashPassword = await bcrypt.hash(password, 5);
      const nanoidForConfirmationCode = customAlphabet(
        "1234567890abcdefghijklmnopqrstuvwxyz",
        7
      );
      // const confirmationcCode = nanoidForConfirmationCode();
      const confirmationcCode = "123";
      sendConfirmationEmail(name, email, confirmationcCode);
      await conn.query(insertUserSQL, {
        email: email.toLowerCase(),
        name,
        codeDate: Date.now().toString(),
        confirmCode: confirmationcCode,
        password: hashPassword,
      });
      await conn.end();
      return res
        .json({
          message:
            "Пользователь успешно зарегистрирован. Код для подтверждения: 123",
        })
        .status(200);
    }
  } catch (e) {
    res.status(500).json({ message: "Server error: " + e });
  }
};

export const sendCode = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { email } = req.body;
    const codeDate = Date.now() + "";
    const nanoidForConfirmationCode = customAlphabet(
      "1234567890abcdefghijklmnopqrstuvwxyz",
      7
    );
    // const confirmationCode = nanoidForConfirmationCode();
    const confirmationCode = "123";
    const sql = `SELECT * FROM users WHERE ?`;
    const sql2 = `UPDATE users SET ? WHERE email = "${email}"`;
    const conn = await mysql.createConnection(dbConfig);
    const candidate = (await conn.query(sql, { email }))[0][0];
    if (!candidate) {
      await conn.end();
      return res
        .status(400)
        .json({ message: "Пользователь с таким e-mail не существует!" });
    }
    if (Date.now() - parseInt(candidate.codeDate) < codeEveryMs) {
      await conn.end();
      const nextCodeTime =
        codeEveryMs - (Date.now() - parseInt(candidate.codeDate));
      const minutes = Math.floor(nextCodeTime / 60000);
      const seconds = Math.floor((nextCodeTime - minutes * 60000) / 1000);
      return res.status(400).json({
        message: `Новый код можно будет отправить только через ${
          minutes !== 0 ? minutes + " минуты и " : ""
        }${seconds} секунд.`,
      });
    }
    sendConfirmationEmail(candidate.name, email, confirmationCode);
    await conn.query(sql2, { confirmCode: confirmationCode, codeDate });
    res.status(200).json({ message: "Код: 123" });
    conn.end();
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка! " + e });
  }
};

export const confirmAccount = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { code, email } = req.body;
    const sql = `SELECT * FROM users WHERE ?`;
    const conn = await mysql.createConnection(dbConfig);
    const candidate = (await conn.query(sql, { email }))[0][0];
    if (!candidate) {
      await conn.end();
      return res
        .status(400)
        .json({ message: "Пользователь с таким e-mail не существует!" });
    }
    if (candidate.activated === 1) {
      await conn.end();
      return res
        .status(400)
        .json({ message: "Аккаунт с таким E-mail уже активирован!" });
    }
    if (candidate.confirmCode !== code) {
      await conn.end();
      return res.status(400).json({ message: "Неверный код!" });
    }
    const sql2 = `UPDATE users SET ? WHERE id = ${candidate.id}`;
    await conn.query(sql2, { activated: 1 });
    res.status(200).json({ message: "Аккаунт успешно подтвержден!" });
    conn.end();
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка! " + e });
  }
};

export const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { code, email, password } = req.body;
    const sql = `SELECT * FROM users WHERE email = "${email}"`;
    const conn = await mysql.createConnection(dbConfig);
    const candidate = (await conn.query(sql))[0][0];
    if (!candidate) {
      await conn.end();
      return res
        .status(400)
        .json({ message: "Пользователь с таким e-mail не существует!" });
    }
    if (candidate.confirmCode !== code) {
      conn.end();
      return res.status(400).json({ message: "Неверный код!" });
    }
    const hashPassword = await bcrypt.hash(password, 5);
    const nanoidForConfirmationCode = customAlphabet(
      "1234567890abcdefghijklmnopqrstuvwxyz",
      7
    );
    const confirmationCode = nanoidForConfirmationCode();
    const sql2 = `UPDATE users SET ? WHERE id = ${candidate.id}`;
    await conn.query(sql2, {
      password: hashPassword,
      confirmCode: confirmationCode,
    });
    res.status(200).json({ message: "Пароль успешно сменился!" });
    conn.end();
  } catch (e) {
    res.status(500).json({ message: "Ошибка! " + e });
  }
};

export const getToken = async (req, res) => {
  try {
    const { id } = req.body;
    const getUserSQL = `SELECT * FROM users WHERE id = "${id}"`;
    const conn = await mysql.createConnection(dbConfig);
    const candidate = (await conn.query(getUserSQL))[0][0];
    if (!candidate) {
      await conn.end();
      return res
        .status(400)
        .json({ message: "Пользователь с таким ID не существует!" });
    }
    res.status(200).json({ token: candidate.kaspitoken });
    conn.end();
  } catch (e) {
    res.status(500).json({ message: "Ошибка! " + e });
  }
};

export const getUserData = async (req, res) => {
  try {
    const { id } = req.user;
    const getUserSQL = `SELECT * FROM users WHERE id = "${id}"`;
    const conn = await mysql.createConnection(dbConfig);
    const candidate = (await conn.query(getUserSQL))[0][0];
    if (!candidate) {
      await conn.end();
      return res
        .status(400)
        .json({ message: "Пользователь с таким ID не существует!" });
    }
    delete candidate.password;
    delete candidate.confirmCode;
    res.status(200).json(candidate);
    conn.end();
  } catch (e) {
    res.status(500).json({ message: "Ошибка! " + e });
  }
};

export const editUserData = async (req, res) => {
  try {
    const { id } = req.user;
    const { name, kaspitoken } = req.body;
    const getUserSQL = `SELECT * FROM users WHERE id = "${id}"`;
    const updateUserSQL = `UPDATE users SET ? WHERE id = "${id}"`;
    const conn = await mysql.createConnection(dbConfig);
    const candidate = (await conn.query(getUserSQL))[0][0];
    if (!candidate) {
      await conn.end();
      return res
        .status(400)
        .json({ message: "Пользователь с таким ID не существует!" });
    }
    await conn.query(updateUserSQL, { name, kaspitoken });
    res
      .status(200)
      .json({ message: "Вы успешно отредактировали свой аккаунт!" });
    conn.end();
  } catch (e) {
    res.status(500).json({ message: "Ошибка! " + e });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    const { id } = req.user;
    const getUserSQL = `SELECT * FROM users WHERE id = ${id}`;
    const deleteUserSQL = `DELETE FROM users WHERE id = ${id}`;
    const orgDataSQL = `SELECT * FROM organizations WHERE id = `;
    const conn = await mysql.createConnection(dbConfig);
    const user = (await conn.query(getUserSQL))[0][0];
    if (!user) {
      await conn.end();
      return res.status(400).json({
        message: `Пользователь не найден!`,
      });
    }
    const orgData = (
      await conn.query(orgDataSQL + `'${user.organization}'`)
    )[0][0];
    if (orgData?.id) {
      await conn.end();
      return res.status(400).json({
        message: `Вы состоите в организации "${orgData.name}" (ID: ${orgData.id}). Пожалуйста, сперва покиньте эту организацию.`,
      });
    } else {
      await conn.query(deleteUserSQL);
      res.status(200).json({ message: "Аккаунт успешно удален!" });
      await conn.end();
    }
  } catch (e) {
    res.status(500).json({ message: "Ошибка! " + e });
  }
};

export const editAccount = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { id } = req.user;
    const { data } = req.body;
    const getUserSQL = `SELECT * FROM users WHERE id = ${id}`;
    const updateUserSQL = `UPDATE users SET ? WHERE id = ${id}`;
    const conn = await mysql.createConnection(dbConfig);
    const user = (await conn.query(getUserSQL))[0][0];
    if (!user) {
      await conn.end();
      return res.status(400).json({
        message: `Пользователь не найден!`,
      });
    }
    await conn.query(updateUserSQL, data);
    res.status(200).json({ message: "Аккаунт успешно отредактирован!" });
    await conn.end();
  } catch (e) {
    res.status(500).json({ message: "Ошибка! " + e });
  }
};
