import express from "express";
import {
  addFeedback,
  convertPoints,
  convertReferredPoints,
  DailyClaim,
  deleteUser,
  forgotPasswordOTP,
  getallusers,
  getReferredUserData,
  investment,
  Login,
  Logout,
  Myprofile,
  resetPassword,
  Signup,
  updateEligibilityCriteria,
  updatePass,
  updateUserRole,
  uploadPaymentImage,
  verifyOTP,
  verifyUser,
} from "../Controller/UserController.js";
import { isUserLoggedin } from "../Utils/Auth.js";
import upload from "../Utils/multerConfig.js";

const Router = express.Router();

Router.post("/signup", Signup);
Router.post("/verify-user", verifyUser);
Router.post("/login", Login);
Router.post("/logout", isUserLoggedin, Logout);
Router.get("/profile", isUserLoggedin, Myprofile);
Router.put("/updatePass", isUserLoggedin, updatePass);
Router.get("/points", isUserLoggedin, DailyClaim);
Router.get("/getRef", isUserLoggedin, getReferredUserData);
Router.post("/feedBack", isUserLoggedin, addFeedback);
Router.post("/investment", isUserLoggedin, investment);
Router.put("/convert-points/:id", isUserLoggedin, convertPoints);
Router.put("/refConvert-points/:id", isUserLoggedin, convertReferredPoints);
Router.get("/users", isUserLoggedin, getallusers);

Router.post("/forgot-password-otp",forgotPasswordOTP);
Router.post("/verify-otp",verifyOTP);
Router.put("/reset-password",resetPassword);

Router.put("/upload-payment-image",isUserLoggedin,upload.single('paymentImage'),uploadPaymentImage);
Router.put("/update-eligibility-criteria/:userId",isUserLoggedin,updateEligibilityCriteria);
Router.put("/update-user-role/:userId",isUserLoggedin,updateUserRole);
Router.delete("/delete-user/:userId",isUserLoggedin,deleteUser);

export default Router;