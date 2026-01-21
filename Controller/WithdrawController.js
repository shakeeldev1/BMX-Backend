import { catchAsyncError } from "../MiddleWare/CatchAsyncError.js";
import WithdrawModel from "../Model/WithdrawModel.js";
import UserModel from "../Model/UserModel.js";
import mongoose from "mongoose";
import SendMail from "../Utils/SendMail.js";
import BinanceService from "../Utils/BinanceService.js";


export const withdrawRequest = catchAsyncError(async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { amount, walletAddress, network } = req.body;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized request." });
    }

    if (!amount || amount < 100) {
      return res.status(400).json({
        success: false,
        message: "Minimum withdrawal amount is 100 PKR.",
      });
    }

    // Validate wallet address
    if (!walletAddress || walletAddress.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Wallet address is required.",
      });
    }

    // Validate network
    const validNetwork = network || "TRC20";
    if (validNetwork !== "TRC20" && validNetwork !== "TRX") {
      return res.status(400).json({
        success: false,
        message: "Only TRC20 network is supported.",
      });
    }

    // Fetch user details
    const user = await UserModel.findById(userId);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const referralCount = Array.isArray(user.referrals)
      ? user.referrals.length
      : 0;

    // EXISTING BUSINESS LOGIC - DO NOT CHANGE
    if (
      (amount === 100 && referralCount < 1) ||
      (amount === 150 && referralCount < 1) ||
      (amount === 500 && referralCount < 3) ||
      (amount === 1000 && referralCount < 5)
    ) {
      return res.status(400).json({
        success: false,
        message: "Withdrawal conditions not met. Check referral requirements.",
      });
    }

    if (user.convertedPointsInPKR < amount) {
      return res
        .status(400)
        .json({ success: false, message: "Insufficient balance." });
    }

    // Deduct balance immediately
    user.convertedPointsInPKR -= amount;
    await user.save();
    console.log("User balance after withdrawal:", user.convertedPointsInPKR);

    // Process withdrawal via Binance
    let binanceTxId = null;
    let binanceStatus = "pending";
    let withdrawalStatus = "Processing";

    try {
      // Convert PKR to USDT (assuming 1 PKR = some USDT rate)
      // For now, we'll use 1:1 ratio, but you should implement proper conversion
      const usdtAmount = amount; // TODO: Implement proper PKR to USDT conversion

      const binanceResult = await BinanceService.createWithdrawal(
        walletAddress,
        usdtAmount,
        validNetwork === "TRC20" ? "TRX" : validNetwork
      );

      binanceTxId = binanceResult.id;
      binanceStatus = "processing";
      
      console.log("Binance withdrawal initiated:", binanceTxId);
    } catch (binanceError) {
      console.error("Binance withdrawal error:", binanceError);
      
      // If Binance fails, refund the user
      user.convertedPointsInPKR += amount;
      await user.save();

      return res.status(500).json({
        success: false,
        message: "Failed to process withdrawal. Please try again later.",
        error: binanceError.message,
      });
    }

    // Create withdrawal record
    await WithdrawModel.create({
      userId,
      amount,
      walletAddress,
      network: validNetwork,
      binanceTxId,
      binanceStatus,
      status: withdrawalStatus,
    });

    // Send email to the user
    const userEmail = user.email;
    const userSubject = "Withdrawal Request Submitted";
    const userText = `Dear ${user.name},

We have received your withdrawal request of ${amount} PKR (${amount} USDT).

Withdrawal Details:
- Amount: ${amount} USDT
- Wallet Address: ${walletAddress}
- Network: ${validNetwork}
- Transaction ID: ${binanceTxId}

Your withdrawal is being processed and will be completed shortly.

If you have any queries, feel free to contact our support team.

Best regards,
BMX Adventure Team`;

    await SendMail(userEmail, userSubject, userText);

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminSubject = "New Withdrawal Request Submitted";
    const adminText = `Hello Admin,

A new withdrawal request has been submitted and is being processed via Binance.

User: ${user.name}
Email: ${user.email}
Amount: ${amount} PKR (${amount} USDT)
Wallet Address: ${walletAddress}
Network: ${validNetwork}
Binance Transaction ID: ${binanceTxId}

Best regards,
BMX Adventure System`;

    await SendMail(adminEmail, adminSubject, adminText);

    return res.status(200).json({
      success: true,
      message:
        "Withdrawal request submitted successfully. Your funds will be sent to your wallet shortly.",
      binanceTxId,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});


export const getAllWithdrawRequests = catchAsyncError(
  async (req, res, next) => {
    const { page = 1, limit = 10, status } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const withdrawRequests = await WithdrawModel.find()
      .populate("userId", "name email balance")
      .sort({ requestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalRequests = await WithdrawModel.countDocuments(query);
    res.status(200).json({
      success: true,
      totalRequests,
      page: parseInt(page),
      limit: parseInt(limit),
      data: withdrawRequests,
    });
  }
);

export const updateWithdrawStatus = catchAsyncError(async (req, res, next) => {
  const { withdrawId } = req.params;
  const { status } = req.body;

  try {
    if (!status || !["Pending", "Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (!mongoose.Types.ObjectId.isValid(withdrawId)) {
      return res
        .status(400)
        .json({ message: "Invalid withdrawal request ID format." });
    }

    const updatedRequest = await WithdrawModel.findByIdAndUpdate(
      withdrawId,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ message: "Withdrawal request not found" });
    }

    const user = await UserModel.findById(updatedRequest.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userEmail = user.email;
    const userSubject = `Your Withdrawal Request Status Update`;
    let userText = `Dear ${user.name},\n\n`;

    if (status === "Approved") {
      userText += `Congratulations! Your withdrawal request of ${updatedRequest.amount} PKR has been approved. The amount will be processed shortly.\n\n`;
    } else if (status === "Rejected") {
      userText += `Unfortunately, your withdrawal request of ${updatedRequest.amount} PKR has been rejected. Please contact support for further details.\n\n`;
    } else {
      userText += `Your withdrawal request of ${updatedRequest.amount} PKR is currently pending. Our team will review and update you soon.\n\n`;
    }

    userText += `Best regards,\n BMX Adventure Team`;

    await SendMail(userEmail, userSubject, userText);

    res.status(200).json({
      success: true,
      message: `Withdrawal request ${status} successfully.`,
      updatedRequest,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});