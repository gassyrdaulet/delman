import mysql from "mysql2/promise";
import config from "config";
import * as dotenv from "dotenv";
import { validationResult } from "express-validator";
import { getNameById } from "../service/UserService.js";
import { getRemainder } from "../service/GoodService.js";
import axios from "axios";

dotenv.config();
const bitrix_url = "";
const { PRODUCTION } = process.env;
const { dbConfigLocal, dbConfigProd } = config.get("dbConfig");
const dbConfig = PRODUCTION === "true" ? dbConfigProd : dbConfigLocal;
const unlockTablesSQL = `UNLOCK TABLES`;
const connUnlockSample = { query: () => {}, end: () => {} };

const orderValidator = (order) => {
  try {
    const { goods, delivery, payment, discount } = order;
    if (!goods || goods.length === 0) {
      return { status: 400, message: "Добавьте товаров!", error: true };
    }
    if (!payment) {
      return {
        status: 400,
        message: "Оплата не может оставаться пустой!",
        error: true,
      };
    }
    for (let item of goods) {
      if (item.quantity === 0) {
        return {
          status: 400,
          message: "Нельзя оставлять товар с нулевым количеством!",
          error: true,
        };
      }
    }
    let tempSum = 0;
    goods.forEach(
      (good) =>
        (tempSum +=
          good.quantity * good.price -
          (good.discount.type === "percent"
            ? ((good.price * good.discount.amount) / 100) * good.quantity
            : good.discount.amount * good.quantity))
    );
    const deliveryPrice = parseInt(delivery["deliveryPriceForCustomer"]);
    tempSum += isNaN(deliveryPrice) ? 0 : deliveryPrice;
    const sum = tempSum;
    const sumWithDiscount =
      sum -
      (discount.type === "percent"
        ? (sum * discount.amount) / 100
        : discount.amount);
    let paymentTempSum = 0;
    payment.forEach((item) => {
      paymentTempSum += item.sum;
    });
    const paymentSum = paymentTempSum;
    const difference = paymentSum - sumWithDiscount;
    if (difference > 0) {
      return {
        status: 400,
        message: "Переплата!",
        error: true,
      };
    }
    return { error: false };
  } catch (e) {
    return {
      error: true,
      status: 500,
      message: "Ошибка в сервере: " + e.message,
      e,
    };
  }
};

const returnGoods = async (goods, organization, conn, insertId) => {
  try {
    const getRemainderSQL = `SELECT * FROM goods_${organization} where id = `;
    const updateGoodSQL = `UPDATE goods_${organization} SET ? where id = `;
    const insertGoodSQL = `INSERT INTO goods_${organization} SET ? `;
    const date = new Date();
    await Promise.all(
      goods.map(async (good) => {
        const goodInfo = (await conn.query(getRemainderSQL + good.id))[0][0];
        if (!goodInfo) {
          const { latestBarcode } = (
            await conn.query(
              `SELECT MAX(barcode) latestBarcode from goods_${organization}`
            )
          )[0][0];
          await conn.query(insertGoodSQL, {
            barcode: latestBarcode,
            name: good.name,
            price: good.price,
            unit: "шт.",
            series: null,
            remainder: JSON.stringify([
              {
                id: insertId,
                date,
                price: good.purchase,
                quantity: good.quantity,
              },
            ]),
          });
          return;
        }
        const remainder = goodInfo?.remainder;
        const temp = remainder?.length
          ? [
              ...remainder,
              {
                id: insertId,
                date,
                quantity: good.quantity,
                price: good.purchase,
              },
            ]
          : [
              {
                id: insertId,
                date,
                quantity: good.quantity,
                price: good.purchase,
              },
            ];
        await conn.query(updateGoodSQL + good.id, {
          remainder: JSON.stringify(temp),
        });
      })
    );
  } catch (e) {
    throw e;
  }
};

