import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";

import connectD from "./ConnectDb/ConnectDB.js";
import Userroute from "./Route/UserRoute.js";
import TaskRoute from "./Route/TaskRoute.js";
import withdrawRoute from "./Route/Withdraw.js";
import depositRoute from "./Route/Deposit.js";
import DepositPollingService from "./Utils/DepositPollingService.js";

import Error from "./MiddleWare/Error.js";

process.on("uncaughtException", (err) => {
  console.error(`Uncaught exception: ${err.message}`);
  process.exit(1);
});

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
app.use(express.json());

app.use(
  cors({
    origin: ["https://bmx-frontend.vercel.app", "http://localhost:5174","https://bmxadventure.com","https://www.bmxadventure.com"],
    credentials: true,
  })
);

app.get("/", (req, res) => {
  res.send("Backend is running.......");
});

app.use(cookieParser());

app.use("/api/v1", Userroute);
app.use("/api/v1", TaskRoute);
app.use("/api/v1", withdrawRoute);
app.use("/api/v1/deposit", depositRoute);

app.use(Error);

const Server = app.listen(PORT, () => {
  console.log(`Server is runing on ${PORT}`);
  connectD();
  
  // Start deposit polling service
  DepositPollingService.start();
});

process.on("unhandledRejection", (err) => {
  console.log("Server rejected");
  console.error(`Unhandled Rejection: ${err.message}`);
  Server.close(() => {
    process.exit(1);
  });
});
