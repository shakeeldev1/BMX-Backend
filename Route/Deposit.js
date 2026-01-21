import express from "express";
import {
  createDepositIntent,
  getDepositStatus,
  getUserDepositHistory,
  getAllDeposits,
} from "../Controller/DepositController.js";
import { isUserLoggedin } from "../Utils/Auth.js";

const Router = express.Router();

Router.post("/create", isUserLoggedin, createDepositIntent);
Router.get("/status", isUserLoggedin, getDepositStatus);
Router.get("/history", isUserLoggedin, getUserDepositHistory);
Router.get("/all", isUserLoggedin, getAllDeposits);

export default Router;