export const getOrders = async (req, res) => {
  try {
    const { organization } = req.user;
    const { status: deliverystatus } = req.query;
    const getOrdersSQL = `SELECT o.id, o.goods, o.iskaspi,o.kaspiinfo, o.countable, o.creationdate, o.deliveryinfo, o.status, o.deliverystatus, o.comment, o.discount, o.delivery, o.payment, o.author AS authorId, o.deliver AS deliverId, u.name AS author, u2.name AS deliver FROM orders_${organization} o LEFT JOIN users u ON o.author = u.id LEFT JOIN users u2 ON o.deliver = u2.id WHERE o.forincrement = false`;
    const conn = await mysql.createConnection(dbConfig);
    const orders = (
      await conn.query(
        getOrdersSQL + (deliverystatus === "all" ? "" : " AND ?"),
        { "o.deliverystatus": deliverystatus }
      )
    )[0];
    conn.end();
    res.send(orders);
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getFinishedOrders = async (req, res) => {
  try {
    const { organization } = req.user;
    const { firstDate, secondDate, dateType, delivery } = req.body;
    const getFinishedOrdersSQL = `SELECT a.id, a.status, a.goods, a.${
      dateType ? dateType : "finisheddate"
    },a.kaspiinfo, a.countable, a.creationdate, a.deliveryinfo,a.comment, a.deliver AS deliverId , a.delivery, a.author AS authorId, a.discount, a.payment, a.wasReturned, a.deliverystatus, a.isKaspi , u.name AS author, u2.name AS deliver FROM archiveorders_${organization} a LEFT JOIN users u ON a.author=u.id LEFT JOIN users u2 ON a.deliver=u2.id WHERE ${
      delivery === null ? "" : `a.delivery = ${delivery} AND`
    } a.${
      dateType ? dateType : "finisheddate"
    } BETWEEN '${firstDate}' AND '${secondDate}'`;
    const conn = await mysql.createConnection(dbConfig);
    const finishedOrders = (await conn.query(getFinishedOrdersSQL))[0];
    conn.end();
    res.send(finishedOrders);
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getFinishedOrdersForSummary = async (req, res) => {
  try {
    const { organization } = req.user;
    const { firstDate, secondDate, dateType } = req.body;
    const getFinishedOrdersSQL = `SELECT id, status, goods,${
      dateType ? dateType : "finisheddate"
    },kaspiinfo, countable, deliveryinfo, creationdate, deliver, delivery, author as authorId, discount, payment, wasReturned, deliverystatus, isKaspi  FROM archiveorders_${organization} WHERE ${
      dateType ? dateType : "finisheddate"
    } BETWEEN '${firstDate}' AND '${secondDate}'`;
    const conn = await mysql.createConnection(dbConfig);
    const finishedOrders = (await conn.query(getFinishedOrdersSQL))[0];
    conn.end();
    res.send(finishedOrders);
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getDeliveryLists = async (req, res) => {
  try {
    const { organization } = req.user;
    const { firstDate, secondDate } = req.body;
    const getDeliveryLists = `SELECT d.id, d.deliveries, d.deliver as deliverId, u.name as deliver, d.date, d.comment, d.cash FROM deliveryLists_${organization} d LEFT JOIN users u ON d.deliver = u.id WHERE d.date BETWEEN '${firstDate}' AND '${secondDate}'`;
    const conn = await mysql.createConnection(dbConfig);
    const deliveryLists = (await conn.query(getDeliveryLists))[0];
    conn.end();
    res.send(deliveryLists);
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const getOrderDetails = async (req, res) => {
  try {
    const { organization } = req.user;
    const { id } = req.query;
    const getOrderSQL = `SELECT o.id, o.history, o.goods, o.creationdate, o.wentdate, o.delivereddate, o.comment,o.finisheddate, o.kaspiinfo, o.countable, o.deliveryinfo, o.deliver, o.delivery, o.author, o.discount, o.cashier, o.payment, o.deliverystatus, o.status, o.wasReturned, o.isKaspi, o.forincrement, o.deliver as deliverId, o.cashier as cashierId, o.author as authorId, u.name as deliver, u2.name as cashier, u3.name as author FROM orders_${organization} o LEFT JOIN users u ON o.deliver = u.id LEFT JOIN users u2 ON o.cashier = u2.id LEFT JOIN users u3 ON o.author = u3.id WHERE o.forincrement = false AND ?`;
    const getFinishedOrderSQL = `SELECT o.id, o.history, o.goods, o.creationdate, o.wentdate, o.delivereddate, o.comment,o.finisheddate, o.kaspiinfo, o.countable, o.deliveryinfo, o.deliver, o.author, o.discount, o.cashier, o.payment, o.deliverystatus, o.status, o.wasReturned, o.isKaspi, o.forincrement, o.deliver as deliverId, o.cashier as cashierId, o.author as authorId, u.name as deliver, u2.name as cashier, u3.name as author  FROM archiveorders_${organization} o LEFT JOIN users u ON o.deliver = u.id LEFT JOIN users u2 ON o.cashier = u2.id LEFT JOIN users u3 ON o.author = u3.id WHERE o.forincrement = false AND ?`;
    const conn = await mysql.createConnection(dbConfig);
    const activeCandidate = (
      await conn.query(getOrderSQL, { "o.id": id })
    )[0][0];
    const archiveCandidate = (
      await conn.query(getFinishedOrderSQL, { "o.id": id })
    )[0][0];
    const order = activeCandidate ? activeCandidate : archiveCandidate;
    conn.end();
    if (!order) {
      return res.status(400).json({ message: "Заказ не найден!" });
    }
    await Promise.all(
      order.goods.map(async (item) => {
        const remainder = await getRemainder(item.id, organization);
        item.remainder = remainder + parseInt(item.quantity);
      })
    );
    await Promise.all(
      order.history.map(async (history) => {
        history.user = await getNameById(history.user);
      })
    );
    res.send(order);
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const sendDeliver = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const { organization, roles } = req.user;
    if (!roles.operator) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для контроля доставок.`,
      });
    }
    const { ids, deliver } = req.body;
    const lockTableSQL = `LOCK TABLES orders_${organization} WRITE`;
    const getUserInfoSQL = `SELECT * from users WHERE id = ${deliver}`;
    const getOrderInfoSQL = `SELECT * from orders_${organization} WHERE id = `;
    const updateOrderSQL = `UPDATE orders_${organization} SET ? WHERE id = `;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    const user = (await conn.query(getUserInfoSQL))[0][0];
    if (!user) {
      conn.end();
      return res
        .status(400)
        .json({ message: "Такого пользователя не существует!" });
    }
    if (user.organization !== organization) {
      conn.end();
      return res.status(400).json({
        message: "Ошибка! Этот пользователь состоит в другой организации.",
      });
    }
    await conn.query(lockTableSQL);
    let succededOrders = 0;
    let error = "";
    await Promise.all(
      ids.map(async (id) => {
        const order = (await conn.query(getOrderInfoSQL + id))[0][0];
        if (!order) {
          error = `Заказ с номером [ID: ${id}] не найден!`;
          return;
        }
        if (order.deliverystatus !== "new") {
          error = `Заказ с номером [ID: ${id}] должен быть со статусом [НОВЫЙ]!`;
          return;
        }
        const history = order.history;
        const now = new Date();
        history.push({
          action: "sent",
          user: deliver,
          date: now.getTime(),
        });
        await conn.query(updateOrderSQL + id, {
          deliver,
          deliverystatus: "delivering",
          wentdate: now,
          history: JSON.stringify(history),
        });
        succededOrders++;
      })
    );
    await conn.query(unlockTablesSQL);
    conn.end();
    if (succededOrders === 0) {
      conn.end();
      return res.status(400).json({
        message: error,
      });
    }
    res
      .status(200)
      .json({ message: `Заказы успешно отправлены (${succededOrders}).` });
  } catch (e) {
    console.log(e);
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const issueOrder = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const { organization, id, roles } = req.user;
    const { orderId, payment } = req.body;
    const lockTableSQL = `LOCK TABLES orders_${organization} WRITE`;
    const getOrderInfoSQL = `SELECT * from orders_${organization} WHERE id = `;
    const updateOrderSQL = `UPDATE orders_${organization} SET ? WHERE id = `;
    const conn = await mysql.createConnection(dbConfig);
    await conn.query(lockTableSQL);
    connUnlock = conn;
    const order = (await conn.query(getOrderInfoSQL + orderId))[0][0];
    if (!order) {
      conn.end();
      res
        .status(400)
        .json({ message: `Заказ с номером [ID: ${id}] не найден!` });
      return;
    }
    if (order.deliverystatus !== "delivering") {
      conn.end();
      res.status(400).json({
        message: `Заказ должен быть со статусом [НА ДОСТАВКЕ]!`,
      });
      return;
    }
    if (!roles.operator && order.delivery === 0) {
      conn.end();
      res
        .status(400)
        .json({ message: `Только оператор может подтверждать самовывоз!` });
      return;
    }
    const {
      goods,
      history,
      payment: oldPayment,
      deliveryinfo: delivery,
      discount,
    } = order;
    let tempSum = 0;
    goods.forEach(
      (good) =>
        (tempSum +=
          good.quantity * good.price -
          (good.discount.type === "percent"
            ? ((good.price * good.discount.amount) / 100) * good.quantity
            : good.discount.amount * good.quantity))
    );
    const deliveryPrice = parseInt(delivery["deliveryPriceForCustomer"]);
    tempSum += isNaN(deliveryPrice) ? 0 : deliveryPrice;
    const sum = tempSum;
    const sumWithDiscount =
      sum -
      (discount.type === "percent"
        ? (sum * discount.amount) / 100
        : discount.amount);
    let paymentTempSum = 0;
    oldPayment.forEach((item) => {
      paymentTempSum += item.sum;
    });
    const oldPaymentSum = paymentTempSum;
    let newPaymentTempSum = 0;
    payment.forEach((item) => {
      newPaymentTempSum += item.sum;
    });
    const newPaymentSum = newPaymentTempSum;
    const difference = oldPaymentSum + newPaymentSum - sumWithDiscount;
    if (difference > 0) {
      conn.end();
      return res.status(400).json({ message: `Переплата!` });
    }
    if (difference < 0) {
      conn.end();
      return res.status(400).json({ message: `Недоплата` });
    }
    const newPayment = [
      ...oldPayment,
      ...payment.map((item) => {
        if (item.method === "cash" || item.method === "kaspigold") {
          return { ...item, user: "deliver" };
        }
        return { ...item, user: "deliverremote" };
      }),
    ].filter((item) => {
      return item.sum !== 0;
    });
    const now = new Date();
    history.push({
      action: "issued",
      user: id,
      date: now.getTime(),
    });
    await conn.query(updateOrderSQL + orderId, {
      deliverystatus: "processing",
      history: JSON.stringify(history),
      payment: JSON.stringify(newPayment),
      delivereddate: now,
      status: "processing",
    });
    await conn.query(unlockTablesSQL);
    conn.end();
    res.status(200).json({ message: `Заказ успешно выдан.` });
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const issuePickup = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const { organization, id, roles } = req.user;
    const { orderId, payment } = req.body;
    const lockTableSQL2 = `LOCK TABLES cashboxes_${organization} WRITE, orders_${organization} WRITE`;
    const lockTableSQL = `LOCK TABLES orders_${organization} WRITE, archiveorders_${organization} WRITE`;
    const deleteOrderSQL = `DELETE from orders_${organization} WHERE id = `;
    const getOrderInfoSQL = `SELECT * from orders_${organization} WHERE id = `;
    const getCashboxSQL = `SELECT * FROM cashboxes_${organization} WHERE open = true and responsible = ${id} LIMIT 1`;
    const updateCashboxSQL = `UPDATE cashboxes_${organization} SET ? WHERE id = `;
    const insertOrderSQL = `INSERT INTO archiveorders_${organization} SET ?`;
    const conn = await mysql.createConnection(dbConfig);
    await conn.query(lockTableSQL);
    connUnlock = conn;
    const order = (await conn.query(getOrderInfoSQL + orderId))[0][0];
    if (!order) {
      conn.end();
      res
        .status(400)
        .json({ message: `Заказ с номером [ID: ${id}] не найден!` });
      return;
    }
    if (order.deliverystatus !== "pickup") {
      conn.end();
      res.status(400).json({
        message: `Заказ должен быть со статусом [САМОВЫВОЗ]!`,
      });
      return;
    }
    if (!roles.operator) {
      conn.end();
      res
        .status(400)
        .json({ message: `Вы не являетесь менеджером этого заказа!` });
      return;
    }
    const { goods, history, payment: oldPayment, discount } = order;
    let tempSum = 0;
    goods.forEach(
      (good) =>
        (tempSum +=
          good.quantity * good.price -
          (good.discount.type === "percent"
            ? ((good.price * good.discount.amount) / 100) * good.quantity
            : good.discount.amount * good.quantity))
    );
    const sum = tempSum;
    const sumWithDiscount =
      sum -
      (discount.type === "percent"
        ? (sum * discount.amount) / 100
        : discount.amount);
    let paymentTempSum = 0;
    oldPayment.forEach((item) => {
      paymentTempSum += item.sum;
    });
    const oldPaymentSum = paymentTempSum;
    let newPaymentTempSum = 0;
    payment.forEach((item) => {
      newPaymentTempSum += item.sum;
    });
    const newPaymentSum = newPaymentTempSum;
    const difference = oldPaymentSum + newPaymentSum - sumWithDiscount;
    if (difference > 0) {
      conn.end();
      return res.status(400).json({ message: `Переплата!` });
    }
    if (difference < 0) {
      conn.end();
      return res.status(400).json({ message: `Недоплата` });
    }
    const newPayment = [
      ...oldPayment,
      ...payment.map((item) => {
        return { ...item, user: "cashier" };
      }),
    ].filter((item) => {
      return item.sum !== 0;
    });
    const now = new Date();
    history.push({
      action: "issued",
      user: id,
      date: now.getTime(),
    });
    history.push({
      action: "finished",
      user: id,
      date: now.getTime(),
    });
    const finishedOrder = order;
    finishedOrder.history = JSON.stringify(history);
    finishedOrder.goods = JSON.stringify(finishedOrder.goods);
    finishedOrder.kaspiinfo = JSON.stringify(finishedOrder.kaspiinfo);
    finishedOrder.deliveryinfo = JSON.stringify(finishedOrder.deliveryinfo);
    finishedOrder.discount = JSON.stringify(finishedOrder.discount);
    finishedOrder.payment = JSON.stringify(newPayment);
    finishedOrder.finisheddate = now;
    finishedOrder.status = "finished";
    await conn.query(insertOrderSQL, finishedOrder);
    await conn.query(deleteOrderSQL + order.id);
    await conn.query(unlockTablesSQL);
    if (order.countable === 1) {
      await conn.query(lockTableSQL2);
      const cashbox = (await conn.query(getCashboxSQL))[0][0];
      if (!cashbox) {
        await conn.query(unlockTablesSQL);
        res.status(200).json({
          message: `Заказ успешно выдан.`,
          receiptId: order.id,
          receiptDate: now.getTime(),
        });
      }
      const date = Date.now();
      const { cash } = cashbox;
      newPayment.forEach((item) => {
        cash.push({
          type: "sale",
          amount: item.sum,
          method: item.method,
          comment: "Самовывоз #" + finishedOrder?.id,
          date,
        });
      });
      await conn.query(updateCashboxSQL + cashbox.id, {
        cash: JSON.stringify(cash),
      });
      await conn.query(unlockTablesSQL);
    }
    conn.end();
    res.status(200).json({
      message: `Заказ успешно выдан.`,
      receiptId: order.id,
      receiptDate: now.getTime(),
    });
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const finishOrder = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const { organization, id, roles } = req.user;
    if (!roles.operator) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для контроля доставок.`,
      });
    }
    const { orderIds, deliver, deliveryList, comment, cash } = req.body;
    const lockTablesSQL = `LOCK TABLES archiveorders_${organization} WRITE, orders_${organization}  WRITE, goods_${organization}  WRITE, deliveryLists_${organization} WRITE`;
    const getOrdersSQL = `SELECT * FROM orders_${organization} where id IN(${orderIds.join()})`;
    const insertSQL = `INSERT INTO warehouse_${organization} SET ?`;
    const deleteInventorySQL = `DELETE FROM warehouse_${organization} where id = `;
    const insertDeliveryList = `INSERT INTO deliveryLists_${organization} SET ?`;
    const getOrderInfoSQL = `SELECT * from orders_${organization} WHERE id = `;
    const deleteOrderSQL = `DELETE from orders_${organization} WHERE id = `;
    const insertOrderInfoSQL = `INSERT INTO archiveorders_${organization} SET ?`;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    let succededOrders = 0;
    let error = "";
    const date = new Date();
    const [insertInfoWarehouse] = await conn.query(insertSQL, {
      goods: JSON.stringify([]),
      date: new Date(date),
      type: "acceptance",
      comment: "",
    });
    const { insertId: insertIdWarehouse } = insertInfoWarehouse;
    await conn.query(deleteInventorySQL + insertIdWarehouse);
    await conn.query(lockTablesSQL);
    const orders = (await conn.query(getOrdersSQL))[0];
    let filteredOrders = orderIds;
    for (let order of orders) {
      filteredOrders = filteredOrders.filter(
        (item) => parseInt(item) !== order.id
      );
      if (order.deliveryStatus === "pickup") {
        await conn.query(unlockTablesSQL);
        await conn.end();
        return res.status(400).json({
          message: "Заказ не должен быть самовывозом!",
        });
      }
      if (order.deliver !== deliver) {
        await conn.query(unlockTablesSQL);
        await conn.end();
        return res.status(400).json({
          message: "У всех подтверждающихся заказов должен быть один курьер!",
        });
      }
      if (order.deliverystatus !== "processing") {
        await conn.query(unlockTablesSQL);
        await conn.end();
        return res.status(400).json({
          message: `Заказ [${order.id}] должен быть со статусом [НА ОБРАБОТКЕ]!`,
        });
      }
    }
    if (filteredOrders.length !== 0) {
      await conn.query(unlockTablesSQL);
      await conn.end();
      return res.status(400).json({
        message: `Заказы [${filteredOrders.join()}] не найдены!`,
      });
    }
    await Promise.all(
      orderIds.map(async (orderId) => {
        const order = (await conn.query(getOrderInfoSQL + orderId))[0][0];
        const { history, goods } = order;
        const now = new Date();
        history.push({
          action: "finished",
          user: id,
          date: now.getTime(),
        });
        const oldStatus = order.status;
        if (oldStatus === "cancelled") {
          await returnGoods(goods, organization, conn, insertIdWarehouse);
        }
        const finishedOrder = order;
        finishedOrder.history = JSON.stringify(history);
        finishedOrder.goods = JSON.stringify(finishedOrder.goods);
        finishedOrder.kaspiinfo = JSON.stringify(finishedOrder.kaspiinfo);
        for (let delivery of deliveryList) {
          if (delivery.id + "" === order.id + "") {
            finishedOrder.deliveryinfo.deliveryPriceForDeliver =
              delivery.deliveryPay;
          }
        }
        finishedOrder.deliveryinfo = JSON.stringify(finishedOrder.deliveryinfo);
        finishedOrder.discount = JSON.stringify(finishedOrder.discount);
        finishedOrder.payment = JSON.stringify(finishedOrder.payment);
        finishedOrder.finisheddate = now;
        finishedOrder.status =
          oldStatus === "cancelled" ? "cancelled" : "finished";
        finishedOrder.deliverystatus =
          oldStatus === "cancelled" ? "cancelled" : "finished";
        await conn.query(deleteOrderSQL + orderId);
        await conn.query(insertOrderInfoSQL, finishedOrder);
        if (finishedOrder.bitrix_id) {
          await axios.post(bitrix_url + "crm.deal.update", {
            id: finishedOrder.bitrix_id,
            fields: {
              STAGE_ID: "WON",
            },
          });
        }
        succededOrders++;
      })
    );
    if (succededOrders === 0) {
      await conn.query(unlockTablesSQL);
      conn.end();
      return res.status(400).json({
        message: error,
      });
    }
    await conn.query(insertDeliveryList, {
      deliveries: JSON.stringify(deliveryList),
      deliver,
      comment,
      cash,
    });
    await conn.query(unlockTablesSQL);
    conn.end();
    res
      .status(200)
      .json({ message: `Заказы успешно завершены (${succededOrders}).` });
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const returnOrder = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const { organization, id: userId, roles } = req.user;
    if (!roles.returnorder) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для возврата заказов.`,
      });
    }
    const { orderId, cause } = req.body;
    const insertSQL = `INSERT INTO warehouse_${organization} SET ?`;
    const deleteInventorySQL = `DELETE FROM warehouse_${organization} WHERE id = `;
    const insertOrderInfoSQL = `INSERT INTO archiveorders_${organization} SET ?`;
    const insertOrderInfoSQL2 = `INSERT INTO orders_${organization} SET ?`;
    const deleteOrderSQL = `DELETE FROM orders_${organization} WHERE forincrement = true and NOT ?`;
    const lockTableSQL = `LOCK TABLES archiveorders_${organization} WRITE, goods_${organization} WRITE, orders_${organization} WRITE`;
    const getOrderInfoSQL = `SELECT * from archiveorders_${organization}  WHERE id = `;
    const updateOrderSQL = `UPDATE archiveorders_${organization} SET ? WHERE id = `;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    const date = new Date();
    const [insertInfoWarehouse] = await conn.query(insertSQL, {
      goods: JSON.stringify([]),
      date: new Date(date),
      type: "acceptance",
      comment: "",
    });
    const { insertId: insertIdWarehouse } = insertInfoWarehouse;
    await conn.query(deleteInventorySQL + insertIdWarehouse);
    await conn.query(lockTableSQL);
    const order = (await conn.query(getOrderInfoSQL + orderId))[0][0];
    if (!order) {
      conn.end();
      res
        .status(500)
        .json({ message: `Заказ с номером [ID: ${orderId}] не найден!` });
      return;
    }
    const { history, goods } = order;
    const now = new Date();
    if (
      order.status === "cancelled" ||
      order.status === "returned" ||
      order.wasReturned === 1
    ) {
      conn.end();
      res
        .status(400)
        .json({ message: `Отмененный или возвращенный заказ нельзя вернуть!` });
      return;
    }
    history.push({
      action: "returned",
      user: userId,
      date: now.getTime(),
      cause,
    });
    await conn.query(updateOrderSQL + orderId, {
      wasReturned: true,
      history: JSON.stringify(history),
    });
    const returnedOrder = order;
    returnedOrder.comment = "#" + returnedOrder.id;
    delete returnedOrder.id;
    delete returnedOrder.creationdate;
    returnedOrder.history = JSON.stringify([
      {
        action: "returned",
        user: userId,
        date: now.getTime(),
        cause,
      },
    ]);
    await returnGoods(goods, organization, conn, insertIdWarehouse);
    returnedOrder.goods = JSON.stringify(returnedOrder.goods);
    returnedOrder.kaspiinfo = JSON.stringify(returnedOrder.kaspiinfo);
    returnedOrder.deliveryinfo = JSON.stringify(returnedOrder.deliveryinfo);
    returnedOrder.discount = JSON.stringify(returnedOrder.discount);
    returnedOrder.payment = JSON.stringify(returnedOrder.payment);
    returnedOrder.finisheddate = now;
    returnedOrder.status = "returned";
    returnedOrder.deliverystatus = "finished";
    const [insertInfo] = await conn.query(insertOrderInfoSQL2, {
      ...returnedOrder,
      forincrement: true,
    });
    const { insertId } = insertInfo;
    await conn.query(deleteOrderSQL, { id: insertId });
    returnedOrder.id = insertId;
    await conn.query(insertOrderInfoSQL, returnedOrder);
    await conn.query(unlockTablesSQL);
    conn.end();
    res.status(200).json({ message: `Заказ успешно отменен.` });
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const cancelOrder = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const { organization, id: userId, roles } = req.user;
    if (!roles.operator) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для отмены заказов.`,
      });
    }
    const { orderId, cause } = req.body;
    const insertSQL = `INSERT INTO warehouse_${organization} SET ?`;
    const deleteInventorySQL = `DELETE FROM warehouse_${organization} where id = `;
    const deleteOrderSQL = `DELETE from orders_${organization} WHERE id = `;
    const insertOrderInfoSQL = `INSERT INTO archiveorders_${organization} SET ?`;
    const lockTableSQL = `LOCK TABLES orders_${organization} WRITE, goods_${organization} WRITE`;
    const lockTableSQL2 = `LOCK TABLES archiveorders_${organization} WRITE`;
    const getOrderInfoSQL = `SELECT * from orders_${organization} WHERE id = `;
    const updateOrderSQL = `UPDATE orders_${organization} SET ? WHERE id = `;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    const date = new Date();
    const [insertInfoWarehouse] = await conn.query(insertSQL, {
      goods: JSON.stringify([]),
      date: new Date(date),
      type: "acceptance",
      comment: "",
    });
    const { insertId: insertIdWarehouse } = insertInfoWarehouse;
    await conn.query(deleteInventorySQL + insertIdWarehouse);
    await conn.query(lockTableSQL);
    const order = (await conn.query(getOrderInfoSQL + orderId))[0][0];
    if (!order) {
      conn.end();
      res
        .status(500)
        .json({ message: `Заказ с номером [ID: ${orderId}] не найден!` });
      return;
    }
    const { history, goods } = order;
    const now = new Date();
    if (order.status === "cancelled") {
      conn.end();
      res.status(400).json({ message: `Этот заказ уже отменен!` });
      return;
    }
    await returnGoods(goods, organization, conn, insertIdWarehouse);
    if (order.deliverystatus === "delivering") {
      history.push({
        action: "cancelled",
        user: userId,
        date: now.getTime(),
        cause,
      });
      await conn.query(updateOrderSQL + orderId, {
        deliverystatus: "processing",
        history: JSON.stringify(history),
        status: "cancelled",
      });
      res.status(200).json({ message: `Заказ успешно отменен.` });
      conn.end();
      return;
    }
    history.push({
      action: "cancelled",
      user: userId,
      date: now.getTime(),
      cause,
    });
    const finishedOrder = order;
    finishedOrder.history = JSON.stringify(history);
    finishedOrder.goods = JSON.stringify(finishedOrder.goods);
    finishedOrder.kaspiinfo = JSON.stringify(finishedOrder.kaspiinfo);
    finishedOrder.deliveryinfo = JSON.stringify(finishedOrder.deliveryinfo);
    finishedOrder.discount = JSON.stringify(finishedOrder.discount);
    finishedOrder.payment = JSON.stringify(finishedOrder.payment);
    finishedOrder.finisheddate = now;
    finishedOrder.status = "cancelled";
    finishedOrder.deliverystatus =
      order.delivery === 0 ? "pickup" : "cancelled";
    await conn.query(deleteOrderSQL + orderId);
    await conn.query(unlockTablesSQL);
    await conn.query(lockTableSQL2);
    await conn.query(insertOrderInfoSQL, finishedOrder);
    await conn.query(unlockTablesSQL);
    conn.end();
    res.status(200).json({ message: `Отмена успешно оформлена.` });
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const recreateOrder = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const { organization, id: userId, roles } = req.user;
    const { orderId, cause } = req.body;
    const insertOrderInfoSQL = `INSERT INTO orders_${organization} SET ?`;
    const selectGoodSQL = `SELECT * FROM goods_${organization} WHERE ?`;
    const updateGoodSQL = `UPDATE goods_${organization} SET ? WHERE id = `;
    const deleteOrderSQL = `DELETE FROM orders_${organization} WHERE ?`;
    const lockTableSQL = `LOCK TABLES orders_${organization} WRITE`;
    const lockTableSQL2 = `LOCK TABLES goods_${organization} WRITE`;
    const unlockTablesSQL = `UNLOCK TABLES`;
    const getOrderInfoSQL = `SELECT * from orders_${organization} WHERE id = `;
    const updateOrderSQL = `UPDATE orders_${organization} SET ? WHERE id = `;
    const conn = await mysql.createConnection(dbConfig);
    await conn.query(lockTableSQL);
    connUnlock = conn;
    const order = (await conn.query(getOrderInfoSQL + orderId))[0][0];
    if (!order) {
      conn.end();
      res
        .status(500)
        .json({ message: `Заказ с номером [ID: ${orderId}] не найден!` });
      return;
    }
    if (order.status === "new") {
      conn.end();
      res.status(400).json({ message: `Нельзя пересоздать новый заказ!` });
      return;
    }
    if (order.deliverystatus === "processing") {
      conn.end();
      res
        .status(400)
        .json({ message: `Нельзя пересоздать заказ на обработке!` });
      return;
    }
    if (order.deliver !== userId) {
      if (!roles.operator) {
        await conn.end();
        return res.status(403).json({
          message: `Отказано в доступе! Вы не являетесь курьером этого заказа.`,
        });
      }
    }
    const { history } = order;
    const now = new Date();
    const oldStatus = order.status;
    const oldDeliveryStatus = order.deliverystatus;
    if (order.status === "cancelled") {
      history.push({
        action: "recreated",
        user: userId,
        date: now.getTime(),
      });
    } else {
      history.push({
        action: "refusal",
        user: order.deliver,
        date: now.getTime(),
        cause,
      });
      history.push({
        action: "recreated",
        user: userId,
        date: now.getTime(),
      });
    }
    await conn.query(updateOrderSQL + orderId, {
      deliverystatus: "processing",
      history: JSON.stringify(history),
      status: "cancelled",
    });
    const [insertInfo] = await conn.query(insertOrderInfoSQL, {
      history: JSON.stringify(history),
      goods: JSON.stringify(
        order.goods.map((item) => {
          return {
            id: item.id,
            name: item.name,
            price: item.price,
            purchase: item.purchase,
            quantity: item.quantity,
            discount: item.discount,
          };
        })
      ),
      creationdate: order.creationdate,
      delivereddate: null,
      wentdate: null,
      finisheddate: null,
      countable: order.countable,
      deliveryInfo: JSON.stringify(order.deliveryinfo),
      author: parseInt(order.author),
      comment: order.comment,
      delivery: order.delivery,
      payment: JSON.stringify(order.payment.filter((item) => item.sum !== 0)),
      discount: JSON.stringify(order.discount),
      deliverystatus: order.delivery ? "new" : "pickup",
      status: "awaiting",
      iskaspi: order?.iskaspi,
      kaspiinfo: JSON.stringify(order?.kaspiinfo ? order.kaspiinfo : {}),
    });
    const { insertId } = insertInfo;
    await conn.query(unlockTablesSQL);

    await conn.query(lockTableSQL2);
    let noGoodError = false;
    const results = [];
    await Promise.all(
      order.goods.map(async (item) => {
        const { quantity, id } = item;
        const goodInfo = (await conn.query(selectGoodSQL, { id }))[0][0];
        const remainder = goodInfo?.remainder;
        if (!remainder || remainder?.length === 0) {
          noGoodError = true;
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
                noGoodError = true;
                return;
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
        results.push({
          id,
          info: {
            remainder: result,
            piecesSold: parseInt(goodInfo.piecesSold) + quantity,
          },
        });
      })
    );
    if (noGoodError) {
      await conn.query(unlockTablesSQL);
      await conn.query(lockTableSQL);
      const orderAgain = (await conn.query(getOrderInfoSQL + orderId))[0][0];
      const { history } = orderAgain;
      let restoredHistory = [];
      if (oldStatus === "cancelled") {
        restoredHistory = history.slice(0, history.length - 1);
      } else {
        restoredHistory = history.slice(0, history.length - 2);
      }
      await conn.query(updateOrderSQL + orderId, {
        deliverystatus: oldDeliveryStatus,
        history: JSON.stringify(restoredHistory),
        status: oldStatus,
      });
      await conn.query(deleteOrderSQL, { id: insertId });
      await conn.query(unlockTablesSQL);
      conn.end();
      return res.status(400).json({
        message: "Ошибка! Товара недостаточно либо его нет в наличии.",
      });
    }
    await Promise.all(
      results.map(async (result) => {
        await conn.query(updateGoodSQL + result.id, {
          remainder: JSON.stringify(result.info.remainder),
          piecesSold: result.info.piecesSold,
        });
      })
    );
    await conn.query(unlockTablesSQL);
    conn.end();
    res.status(200).json({ message: `Заказ успешно пересоздан.` });
    return;
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const newOrder = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { organization, id: userId, roles } = req.user;
    if (!roles.manager) {
      return res.status(403).json({
        message: `Отказано в доступе! Пользователю запрещено создавать заявки.`,
      });
    }
    const { order } = req.body;
    if (Object.keys(order.delivery).length === 0 && !roles.pickup) {
      return res.status(403).json({
        message: `Отказано в доступе! Пользователю запрещено создавать заявки с самовывозом.`,
      });
    }
    const orderValidatorResult = orderValidator(order);
    if (orderValidatorResult.error) {
      return res
        .status(orderValidatorResult.status)
        .json({ message: orderValidatorResult.message });
    }
    const lockTableSQL = `LOCK TABLES goods_${organization} WRITE`;
    const unlockTablesSQL = `UNLOCK TABLES`;
    const selectGoodSQL = `SELECT * FROM goods_${organization} WHERE ?`;
    const deleteOrderSQL = `DELETE FROM orders_${organization} WHERE ?`;
    const updateGoodSQL = `UPDATE goods_${organization} SET ? WHERE id = `;
    const insertOrderSQL = `INSERT INTO orders_${organization} SET ?`;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    let noGoodError = false;
    const parsedDate = Date.parse(order.date);
    const kaspiInfo = order?.kaspiinfo;
    const [insertInfo] = await conn.query(insertOrderSQL, {
      history: JSON.stringify([
        {
          action: "created",
          user: userId,
          date: Date.now(),
        },
      ]),
      goods: JSON.stringify(
        order.goods.map((item) => {
          return {
            id: item.id,
            name: item.name,
            price: item.price,
            purchase: item.purchase,
            quantity: item.quantity,
            discount: item.discount,
          };
        })
      ),
      creationDate:
        Date.now() - parsedDate < 24 * 60 * 60 * 1000
          ? parsedDate > Date.now()
            ? new Date(parsedDate)
            : new Date()
          : new Date(parsedDate),
      countable: order.countable,
      deliveryInfo: JSON.stringify(order.delivery),
      author: parseInt(order.manager),
      comment: order.comment,
      delivery: order.isDelivery,
      payment: JSON.stringify(order.payment.filter((item) => item.sum !== 0)),
      discount: JSON.stringify(order.discount),
      deliverystatus: order.isDelivery ? "new" : "pickup",
      status: "awaiting",
      cashier: order.cashier ? order.cashier : null,
      kaspiinfo: JSON.stringify(kaspiInfo ? kaspiInfo : {}),
      iskaspi: order.iskaspi,
    });
    const { insertId } = insertInfo;

    await conn.query(lockTableSQL);
    const results = [];
    await Promise.all(
      order.goods.map(async (item) => {
        const { quantity, id } = item;
        const goodInfo = (await conn.query(selectGoodSQL, { id }))[0][0];
        const remainder = goodInfo?.remainder;
        if (!remainder || remainder?.length === 0) {
          noGoodError = true;
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
                noGoodError = true;
                return;
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
        results.push({
          id,
          info: {
            remainder: result,
            piecesSold: parseInt(goodInfo.piecesSold) + quantity,
          },
        });
      })
    );
    if (noGoodError) {
      await conn.query(unlockTablesSQL);
      await conn.query(deleteOrderSQL, { id: insertId });
      conn.end();
      return res.status(400).json({
        message: "Ошибка! Товара недостаточно либо его нет в наличии.",
      });
    }
    await Promise.all(
      results.map(async (result) => {
        await conn.query(updateGoodSQL + result.id, {
          remainder: JSON.stringify(result.info.remainder),
          piecesSold: result.info.piecesSold,
        });
      })
    );
    await conn.query(unlockTablesSQL);
    conn.end();
    res.status(200).json({ message: "OK" });
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const newOrderBitrix = async (req, res) => {
  let connUnlock = connUnlockSample;
  let assigned = 1;
  try {
    const order = {};
    const conn1 = await mysql.createConnection(dbConfig);
    const [goods_purchase] = await conn1.query(
      "SELECT id, lastpurchase FROM goods_1"
    );
    const purchases = new Map();
    goods_purchase.forEach((item) => {
      purchases.set(item.id, item.lastpurchase);
    });
    await conn1.close();
    const { deal_id } = req.query;
    const { data: deal_data } = await axios.get(
      bitrix_url + "crm.deal.get.json?ID=" + deal_id
    );
    const { data: products_data } = await axios.get(
      bitrix_url + "crm.deal.productrows.get.json?ID=" + deal_id
    );
    const { data: contact_data } = await axios.get(
      bitrix_url + "crm.contact.get.json?id=" + deal_data.result.CONTACT_ID
    );
    assigned = parseInt(deal_data.result.ASSIGNED_BY_ID);
    const { data: user_data } = await axios.get(
      bitrix_url + "user.get.json?ID=" + deal_data.result.ASSIGNED_BY_ID
    );
    const goods = [];
    await Promise.all(
      products_data.result.map(async (good) => {
        const { data: product_data } = await axios.get(
          bitrix_url + "catalog.product.get?id=" + good.PRODUCT_ID
        );
        const { data: price } = await axios.get(
          bitrix_url + "catalog.price.get?id=" + good.PRODUCT_ID
        );
        goods.push({
          id: parseInt(product_data.result.product.xmlId),
          name: product_data.result.product.name,
          price: price.result.price.price,
          discount: { type: "KZT", amount: 0 },
          purchase: purchases.get(parseInt(product_data.result.product.xmlId)),
          quantity: good.QUANTITY,
        });
      })
    );
    const delivery = {};
    const discount = { type: "KZT", amount: 0 };
    delivery.address = deal_data.result.UF_CRM_1716635505889;
    delivery.deliveryPriceForCustomer = parseInt(
      deal_data.result.UF_CRM_1716640678669
    );
    delivery.deliveryPriceForCustomer = isNaN(delivery.deliveryPriceForCustomer)
      ? 0
      : delivery.deliveryPriceForCustomer;
    delivery.deliveryPriceForDeliver = parseInt(
      deal_data.result.UF_CRM_1716640700410
    );
    delivery.deliveryPriceForDeliver = isNaN(delivery.deliveryPriceForDeliver)
      ? 0
      : delivery.deliveryPriceForDeliver;
    delivery.plannedDeliveryDate = Date.now() + 24 * 60 * 60 * 1000;
    delivery.cellphone = contact_data.result.PHONE[0].VALUE;
    order.discount = discount;
    order.goods = goods;
    order.delivery = delivery;
    order.payment = [];
    order.comment = deal_data.result.COMMENTS;
    order.manager = parseInt(user_data.result[0].UF_USR_1716644741472);
    order.manager = isNaN(order.manager) ? 3 : order.manager;
    const orderValidatorResult = orderValidator(order);
    if (orderValidatorResult.error) {
      return res
        .status(orderValidatorResult.status)
        .json({ message: orderValidatorResult.message });
    }
    const organization = 1;
    const lockTableSQL = `LOCK TABLES goods_${organization} WRITE`;
    const unlockTablesSQL = `UNLOCK TABLES`;
    const selectGoodSQL = `SELECT * FROM goods_${organization} WHERE ?`;
    const deleteOrderSQL = `DELETE FROM orders_${organization} WHERE ?`;
    const updateGoodSQL = `UPDATE goods_${organization} SET ? WHERE id = `;
    const insertOrderSQL = `INSERT INTO orders_${organization} SET ?`;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    let noGoodError = false;
    const parsedDate = new Date();
    const [insertInfo] = await conn.query(insertOrderSQL, {
      history: JSON.stringify([
        {
          action: "created",
          user: order.manager,
          date: Date.now(),
        },
      ]),
      goods: JSON.stringify(
        order.goods.map((item) => {
          return {
            id: item.id,
            name: item.name,
            price: item.price,
            purchase: item.purchase,
            quantity: item.quantity,
            discount: item.discount,
          };
        })
      ),
      creationDate: parsedDate,
      countable: true,
      deliveryInfo: JSON.stringify(order.delivery),
      author: parseInt(order.manager),
      comment: order.comment,
      delivery: true,
      payment: JSON.stringify(order.payment.filter((item) => item.sum !== 0)),
      discount: JSON.stringify(order.discount),
      deliverystatus: "new",
      status: "awaiting",
      cashier: null,
      kaspiinfo: null,
      iskaspi: false,
      bitrix_id: deal_id,
    });
    const { insertId } = insertInfo;

    await conn.query(lockTableSQL);
    const results = [];
    await Promise.all(
      order.goods.map(async (item) => {
        const { quantity, id } = item;
        const goodInfo = (await conn.query(selectGoodSQL, { id }))[0][0];
        const remainder = goodInfo?.remainder;
        if (!remainder || remainder?.length === 0) {
          noGoodError = true;
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
                noGoodError = true;
                return;
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
        results.push({
          id,
          info: {
            remainder: result,
            piecesSold: parseInt(goodInfo.piecesSold) + quantity,
          },
        });
      })
    );
    if (noGoodError) {
      await conn.query(unlockTablesSQL);
      await conn.query(deleteOrderSQL, { id: insertId });
      conn.end();
      return res.status(400).json({
        message: "Ошибка! Товара недостаточно либо его нет в наличии.",
      });
    }
    await Promise.all(
      results.map(async (result) => {
        await conn.query(updateGoodSQL + result.id, {
          remainder: JSON.stringify(result.info.remainder),
          piecesSold: result.info.piecesSold,
        });
      })
    );
    await conn.query(unlockTablesSQL);
    conn.end();
    await axios.post(
      bitrix_url + "im.notify",
      {},
      {
        params: {
          to: deal_data.result.ASSIGNED_BY_ID,
          message: "Заказ успешно добавлен в SHOP!",
        },
      }
    );
    res.status(200).json({ message: "OK" });
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    console.log(e.message);
    try {
      await axios.post(
        bitrix_url + "im.notify",
        {},
        {
          params: {
            to: assigned,
            message: "Не удалось добавить заказ в SHOP: " + e.message,
          },
        }
      );
    } catch {
      console.log("notify error");
    }
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const newOrderStraightToTheArchive = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { organization, id: userId, roles } = req.user;
    if (!roles.manager) {
      return res.status(403).json({
        message: `Отказано в доступе! Пользователю запрещено создавать заявки.`,
      });
    }
    const { order } = req.body;
    if (Object.keys(order.delivery).length === 0 && !roles.pickup) {
      return res.status(403).json({
        message: `Отказано в доступе! Пользователю запрещено создавать заявки с самовывозом.`,
      });
    }
    const orderValidatorResult = orderValidator(order);
    if (orderValidatorResult.error) {
      return res
        .status(orderValidatorResult.status)
        .json({ message: orderValidatorResult.message });
    }
    const { goods, payment, discount } = order;
    let tempSum = 0;
    goods.forEach(
      (good) =>
        (tempSum +=
          good.quantity * good.price -
          (good.discount.type === "percent"
            ? ((good.price * good.discount.amount) / 100) * good.quantity
            : good.discount.amount * good.quantity))
    );
    const sum = tempSum;
    const sumWithDiscount =
      sum -
      (discount.type === "percent"
        ? (sum * discount.amount) / 100
        : discount.amount);
    let paymentTempSum = 0;
    payment.forEach((item) => {
      paymentTempSum += item.sum;
    });
    const paymentSum = paymentTempSum;
    const difference = paymentSum - sumWithDiscount;
    if (difference > 0) {
      return res.status(400).json({ message: `Переплата!` });
    }
    if (difference < 0) {
      return res.status(400).json({ message: `Недоплата` });
    }
    const lockTableSQL = `LOCK TABLES goods_${organization} WRITE`;
    const lockTableSQL2 = `LOCK TABLES cashboxes_${organization} WRITE, orders_${organization} WRITE`;
    const getCashboxSQL = `SELECT * FROM cashboxes_${organization} WHERE open = true and responsible = ${userId} LIMIT 1`;
    const updateCashboxSQL = `UPDATE cashboxes_${organization} SET ? WHERE id = `;
    const unlockTablesSQL = `UNLOCK TABLES`;
    const selectGoodSQL = `SELECT * FROM goods_${organization} WHERE ?`;
    const deleteOrderSQL = `DELETE FROM orders_${organization} WHERE forincrement = true AND NOT ?`;
    const updateGoodSQL = `UPDATE goods_${organization} SET ? WHERE id = `;
    const insertOrderSQL = `INSERT INTO orders_${organization} SET ?`;
    const getOrderInfoSQL = `SELECT * FROM orders_${organization} WHERE id = `;
    const insertOrderArchiveSQL = `INSERT INTO archiveorders_${organization} SET ?`;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    let noGoodError = false;
    const parsedDate = Date.now();

    const [insertInfo] = await conn.query(insertOrderSQL, {
      history: JSON.stringify([
        {
          action: "created",
          user: userId,
          date: Date.now(),
        },
      ]),
      goods: JSON.stringify(
        order.goods.map((item) => {
          return {
            id: item.id,
            name: item.name,
            price: item.price,
            purchase: item.purchase,
            quantity: item.quantity,
            discount: item.discount,
          };
        })
      ),
      creationDate:
        Date.now() - parsedDate < 24 * 60 * 60 * 1000
          ? parsedDate > Date.now()
            ? new Date(parsedDate)
            : new Date()
          : new Date(parsedDate),
      countable: order.countable,
      deliveryInfo: JSON.stringify(order.delivery),
      author: parseInt(order.manager),
      comment: order.comment,
      delivery: order.isDelivery,
      payment: JSON.stringify(order.payment.filter((item) => item.sum !== 0)),
      discount: JSON.stringify(order.discount),
      deliverystatus: order.isDelivery ? "new" : "pickup",
      status: "awaiting",
      cashier: order?.cashier ? order.cashier : null,
      forincrement: true,
    });
    const { insertId } = insertInfo;
    await conn.query(lockTableSQL);
    const results = [];
    await Promise.all(
      order.goods.map(async (item) => {
        const { quantity, id } = item;
        const goodInfo = (await conn.query(selectGoodSQL, { id }))[0][0];
        const remainder = goodInfo?.remainder;
        if (!remainder || remainder?.length === 0) {
          noGoodError = true;
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
                noGoodError = true;
                return;
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
        results.push({
          id,
          info: {
            remainder: result,
            piecesSold: parseInt(goodInfo.piecesSold) + quantity,
          },
        });
      })
    );
    if (noGoodError) {
      await conn.query(unlockTablesSQL);
      await conn.query(deleteOrderSQL, { id: insertId });
      await conn.end();
      return res.status(400).json({
        message: "Ошибка! Товара недостаточно либо его нет в наличии.",
      });
    }
    await conn.query(unlockTablesSQL);
    await conn.query(lockTableSQL2);
    const cashbox = (await conn.query(getCashboxSQL))[0][0];
    if (!cashbox) {
      await conn.query(deleteOrderSQL, { id: insertId });
      await conn.query(unlockTablesSQL);
      return res
        .status(400)
        .json({ message: "Нет открытых касс на этом аккаунте." });
    }
    const date = Date.now();
    const { cash } = cashbox;
    payment.forEach((item) => {
      cash.push({
        type: "sale",
        amount: item.sum,
        method: item.method,
        comment: "",
        date,
      });
    });
    await conn.query(updateCashboxSQL + cashbox.id, {
      cash: JSON.stringify(cash),
    });
    await conn.query(unlockTablesSQL);
    const insertedOrder = (await conn.query(getOrderInfoSQL + insertId))[0][0];
    const { history: insertedHistory } = insertedOrder;
    const now = new Date();
    insertedHistory.push({
      action: "issued",
      user: userId,
      date: now.getTime(),
    });
    insertedHistory.push({
      action: "finished",
      user: userId,
      date: now.getTime(),
    });
    const finishedOrder = insertedOrder;
    finishedOrder.history = JSON.stringify(insertedHistory);
    finishedOrder.goods = JSON.stringify(finishedOrder.goods);
    finishedOrder.kaspiinfo = JSON.stringify(finishedOrder.kaspiinfo);
    finishedOrder.deliveryinfo = JSON.stringify(finishedOrder.deliveryinfo);
    finishedOrder.discount = JSON.stringify(finishedOrder.discount);
    finishedOrder.payment = JSON.stringify(finishedOrder.payment);
    finishedOrder.finisheddate = now;
    finishedOrder.wentdate = now;
    finishedOrder.delivereddate = now;
    finishedOrder.status = "finished";
    finishedOrder.deliverystatus = "finished";
    finishedOrder.forincrement = false;
    await conn.query(deleteOrderSQL, { id: insertId });
    await conn.query(insertOrderArchiveSQL, finishedOrder);
    await Promise.all(
      results.map(async (result) => {
        await conn.query(updateGoodSQL + result.id, {
          remainder: JSON.stringify(result.info.remainder),
          piecesSold: result.info.piecesSold,
        });
      })
    );
    conn.end();
    res
      .status(200)
      .json({ message: "OK", receiptId: insertId, receiptDate: now.getTime() });
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const editOrder = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { organization, id: userId, roles } = req.user;
    if (!roles.editorder) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для редактирования заявок.`,
      });
    }
    const { order: editedOrder, orderId } = req.body;
    const orderValidatorResult = orderValidator(editedOrder);
    if (orderValidatorResult.error) {
      return res
        .status(orderValidatorResult.status)
        .json({ message: orderValidatorResult.message });
    }
    const insertSQL = `INSERT INTO warehouse_${organization} SET ?`;
    const deleteInventorySQL = `DELETE FROM warehouse_${organization} where id = `;
    const lockTablesSQL = `LOCK TABLES goods_${organization} WRITE, orders_${organization} WRITE, warehouse_${organization} WRITE`;
    const unlockTablesSQL = `UNLOCK TABLES`;
    const selectGoodSQL = `SELECT * FROM goods_${organization} WHERE ?`;
    const updateGoodSQL = `UPDATE goods_${organization} SET ? WHERE id = `;
    const updateOrderSQL = `UPDATE orders_${organization} SET ? WHERE id = `;
    const selectOrderSQL = `SELECT * FROM orders_${organization} WHERE ?`;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    const date = new Date();
    const [insertInfoWarehouse] = await conn.query(insertSQL, {
      goods: JSON.stringify([]),
      date: new Date(date),
      type: "acceptance",
      comment: "",
    });
    const { insertId: insertIdWarehouse } = insertInfoWarehouse;
    await conn.query(deleteInventorySQL + insertIdWarehouse);
    await conn.query(lockTablesSQL);
    const order = (await conn.query(selectOrderSQL, { id: orderId }))[0][0];
    if (!order) {
      conn.end();
      res.status(400).json({
        message: `Нельзя отредактировать этот заказ! Заказ не найден!`,
      });
      return;
    }
    // if (order.status !== "awaiting") {
    //   conn.end();
    //   res.status(400).json({
    //     message: `Нельзя отредактировать этот заказ! Статус заказа должен быть [ОЖИДАЕТ ВЫДАЧИ]!`,
    //   });
    //   return;
    // }
    if (
      order.deliverystatus !== "pickup" &&
      Object.keys(editedOrder.delivery).length === 0
    ) {
      conn.end();
      res.status(400).json({
        message: `Нельзя поменять доставку на самовывоз!`,
      });
      return;
    }
    if (
      order.deliverystatus === "pickup" &&
      Object.keys(editedOrder.delivery).length !== 0
    ) {
      conn.end();
      res.status(400).json({
        message: `Нельзя поменять самовывоз на доставку!`,
      });
      return;
    }
    const { history, goods } = order;
    const difference = [];
    editedOrder.goods.forEach((editedGood) => {
      const editedQuantity = parseInt(editedGood.quantity);
      for (let good of goods) {
        if (editedGood.id === good.id) {
          const quantity = parseInt(good.quantity);
          difference.push({
            id: good.id,
            quantity: editedQuantity - quantity,
            purchase: good.purchase,
          });
          return;
        }
      }
      difference.push({
        id: editedGood.id,
        quantity: editedQuantity,
        purchase: editedGood.purchase,
      });
    });
    const niggativeResults = [];
    const results = [];
    let noGoodError = false;
    await Promise.all(
      difference.map(async (item) => {
        const goodInfo = (
          await conn.query(selectGoodSQL, { id: item.id })
        )[0][0];
        const remainder = goodInfo?.remainder ? goodInfo.remainder : [];
        const temp = remainder.reverse();
        if (item.quantity < 0) {
          niggativeResults.push({
            id: item.id,
            quantity: Math.abs(item.quantity),
            purchase: item.purchase,
          });
        } else if (item.quantity > 0) {
          const quantity = item.quantity;
          if (temp.length === 0) {
            noGoodError = true;
            return;
          }
          const difference = parseInt(temp[0].quantity) - quantity;
          let lastDifference = 0 + difference;
          if (difference >= 0) {
            temp[0].quantity = difference;
          } else {
            temp[0].quantity = 0;
            for (let i = 1; i <= temp.length; i++) {
              if (!temp[i]) {
                if (lastDifference < 0) {
                  noGoodError = true;
                  return;
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
          results.push({
            id: item.id,
            info: {
              remainder: result,
              piecesSold: parseInt(goodInfo.piecesSold) + quantity,
            },
          });
        }
      })
    );
    if (noGoodError) {
      await conn.query(unlockTablesSQL);
      conn.end();
      return res.status(400).json({
        message: "Ошибка! Товара недостаточно либо его нет в наличии.",
      });
    }
    await conn.query(updateOrderSQL + orderId, {
      history: JSON.stringify([
        ...history,
        {
          action: "edited",
          user: userId,
          date: Date.now(),
        },
      ]),
      goods: JSON.stringify(
        editedOrder.goods.map((item) => {
          return {
            id: item.id,
            name: item.name,
            price: item.price,
            purchase: item.purchase,
            quantity: item.quantity,
            discount: item.discount,
          };
        })
      ),
      countable: editedOrder.countable,
      deliveryInfo: JSON.stringify(editedOrder.delivery),
      author: parseInt(editedOrder.manager),
      comment: editedOrder.comment,
      delivery: editedOrder.isDelivery,
      payment: JSON.stringify(
        editedOrder.payment.filter((item) => item.sum !== 0)
      ),
      discount: JSON.stringify(editedOrder.discount),
    });
    await returnGoods(niggativeResults, organization, conn, insertIdWarehouse);
    await Promise.all(
      results.map(async (result) => {
        await conn.query(updateGoodSQL + result.id, {
          remainder: JSON.stringify(result.info.remainder),
          piecesSold: result.info.piecesSold,
        });
      })
    );
    await conn.query(unlockTablesSQL);
    conn.end();
    res.status(200).json({ message: "OK" });
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const editManager = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { organization, id: userId, roles } = req.user;
    if (!roles.editorder) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для редактирования заявок.`,
      });
    }
    const { managerId, orderId } = req.body;
    const selectUserSQL = `SELECT * FROM users WHERE id = '${managerId}'`;
    const lockTablesSQL = `LOCK TABLES archiveorders_${organization} WRITE, orders_${organization} WRITE`;
    const unlockTablesSQL = `UNLOCK TABLES`;
    const updateOrderSQL = `UPDATE orders_${organization} SET ? WHERE id = `;
    const updateArchiveOrderSQL = `UPDATE archiveorders_${organization} SET ? WHERE id = `;
    const selectOrderSQL = `SELECT * FROM orders_${organization} WHERE forincrement = false AND ?`;
    const selectArchiveOrderSQL = `SELECT * FROM archiveorders_${organization} WHERE ?`;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    const user = (await conn.query(selectUserSQL))[0][0];
    if (!user) {
      if (managerId !== -1) {
        conn.end();
        res.status(400).json({
          message: `Пользователь не найден!`,
        });
        return;
      }
    }
    await conn.query(lockTablesSQL);
    const order = (await conn.query(selectOrderSQL, { id: orderId }))[0][0];
    const archiveOrder = (
      await conn.query(selectArchiveOrderSQL, { id: orderId })
    )[0][0];
    if (!order && !archiveOrder) {
      conn.end();
      await conn.query(unlockTablesSQL);
      res.status(400).json({
        message: `Нельзя отредактировать этот заказ! Заказ не найден!`,
      });
      return;
    }
    const isArchive = !order;
    const { history } = isArchive ? archiveOrder : order;
    await conn.query(
      (isArchive ? updateArchiveOrderSQL : updateOrderSQL) + `'${orderId}'`,
      {
        history: JSON.stringify([
          ...history,
          {
            action: "edited",
            user: userId,
            date: Date.now(),
          },
        ]),
        author: parseInt(managerId),
      }
    );
    await conn.query(unlockTablesSQL);
    conn.end();
    res.status(200).json({ message: "OK" });
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const editDeliver = async (req, res) => {
  let connUnlock = connUnlockSample;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Ошибка!", errors });
    }
    const { organization, id: userId, roles } = req.user;
    if (!roles.editorder) {
      return res.status(403).json({
        message: `Отказано в доступе! У вас нет прав для редактирования заявок.`,
      });
    }
    const { deliverId, orderId } = req.body;
    const selectUserSQL = `SELECT * FROM users WHERE id = '${deliverId}'`;
    const lockTablesSQL = `LOCK TABLES orders_${organization} WRITE`;
    const unlockTablesSQL = `UNLOCK TABLES`;
    const updateOrderSQL = `UPDATE orders_${organization} SET ? WHERE id = `;
    const selectOrderSQL = `SELECT * FROM orders_${organization} WHERE ?`;
    const conn = await mysql.createConnection(dbConfig);
    connUnlock = conn;
    const user = (await conn.query(selectUserSQL))[0][0];
    if (!user) {
      conn.end();
      res.status(400).json({
        message: `Пользователь не найден!`,
      });
      return;
    }
    await conn.query(lockTablesSQL);
    const order = (await conn.query(selectOrderSQL, { id: orderId }))[0][0];
    if (!order) {
      conn.end();
      conn.query(unlockTablesSQL);
      res.status(400).json({
        message: `Нельзя отредактировать этот заказ! Заказ не найден!`,
      });
      return;
    }
    if (
      order.status !== "awaiting" &&
      (order.deliverystatus !== "delivering" ||
        order.deliverystatus !== "waiting")
    ) {
      conn.end();
      conn.query(unlockTablesSQL);
      res.status(400).json({
        message: `Нельзя отредактировать этот заказ! Заказ должен быть на доставке.`,
      });
      return;
    }
    const { history } = order;
    await conn.query(updateOrderSQL + orderId, {
      history: JSON.stringify([
        ...history,
        {
          action: "edited",
          user: userId,
          date: Date.now(),
        },
      ]),
      deliver: parseInt(deliverId),
    });
    await conn.query(unlockTablesSQL);
    conn.end();
    res.status(200).json({ message: "OK" });
  } catch (e) {
    connUnlock.query(unlockTablesSQL);
    connUnlock.end();
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};

export const isThereOrder = async (req, res) => {
  try {
    const { organization } = req.user;
    const { id } = req.body;
    const conn = await mysql.createConnection(dbConfig);
    const order = (
      await conn.query(
        `SELECT * FROM archiveorders_${organization} WHERE forincrement = false AND id = ${id}`
      )
    )[0][0];
    conn.end();
    if (!order) {
      return res.status(400).json({ message: "Заказ не найден!" });
    }
    if (order.status === "cancelled") {
      return res.status(400).json({ message: "Этот заказ был отменен!" });
    }
    return res.status(200).json({ message: "Заказ найден!" });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Ошибка сервера: " + e });
  }
};
